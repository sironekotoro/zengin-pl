'use strict';

// ブラウザ（ヘッドレス Chrome）で roma（ローマ字）表示の退行を検証する回帰テスト。
//
// 背景: 検索UI改修（Issue #1 / PR #5）で、銀行・支店カードに従来表示されていた
// `bank.roma` / `branch.roma` の行が消えてしまう退行があった。これを再発させないため、
// 実際のブラウザでカードの `.result-roma` 行の有無を検証する。
//
// 前提: Chrome が `/usr/bin/google-chrome` または macOS アプリとして存在すること。
// 存在しない環境では自身をスキップする。web/data は生成済みであること。

const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync, cpSync, existsSync } = require('node:fs');
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
function check(label, cond, detail) {
    if (!cond) failures.push(label + (detail ? ': ' + JSON.stringify(detail) : ''));
    console.log((cond ? 'ok   ' : 'FAIL ') + label + (cond ? '' : ' -> ' + JSON.stringify(detail)));
}

(async () => {
    // web/ を一時ディレクトリへコピー（データ含む）
    const tmpWeb = mkdtempSync(join(tmpdir(), 'zengin-roma-'));
    cpSync(join(repoRoot, 'web'), tmpWeb, { recursive: true });

    const httpServer = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
        cwd: tmpWeb,
        stdio: 'ignore',
    });

    const chromeProfile = mkdtempSync(join(tmpdir(), 'zengin-roma-cp-'));
    const chrome = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${chromeProfile}`,
        'about:blank',
    ], { stdio: 'ignore' });

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

        const cdp = new Cdp(target.webSocketDebuggerUrl);
        await cdp.ready();
        await cdp.send('Runtime.enable');
        await cdp.send('Page.enable');
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${HTTP_PORT}/index.html` });
        await sleep(1500);

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

        // ページ読み込み時の JS 例外がない
        check('ページ読み込み時の JS 例外がない', cdp.exceptions.length === 0, cdp.exceptions);

        cdp.close();
    } finally {
        httpServer.kill();
        if (chrome.exitCode === null) {
            chrome.kill();
            await new Promise((resolve) => {
                chrome.once('exit', resolve);
                setTimeout(resolve, 3000);
            });
        }
        rmSync(chromeProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        rmSync(tmpWeb, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
    process.exit(1);
});