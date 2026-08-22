(function (global) {
    'use strict';

    // 全角カタカナ → 半角カタカナ変換。
    //
    // データソース（zengin-data-mirror）の kana は全角カタカナのみで、
    // 半角カタカナは含まれない。そのため表示・コピー時に決定的な文字対応で
    // 変換する。対応表は NFKC 正規化の逆写像から構築するため、
    // 「toHankaku(s).normalize('NFKC') === s.normalize('NFKC')」が
    // カタカナ列に対して常に成立する（t/web_kana_test.js で全データ検証）。

    const DAKUTEN = '\uFF9E';    // ﾞ
    const HANDAKUTEN = '\uFF9F'; // ﾟ

    function buildKanaMap() {
        const map = new Map();
        const halfwidth = [];
        for (let cp = 0xFF61; cp <= 0xFF9F; cp++) {
            halfwidth.push(String.fromCodePoint(cp));
        }

        // 単一文字の対応（ｱ→ア, ｰ→ー, ･→・, ､→、 など）
        for (const hw of halfwidth) {
            const fw = hw.normalize('NFKC');
            if ([...fw].length === 1 && !map.has(fw)) {
                map.set(fw, hw);
            }
        }

        // 濁点・半濁点の結合対応（ｶﾞ→ガ, ﾊﾟ→パ, ｳﾞ→ヴ など）
        for (const hw of halfwidth) {
            for (const mark of [DAKUTEN, HANDAKUTEN]) {
                const fw = (hw + mark).normalize('NFKC');
                if ([...fw].length === 1 && !map.has(fw)) {
                    map.set(fw, hw + mark);
                }
            }
        }
        return map;
    }

    const KANA_MAP = buildKanaMap();

    function convertChar(ch) {
        const mapped = KANA_MAP.get(ch);
        if (mapped !== undefined) return mapped;

        const cp = ch.codePointAt(0);
        if (cp >= 0xFF01 && cp <= 0xFF5E) {
            // 全角英数・記号（ＡＢＣ，－．等）は半角英数・記号へ
            return String.fromCharCode(cp - 0xFEE0);
        }
        if (cp === 0x3000) {
            // 全角スペースは半角スペースへ
            return ' ';
        }
        return ch;
    }

    function toHankaku(text) {
        if (text == null) return '';
        let out = '';
        for (const ch of String(text)) {
            out += convertChar(ch);
        }
        return out;
    }

    const ZenginKana = {
        toHankaku: toHankaku
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ZenginKana;
    }
    global.ZenginKana = ZenginKana;
})(typeof window !== 'undefined' ? window : globalThis);
