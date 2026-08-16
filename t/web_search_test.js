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

if (failures.length) {
    console.error('WEB SEARCH FAILURES:');
    for (const failure of failures) {
        console.error('  - ' + failure);
    }
    process.exit(1);
}

console.log('web search regression: all ok');
process.exit(0);