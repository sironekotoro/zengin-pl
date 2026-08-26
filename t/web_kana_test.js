'use strict';

// Web 版（web/kana.js）の半角カタカナ変換を検証する Node 用テスト。
//
// データソースの kana は全角カタカナのみのため、表示・コピー時に
// 決定的な文字対応で半角カタカナへ変換する。
// 正当性の担保は NFKC 正規化との往復一致で行う:
//   toHankaku(s).normalize('NFKC') === s.normalize('NFKC')

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ZenginKana = require(path.join(root, 'web', 'kana.js'));

const failures = [];

function check(label, cond, detail) {
    if (!cond) {
        failures.push(label + (detail ? ': ' + detail : ''));
    }
}

function eq(label, actual, expected) {
    check(label, actual === expected, `actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
}

// --- 基本の単位変換 ---
eq('ア → ｱ', ZenginKana.toHankaku('ア'), '\uFF71');
eq('ヲ → ｦ', ZenginKana.toHankaku('ヲ'), '\uFF66');
eq('ン → ﾝ', ZenginKana.toHankaku('ン'), '\uFF9D');
eq('ー → ｰ', ZenginKana.toHankaku('ー'), '\uFF70');
eq('・ → ･', ZenginKana.toHankaku('\u30FB'), '\uFF65');
eq('、 → ､', ZenginKana.toHankaku('\u3001'), '\uFF64');

// --- 濁点・半濁点（結合文字になる） ---
eq('ガ → ｶﾞ', ZenginKana.toHankaku('ガ'), '\uFF76\uFF9E');
eq('パ → ﾊﾟ', ZenginKana.toHankaku('パ'), '\uFF8A\uFF9F');
eq('ヴ → ｳﾞ', ZenginKana.toHankaku('ヴ'), '\uFF73\uFF9E');
eq('ミズホ → ﾐｽﾞﾎ', ZenginKana.toHankaku('ミズホ'), '\uFF90\uFF7D\uFF9E\uFF8E');

// --- 全角英数・記号 ---
eq('ＵＦＪ → UFJ', ZenginKana.toHankaku('ＵＦＪ'), 'UFJ');
eq('０９ → 09', ZenginKana.toHankaku('０９'), '09');
eq('－ → -', ZenginKana.toHankaku('\uFF0D'), '-');
eq('． → .', ZenginKana.toHankaku('\uFF0E'), '.');
eq('全角スペース → 半角スペース', ZenginKana.toHankaku('\u3000'), ' ');

// --- 漢字・ひらがななど変換対象外はそのまま ---
eq('漢字はそのまま', ZenginKana.toHankaku('銀行'), '銀行');
eq('ひらがなはそのまま', ZenginKana.toHankaku('みずほ'), 'みずほ');

// --- 入力値の扱い ---
eq('空文字は空文字', ZenginKana.toHankaku(''), '');
eq('null は空文字', ZenginKana.toHankaku(null), '');
eq('undefined は空文字', ZenginKana.toHankaku(undefined), '');

// --- checkout に含まれる固定 fixture で検証 ---
const fixtureRoot = path.join(root, 't', 'fixtures', 'web-data');
const dataRoot = fixtureRoot;
const banksPath = path.join(dataRoot, 'banks.json');
if (fs.existsSync(banksPath)) {
    const banks = JSON.parse(fs.readFileSync(banksPath, 'utf8'));
    let records = 0;

    const verify = (kana, where) => {
        if (!kana) return;
        records++;
        const converted = ZenginKana.toHankaku(kana);
        check(
            `NFKC 往復一致 (${where})`,
            converted.normalize('NFKC') === kana.normalize('NFKC'),
            `kana=${JSON.stringify(kana)} converted=${JSON.stringify(converted)}`
        );
    };

    for (const code in banks) {
        verify(banks[code].kana, `banks:${code}`);
    }

    const branchesDir = path.join(dataRoot, 'branches');
    for (const file of fs.readdirSync(branchesDir)) {
        const branches = JSON.parse(
            fs.readFileSync(path.join(branchesDir, file), 'utf8')
        );
        for (const code in branches) {
            verify(branches[code].kana, `branches/${file}:${code}`);
        }
    }

} else {
    console.log('Webデータfixtureが見つからないためデータ検証はスキップ');
}

if (failures.length) {
    console.error('WEB KANA FAILURES:');
    for (const failure of failures) {
        console.error('  - ' + failure);
    }
    process.exit(1);
}

console.log('web kana regression: all ok');
process.exit(0);
