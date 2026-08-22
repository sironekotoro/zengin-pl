'use strict';

// Web 版（web/search.js）の検索意味論を検証する Node 用回帰テスト。
//
// 対象の仕様（docs/github-pages-search-plan.md 参照）:
//   - 数字のみ入力は完全一致 lookup（CLI / Web 独自 dispatch）
//   - それ以外は name/kana/hira/code へのリテラル部分一致（roma は対象外）
//   - 結果は bank code / branch code の昇順で安定ソート
//
// 前提: 事前に `perl tools/generate_web_data.pl` を実行し web/data を生成
//（t/ 配下に生成済みデータがない場合は t/21.web_search.t 側でスキップされる）。

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ZenginSearch = require(path.join(root, 'web', 'search.js'));

const banks = JSON.parse(
    fs.readFileSync(path.join(root, 'web', 'data', 'banks.json'), 'utf8')
);

function loadBranches(code) {
    return JSON.parse(
        fs.readFileSync(path.join(root, 'web', 'data', 'branches', code + '.json'), 'utf8')
    );
}

const failures = [];

function check(label, cond, detail) {
    if (!cond) {
        failures.push(label + (detail ? ': ' + detail : ''));
    }
}

function codes(list) {
    return list.map(r => r.code);
}

function matchesAnyField(row, pattern) {
    return [row.name, row.kana, row.hira, row.code].some(
        v => v != null && String(v).indexOf(pattern) !== -1
    );
}

function isSortedByCode(list) {
    for (let i = 1; i < list.length; i++) {
        const cmp = String(list[i - 1].code).localeCompare(String(list[i].code), 'en');
        if (cmp >= 0) {
            return false;
        }
    }
    return true;
}

// --- Web/CLI 独自 dispatch: 数字のみは完全一致 ---
{
    const bank = ZenginSearch.searchBanks(banks, '0001');
    check('銀行 0001 は完全一致 1 件', bank.length === 1, JSON.stringify(codes(bank)));
    check('銀行 0001 の code', bank.length === 1 && bank[0].code === '0001', codes(bank).join(','));

    const branch = ZenginSearch.searchBranches(loadBranches('0001'), '001');
    check('支店 001 は完全一致 1 件', branch.length === 1, JSON.stringify(codes(branch)));
    check('支店 001 の code', branch.length === 1 && branch[0].code === '001', JSON.stringify(codes(branch)));
}

// --- 検索部分一致の意味論（銀行情報） ---
check('mizuho(roma) は 0 件', ZenginSearch.searchBanks(banks, 'mizuho').length === 0);
check('存在しない銀行は 0 件',
    ZenginSearch.searchBanks(banks, '存在しない銀行').length === 0);

{
    const r = ZenginSearch.searchBanks(banks, 'みずほ');
    check('みずほ は 1 件以上', r.length > 0, JSON.stringify(codes(r)));
    check('みずほ に 0001 を含む', codes(r).includes('0001'), JSON.stringify(codes(r)));
    check('みずほ 全件マッチ', r.every(b => matchesAnyField(b, 'みずほ')));
    check('みずほ は昇順ソート', isSortedByCode(r), JSON.stringify(codes(r)));
}

{
    const r = ZenginSearch.searchBanks(banks, '三菱');
    check('三菱 は 1 件以上', r.length > 0, JSON.stringify(codes(r)));
    check('三菱 は複数候補', r.length >= 2, JSON.stringify(codes(r)));
    check('三菱 に 0005 を含む', codes(r).includes('0005'), JSON.stringify(codes(r)));
    check('三菱 全件マッチ', r.every(b => matchesAnyField(b, '三菱')));
    check('三菱 は昇順', isSortedByCode(r), JSON.stringify(codes(r)));
}

{
    const r = ZenginSearch.searchBanks(banks, '東京');
    check('東京 は複数候補', r.length >= 2, JSON.stringify(codes(r)));
    check('東京 全件マッチ', r.every(b => matchesAnyField(b, '東京')));
    check('東京 は昇順', isSortedByCode(r), JSON.stringify(codes(r)));
}

// --- 検索部分の部分一致の意味論（支店） ---
{
    const branches = loadBranches('0001');
    const r = ZenginSearch.searchBranches(branches, '東京');
    check('支店 東京 は 1 件以上', r.length > 0, JSON.stringify(codes(r)));
    check('支店 東京 に 001 を含む', codes(r).includes('001'), JSON.stringify(codes(r)));
    check('支店 東京 全件マッチ', r.every(b => matchesAnyField(b, '東京')));
    check('支店 東京 は昇順', isSortedByCode(r), JSON.stringify(codes(r)));

    const notFound = ZenginSearch.searchBranches(branches, '存在しない支店');
    check('存在しない支店は 0 件', notFound.length === 0, JSON.stringify(codes(notFound)));
}

