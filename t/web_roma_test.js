'use strict';

// ブラウザ（ヘッドレス Chrome）で roma（ローマ字）表示の退行を検証する回帰テスト。
//
// 背景: 検索UI改修（Issue #1 / PR #5）で、銀行・支店カードに従来表示されていた
// `bank.roma` / `branch.roma` の行が消えてしまう退行があった。これを再発させないため、
// 実際のブラウザでカードの `.result-roma` 行の有無を検証する。
//
// 前提: Chrome が `/usr/bin/google-chrome` または macOS アプリとして存在すること。
// 存在しない環境では自身をスキップする。データはテスト用 fixture を一時配置する。

const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const repoRoot = resolve(__dirname, '..');

// Chrome のパスを検出
const CHROME_CANDIDATES = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    process.env.CHROME_BIN,
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chromePath) {
    console.log('Chrome が見つからないため roma 回帰テストをスキップ');
    process.exit(0);
}

const HTTP_PORT = 8645;
const CDP_PORT = 9341;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const v = await fn();
            if (v) return v;
        } catch (e) { /* retry */ }
        await sleep(200);
    }
    throw new Error('timeout waiting for ' + label);
}

function processExited(child) {
    return child.exitCode !== null || child.signalCode !== null;
}

function waitForProcessExit(child, timeoutMs) {
    if (processExited(child)) return Promise.resolve(true);

    return new Promise((resolve) => {
        let settled = false;
        const onExit = () => finish(true);
        const timer = setTimeout(() => finish(processExited(child)), timeoutMs);
        const finish = (exited) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            child.removeListener('exit', onExit);
            resolve(exited);
        };

        child.once('exit', onExit);
        if (processExited(child)) finish(true);
    });
}

async function stopProcess(child, label) {
    if (processExited(child)) return { exited: true, forced: false };

    let signalError;
    try {
        child.kill('SIGTERM');
    } catch (e) {
        signalError = e;
    }
    if (await waitForProcessExit(child, 5000)) {
        return { exited: true, forced: false };
    }

    try {
        child.kill('SIGKILL');
    } catch (e) {
        signalError = signalError || e;
    }
    const exited = await waitForProcessExit(child, 5000);
    return {
        exited,
        forced: true,
        error: exited
            ? null
            : `${label} did not exit after SIGTERM/SIGKILL${signalError ? `: ${signalError.message}` : ''}`,
    };
}

async function removeDirectoryWithRetry(directory, label) {
    const deadline = Date.now() + 10000;
    const retryableCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);
    let lastError;

    while (Date.now() < deadline) {
        try {
            rmSync(directory, {
                recursive: true,
                force: true,
                maxRetries: 5,
                retryDelay: 200,
            });
            return true;
        } catch (e) {
            lastError = e;
            if (!retryableCodes.has(e.code)) break;
            await sleep(250);
        }
    }

    console.warn(`cleanup warning: ${label} を削除できませんでした: ${lastError ? lastError.message : 'unknown error'}`);
    return false;
}

class Cdp {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.id = 0;
        this.pending = new Map();
        this.exceptions = [];
        this.ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            } else if (msg.method && msg.method === 'Runtime.exceptionThrown') {
                const d = msg.params.exceptionDetails;
                this.exceptions.push((d.exception && d.exception.description) || d.text);
            }
        });
    }
    async ready() {
        if (this.ws.readyState === 1) return;
        await new Promise((resolve, reject) => {
            this.ws.addEventListener('open', resolve, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });
    }
    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression) {
        const res = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (res.exceptionDetails) {
            throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails));
        }
        return res.result.value;
    }
    close() { this.ws.close(); }
}

const failures = [];
const processFailures = [];
function recordProcessFailure(label, detail) {
    const message = `${label}: ${detail}`;
    if (!processFailures.includes(message)) processFailures.push(message);
}

function monitorProcess(child, label) {
    const state = { expectedTermination: false };
    child.on('error', (e) => {
        if (!state.expectedTermination) recordProcessFailure(label, `process error (${e.message})`);
    });
    child.on('exit', (code, signal) => {
        if (!state.expectedTermination) {
            recordProcessFailure(label, `unexpected exit (code=${code}, signal=${signal})`);
        }
    });
    return state;
}

