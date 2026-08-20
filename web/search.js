(function (global) {
    'use strict';

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function matches(row, pattern) {
        if (!pattern) {
            return false;
        }
        const rx = new RegExp(escapeRegExp(pattern), 'i');

        if (row.name && rx.test(row.name)) return true;
        if (row.kana && rx.test(row.kana)) return true;
        if (row.hira && rx.test(row.hira)) return true;
        if (row.code && rx.test(row.code)) return true;
        return false;
    }

    function sortByCode(items) {
        return items.slice().sort((a, b) =>
            String(a.code).localeCompare(String(b.code), 'en')
        );
    }

    function escapeHtml(text) {
        return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function copyButtonHTML(value, label) {
        var text = escapeHtml(String(value));
        var ariaLabel = escapeHtml(label) + '&#x3092;&#x30b3;&#x30d4;&#x30fc;';
        return '<button class="copy-btn" data-copy="' + text + '" aria-label="' + ariaLabel + '" title="' + ariaLabel + '" type="button">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
            '</svg></button>';
    }

    // CLI/Web 層の dispatch: 数字のみの入力は完全一致 lookup、
    // それ以外は name/kana/hira/code へのリテラル部分一致（roma は対象外）。
    function searchBanks(banksData, pattern) {
        if (!banksData || !pattern) {
            return [];
        }
        if (/^\d+$/.test(pattern)) {
            const exact = banksData[pattern];
            return exact ? [exact] : [];
        }

        const results = [];
        for (const code in banksData) {
            const bank = banksData[code];
            if (matches(bank, pattern)) {
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

    const ZenginSearch = {
        matches: matches,
        searchBanks: searchBanks,
        searchBranches: searchBranches,
        copyButtonHTML: copyButtonHTML,
        escapeHtml: escapeHtml
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ZenginSearch;
    }
    global.ZenginSearch = ZenginSearch;
})(typeof window !== 'undefined' ? window : globalThis);