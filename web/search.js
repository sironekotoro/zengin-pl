(function (global) {
    'use strict';

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function matches(row, pattern, altNames) {
        if (!pattern) {
            return false;
        }
        const rx = new RegExp(escapeRegExp(pattern), 'i');

        if (row.name && rx.test(row.name)) return true;
        if (row.kana && rx.test(row.kana)) return true;
        if (row.hira && rx.test(row.hira)) return true;
        if (row.code && rx.test(row.code)) return true;
        // 旧銀行名などの補助名称（任意）。CLI 仕様には無い Web 独自の拡張。
        if (altNames) {
            const names = altNames[row.code];
            if (names) {
                for (const name of names) {
                    if (name && rx.test(name)) return true;
                }
            }
        }
        return false;
    }

    function sortByCode(items) {
        return items.slice().sort((a, b) =>
            String(a.code).localeCompare(String(b.code), 'en')
        );
    }

    // CLI/Web 層の dispatch: 数字のみの入力は完全一致 lookup、
    // それ以外は name/kana/hira/code へのリテラル部分一致（roma は対象外）。
    // options.altNames: { [code]: [補助名称, ...] } — 旧銀行名検索用（任意）。
    function searchBanks(banksData, pattern, options) {
        if (!banksData || !pattern) {
            return [];
        }
        if (/^\d+$/.test(pattern)) {
            const exact = banksData[pattern];
            return exact ? [exact] : [];
        }

        const altNames = options && options.altNames;
        const results = [];
        for (const code in banksData) {
            const bank = banksData[code];
            if (matches(bank, pattern, altNames)) {
                results.push(bank);
            }
        }
        return sortByCode(results);
    }

    function searchBranches(branchesData, pattern) {
        if (!branchesData || !pattern) {
            return [];
        }
        if (/^\d+$/.test(pattern)) {
            const exact = branchesData[pattern];
            return exact ? [exact] : [];
        }

        const results = [];
        for (const code in branchesData) {
            const branch = branchesData[code];
            if (matches(branch, pattern)) {
                results.push(branch);
            }
        }
        return sortByCode(results);
    }

function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function copyButtonHTML(value, label) {
        var text = escapeHtml(String(value));
        var cleanLabel = escapeHtml(String(label));
        var ariaLabel = cleanLabel + '&#x3092;&#x30b3;&#x30d4;&#x30fc;';
        return '<button class="copy-btn" data-copy="' + text + '" data-label="' + cleanLabel + '" aria-label="' + ariaLabel + '" type="button">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
            '</svg></button>';
    }

    // 候補表示用の件数制限。全件検索（Enter/ボタン）の挙動は変えない。
    function limitResults(items, max) {
        const total = items.length;
        if (max == null || total <= max) {
            return { items: items.slice(), total: total, truncated: false };
        }
        return { items: items.slice(0, max), total: total, truncated: true };
    }

    const ZenginSearch = {
        matches: matches,
        searchBanks: searchBanks,
        searchBranches: searchBranches,
        escapeHtml: escapeHtml,
        copyButtonHTML: copyButtonHTML,
        limitResults: limitResults
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ZenginSearch;
    }
    global.ZenginSearch = ZenginSearch;
})(typeof window !== 'undefined' ? window : globalThis);