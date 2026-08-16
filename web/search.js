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
        searchBranches: searchBranches
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ZenginSearch;
    }
    global.ZenginSearch = ZenginSearch;
})(typeof window !== 'undefined' ? window : globalThis);