function check(label, cond, detail) {
    if (!cond) failures.push(label + (detail ? ': ' + JSON.stringify(detail) : ''));
    console.log((cond ? 'ok   ' : 'FAIL ') + label + (cond ? '' : ' -> ' + JSON.stringify(detail)));
}

function writeFixture(tmpWeb) {
    const dataDir = join(tmpWeb, 'data');
    const branchesDir = join(dataDir, 'branches');
    const revision = process.env.TEST_REVISION_FAILURE
        ? 'not-a-sha'
        : '647513f71c69505e09deb7a1da1717ec22dabedc';
    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(branchesDir, { recursive: true });
    writeFileSync(join(dataDir, 'revision'), revision + '\n');
    if (!process.env.TEST_UPDATED_AT_FAILURE && !process.env.TEST_REVISION_FAILURE) {
        writeFileSync(join(dataDir, 'updated_at'), '20260630\n');
    }
    writeFileSync(join(dataDir, 'banks.json'), JSON.stringify({
        '0001': { code: '0001', name: 'みずほ', kana: 'ミズホ', hira: 'みずほ', roma: 'mizuho' },
        '0005': { code: '0005', name: '三菱ＵＦＪ', kana: 'ミツビシユ－エフジエイ', hira: 'みつびしゆ－えふじえい', roma: 'mitsubishiyu-efujiei' },
        '0006': { code: '0006', name: '三菱信託', kana: 'ミツビシシンタク', hira: 'みつびししんたく', roma: 'mitsubishishintaku' }
    }));
    writeFileSync(join(branchesDir, '0001.json'), JSON.stringify({
        '001': { code: '001', name: '東京営業部', kana: 'トウキヨウ', hira: 'とうきよう', roma: 'toukiyou' }
    }));
}