// --- コピーボタン ---
{
    var html = ZenginSearch.copyButtonHTML('0001', '銀行コード');
    check('copyButtonHTML は button を含む', html.indexOf('<button') !== -1, 'no button tag');
    check('copyButtonHTML は copy-btn class', html.indexOf('copy-btn') !== -1, 'no copy-btn class');
    check('copyButtonHTML は data-copy', html.indexOf('data-copy="0001"') !== -1, 'missing data-copy');
    check('copyButtonHTML は data-label="銀行コード"', html.indexOf('data-label="銀行コード"') !== -1, 'missing or wrong data-label');
    check('copyButtonHTML は aria-label', html.indexOf('aria-label="') !== -1, 'missing aria-label');
    check('copyButtonHTML は SVG を含む', html.indexOf('<svg') !== -1, 'no svg');
    check('copyButtonHTML は閉じタグ', html.indexOf('</button>') !== -1, 'no closing tag');
    check('copyButtonHTML は type="button"', html.indexOf('type="button"') !== -1, 'missing type');
    check('copyButtonHTML は値をエスケープ', ZenginSearch.copyButtonHTML('<script>', 'test').indexOf('&lt;script&gt;') !== -1, 'unescaped value');
    check('copyButtonHTML はラベルをエスケープ', ZenginSearch.copyButtonHTML('x', '<b>bold</b>').indexOf('&lt;b&gt;bold&lt;/b&gt;') !== -1, 'unescaped label');
    check('escapeHtml は存在する', typeof ZenginSearch.escapeHtml === 'function', 'escapeHtml not exported');
    check('escapeHtml は & をエスケープ', ZenginSearch.escapeHtml('a&b') === 'a&amp;b', 'amp not escaped');
    check('escapeHtml は < > をエスケープ', ZenginSearch.escapeHtml('<tag>') === '&lt;tag&gt;', 'angle brackets not escaped');
}

// --- コピーボタンの wired value/label/aria-label 検証 ---
// 各コピー対象（銀行名、銀行コード、支店名、支店コード、半角カタカナ）が
// 正しい data-copy / data-label / aria-label で生成されることを検証する
{
    var targets = [
        { value: '0001', label: '銀行コード', desc: '銀行コード' },
        { value: 'みずほ', label: '銀行名', desc: '銀行名' },
        { value: '001', label: '支店コード', desc: '支店コード' },
        { value: '東京支店', label: '支店名', desc: '支店名' },
        { value: 'ﾐｽﾞﾎ', label: '半角カタカナ', desc: '半角カタカナ' },
    ];

    for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        var h = ZenginSearch.copyButtonHTML(t.value, t.label);
        var escapedValue = ZenginSearch.escapeHtml(String(t.value));
        var escapedLabel = ZenginSearch.escapeHtml(String(t.label));
        check('copyButtonHTML(' + t.desc + ') の data-copy', h.indexOf('data-copy="' + escapedValue + '"') !== -1, 'data-copy value mismatch for ' + t.desc);
        check('copyButtonHTML(' + t.desc + ') の data-label', h.indexOf('data-label="' + escapedLabel + '"') !== -1, 'data-label mismatch for ' + t.desc);
        check('copyButtonHTML(' + t.desc + ') の aria-label', h.indexOf('aria-label="' + escapedLabel + '&#x3092;&#x30b3;&#x30d4;&#x30fc;"') !== -1, 'aria-label should be "' + escapedLabel + 'をコピー" for ' + t.desc);
    }
}

// --- 補助名称（旧銀行名）検索: options.altNames（Web 独自拡張） ---
{
    const altNames = { '0001': ['第一国立銀行'], '0005': ['三菱銀行', '三菱UFJ銀行'] };

    const byOld = ZenginSearch.searchBanks(banks, '第一国立', { altNames });
    check('旧名称で 0001 がヒットする', codes(byOld).includes('0001'), JSON.stringify(codes(byOld)));
    check('旧名称検索でも全件マッチは保証されない（補助名称ヒットを許容）',
        byOld.every(b => matchesAnyField(b, '第一国立') || b.code === '0001'));

    const noAlt = ZenginSearch.searchBanks(banks, '第一国立');
    check('altNames 無しでは旧名称はヒットしない', noAlt.length === 0, JSON.stringify(codes(noAlt)));

    const multiple = ZenginSearch.searchBanks(banks, '三菱UFJ', { altNames });
    check('複数旧名称のどれかでヒットする', codes(multiple).includes('0005'), JSON.stringify(codes(multiple)));

    // 数字のみ入力は完全一致 lookup のまま（altNames の影響を受けない）
    const digits = ZenginSearch.searchBanks(banks, '0001', { altNames });
    check('数字完全一致は altNames でも変わらない',
        digits.length === 1 && digits[0].code === '0001', JSON.stringify(codes(digits)));
}

// --- limitResults（候補表示用の件数制限） ---
{
    const all = ZenginSearch.searchBanks(banks, '東京');
    if (all.length >= 3) {
        const limited = ZenginSearch.limitResults(all, 2);
        check('limitResults は先頭 N 件に切り詰める', limited.items.length === 2,
            String(limited.items.length));
        check('limitResults は全体件数を保持する', limited.total === all.length,
            `${limited.total} vs ${all.length}`);
        check('limitResults は truncated を報告する', limited.truncated === true);
        check('切り詰めは code 昇順の先頭から', isSortedByCode(limited.items));
    }
    const under = ZenginSearch.limitResults(all, 10000);
    check('上限以内なら truncated=false', under.truncated === false && under.total === all.length);
    check('max 未指定なら全件コピー', ZenginSearch.limitResults(all).items.length === all.length);
}

if (failures.length) {
    console.error('WEB SEARCH FAILURES:');
    for (const failure of failures) {
        console.error('  - ' + failure);
    }
    process.exit(1);
}

console.log('web search regression: all ok');
process.exit(0);