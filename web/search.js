(function (global) {
    'use strict';

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 検索比較専用の正規化。入力欄の表示値や元データは変更しない。
    // NFKCで半角カナ・濁点/半濁点・長音・全角英数を揃えた後、
    // カタカナをひらがなへ寄せることで、kana/hiraのどちらにも一致させる。
    function normalizeSearchText(value) {
        const normalized = String(value == null ? '' : value).normalize('NFKC');
        return normalized.replace(/[\u30A1-\u30F6]/g, (ch) =>
            String.fromCodePoint(ch.codePointAt(0) - 0x60)
        );
    }

    function matches(row, pattern, altNames) {
        if (!pattern) {
            return false;
        }
        const rx = new RegExp(escapeRegExp(normalizeSearchText(pattern)), 'i');
        const matchesValue = (value) => value != null && rx.test(normalizeSearchText(value));

        if (matchesValue(row.name)) return true;
        if (matchesValue(row.kana)) return true;
        if (matchesValue(row.hira)) return true;
        // 旧銀行名などの補助名称（任意）。CLI 仕様には無い Web 独自の拡張。
        if (altNames) {
            const names = altNames[row.code];
            if (names) {
                for (const name of names) {
                    if (matchesValue(name)) return true;
                }
            }
        }
        if (matchesValue(row.code)) return true;
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
        const normalizedPattern = normalizeSearchText(pattern);
        if (/^\d+$/.test(normalizedPattern)) {
            const exact = banksData[normalizedPattern];
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
        const normalizedPattern = normalizeSearchText(pattern);
        if (/^\d+$/.test(normalizedPattern)) {
            const exact = branchesData[normalizedPattern];
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
        normalizeSearchText: normalizeSearchText,
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