(async () => {
    // web/ を一時ディレクトリへコピーし、テスト用データを配置する。
    const tmpWeb = mkdtempSync(join(tmpdir(), 'zengin-roma-'));
    cpSync(join(repoRoot, 'web'), tmpWeb, { recursive: true });
    writeFixture(tmpWeb);

    const httpServer = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
        cwd: tmpWeb,
        stdio: 'ignore',
    });
    const httpServerState = monitorProcess(httpServer, 'HTTP server');

    const chromeProfile = mkdtempSync(join(tmpdir(), 'zengin-roma-cp-'));
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${chromeProfile}`,
        'about:blank',
    ], { stdio: 'ignore' });
    const chromeState = monitorProcess(chrome, 'Chrome');
    let cdp;

    try {
        await waitFor(async () => {
            const res = await fetch(`http://127.0.0.1:${HTTP_PORT}/index.html`);
            return res.ok;
        }, 10000, 'http server');

        const target = await waitFor(async () => {
            const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
            const list = await res.json();
            return list.find(t => t.type === 'page');
        }, 10000, 'cdp target');

        cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
            source: "window.ZenginDataConfig = { baseUrl: 'data' };"
        });
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
        await sleep(1500);

        const updatedAt = await cdp.eval(`document.getElementById('data-updated-at').textContent`);
        if (process.env.TEST_REVISION_FAILURE) {
            check('revision失敗時に更新日を利用不可表示にする', updatedAt.includes('取得できません'), updatedAt);
            await cdp.eval(`(async () => {
                const input = document.getElementById('bank-input');
                input.value = 'みずほ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await new Promise(r => setTimeout(r, 400));
            })()`);
            const revisionError = await cdp.eval(`document.getElementById('error-message').textContent`);
            check('revision失敗時に銀行データ取得を止める', revisionError.includes('最新データの確認に失敗'), revisionError);
            check('revision失敗時に銀行結果を表示しない', await cdp.eval(`document.getElementById('bank-results').classList.contains('hidden')`));
        } else if (process.env.TEST_UPDATED_AT_FAILURE) {
            check('updated_at失敗時に更新日を利用不可表示にする', updatedAt.includes('取得できません'), updatedAt);
        } else {
            check('データ更新日が表示される', updatedAt.includes('2026年6月30日'), updatedAt);
        }

        if (!process.env.TEST_REVISION_FAILURE) {
            // 銀行検索（複数件 → カード一覧）で roma 行が表示される
            const bankRoma = await cdp.eval(`(async () => {
            const input = document.getElementById('bank-input');
            input.value = '三菱';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 800));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            const results = document.getElementById('bank-results');
            const romaLines = results.querySelectorAll('.result-roma');
            return {
                visible: !results.classList.contains('hidden'),
                cardCount: results.querySelectorAll('.result-item').length,
                romaCount: romaLines.length,
                sample: romaLines[0] ? romaLines[0].textContent : null,
            };
            })()`);
            check('銀行検索で複数カードが出る', bankRoma.cardCount >= 2, bankRoma);
            check('銀行カードに roma 行がある', bankRoma.romaCount >= 1, bankRoma);
            check('銀行カードの roma に値がある', bankRoma.sample && bankRoma.sample.trim().length > 0, bankRoma);

            // 支店検索（複数件）で roma 行が表示される
            const branchRoma = await cdp.eval(`(async () => {
            const selectedVisible = !document.getElementById('selected-bank').classList.contains('hidden');
            if (!selectedVisible) {
                const input = document.getElementById('bank-input');
                input.value = 'みずほ';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 800));
                // インクリメンタル候補の先頭を選択（みずほ = 0001）
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                await new Promise(r => setTimeout(r, 400));
            }
            const bInput = document.getElementById('branch-input');
            bInput.value = '東京';
            bInput.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 800));
            bInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await new Promise(r => setTimeout(r, 400));
            const results = document.getElementById('branch-results');
            const romaLines = results.querySelectorAll('.result-roma');
            return {
                visible: !results.classList.contains('hidden'),
                cardCount: results.querySelectorAll('.result-item').length,
                romaCount: romaLines.length,
                sample: romaLines[0] ? romaLines[0].textContent : null,
            };
            })()`);
            check('支店検索でカードが出る', branchRoma.cardCount >= 1, branchRoma);
            check('支店カードに roma 行がある', branchRoma.romaCount >= 1, branchRoma);
            check('支店カードの roma に値がある', branchRoma.sample && branchRoma.sample.trim().length > 0, branchRoma);
        }

        // ページ読み込み時の JS 例外がない
        check('ページ読み込み時の JS 例外がない', cdp.exceptions.length === 0, cdp.exceptions);

    } finally {
        // cleanup開始前に既に終了していた場合は、終了コードにかかわらず異常終了として扱う。
        if (processExited(chrome)) {
            recordProcessFailure('Chrome', `unexpected exit (code=${chrome.exitCode}, signal=${chrome.signalCode})`);
        }
        if (processExited(httpServer)) {
            recordProcessFailure('HTTP server', `unexpected exit (code=${httpServer.exitCode}, signal=${httpServer.signalCode})`);
        }

        // CDPで終了を要求してから、実プロセスのexitイベントを待つ。profile削除を
        // 先に行うと、Linux CIではChromeの残存ファイルによりENOTEMPTYになり得る。
        chromeState.expectedTermination = true;
        if (cdp) {
            try {
                await Promise.race([
                    cdp.send('Browser.close'),
                    sleep(2000),
                ]);
            } catch (e) {
                // Browser.closeが応答前にWebSocketを閉じることは正常な終了でも起こる。
            }
            try {
                cdp.close();
            } catch (e) {
                // WebSocketが既に閉じていてもcleanupは継続する。
            }
        }
        const chromeStop = await stopProcess(chrome, 'Chrome');
        if (!chromeStop.exited) recordProcessFailure('Chrome', chromeStop.error);

        httpServerState.expectedTermination = true;
        const httpServerStop = await stopProcess(httpServer, 'HTTP server');
        if (!httpServerStop.exited) recordProcessFailure('HTTP server', httpServerStop.error);

        // プロセス終了確認後の削除でも一時的にENOTEMPTYが残る場合は、テスト本体の
        // 結果とは分離して警告だけ出す。再試行の期限を設け、ハングは避ける。
        await removeDirectoryWithRetry(chromeProfile, 'Chrome profile');
        await removeDirectoryWithRetry(tmpWeb, 'HTTP server root');

        for (const processFailure of processFailures) {
            if (!failures.includes(processFailure)) failures.push(processFailure);
        }
    }

    if (failures.length) {
        console.error('\nROMA REGRESSION FAILURES:');
        for (const f of failures) console.error('  - ' + f);
        process.exit(1);
    }
    console.log('roma regression: all ok');
    process.exit(0);
})().catch((e) => {
    console.error('harness error: ' + e.message);
    for (const processFailure of processFailures) {
        console.error('process failure: ' + processFailure);
    }
    process.exit(1);
});
