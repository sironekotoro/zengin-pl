(function() {
    'use strict';

    const DATA_BASE = 'data';
    const SUGGEST_DEBOUNCE_MS = 200;
    const BANK_SUGGEST_MAX = 8;
    const BRANCH_SUGGEST_MAX = 10;

    let banksData = null;
    let branchesCache = {};
    let selectedBank = null;

    // 旧銀行名オーバーレイ（任意ファイル）。
    // data/bank_name_history.json が存在する場合のみ読み込む:
    //   { "0001": [ { "name": "旧銀行名", "valid_to": "YYYY-MM-DD" } ] }
    // ファイルが無い・壊れている場合は黙ってスキップする（データは未整備）。
    let nameHistory = null;
    let nameHistoryLoaded = false;

    const elements = {
        bankInput: document.getElementById('bank-input'),
        bankSearchBtn: document.getElementById('bank-search-btn'),
        bankResults: document.getElementById('bank-results'),
        bankSuggestions: document.getElementById('bank-suggestions'),
        selectedBankSection: document.getElementById('selected-bank'),
        selectedBankCode: document.getElementById('selected-bank-code'),
        selectedBankName: document.getElementById('selected-bank-name'),
        selectedBankOldNames: document.getElementById('selected-bank-old-names'),
        clearBankBtn: document.getElementById('clear-bank'),
        branchSearchSection: document.getElementById('branch-search-section'),
        branchInput: document.getElementById('branch-input'),
        branchSearchBtn: document.getElementById('branch-search-btn'),
        branchSuggestions: document.getElementById('branch-suggestions'),
        branchResults: document.getElementById('branch-results'),
        errorMessage: document.getElementById('error-message'),
        loading: document.getElementById('loading')
    };

    // 候補表示の状態（銀行・支店で共通の構造）
    function createSuggestState(input, container, max) {
        return { input, container, max, items: [], activeIndex: -1, open: false };
    }

    const bankSuggest = createSuggestState(elements.bankInput, elements.bankSuggestions, BANK_SUGGEST_MAX);
    const branchSuggest = createSuggestState(elements.branchInput, elements.branchSuggestions, BRANCH_SUGGEST_MAX);

    function escapeHtml(text) {
        return ZenginSearch.escapeHtml(text);
    }

    function copyButtonHTML(value, label) {
        return ZenginSearch.copyButtonHTML(value, label);
    }

    async function copyToClipboard(text, btn, label) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        btn.classList.add('copied');
        btn.setAttribute('aria-label', 'コピーしました');
        setTimeout(function () {
            btn.classList.remove('copied');
            btn.setAttribute('aria-label', btn.dataset.label + 'をコピー');
        }, 1500);
    }

    function initCopyButtons(container) {
        container.querySelectorAll('.copy-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                copyToClipboard(btn.dataset.copy, btn, btn.dataset.label);
            });
        });
    }

    function hankaku(text) {
        return (window.ZenginKana && ZenginKana.toHankaku(text)) || '';
    }

    function showError(message) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.classList.remove('hidden');
    }

    function hideError() {
        elements.errorMessage.classList.add('hidden');
    }

    function showLoading() {
        elements.loading.classList.remove('hidden');
    }

    function hideLoading() {
        elements.loading.classList.add('hidden');
    }

    // 検索は web/search.js の ZenginSearch に集約
    function searchBanks(pattern) {
        // 旧銀行名があれば検索対象に含める（CLI 仕様には無い Web 独自の拡張）
        return ZenginSearch.searchBanks(banksData, pattern, { altNames: buildAltNames() });
    }

    async function loadBanks() {
        if (banksData) return banksData;

        showLoading();
        try {
            const response = await fetch(`${DATA_BASE}/banks.json`);
            if (!response.ok) throw new Error('Failed to load banks data');
            banksData = await response.json();
            return banksData;
        } catch (e) {
            showError('データの読み込みに失敗しました: ' + e.message);
            throw e;
        } finally {
            hideLoading();
        }
    }

    // 旧銀行名データ（任意）。無くても動作に影響しない。
    async function loadNameHistory() {
        if (nameHistoryLoaded) return nameHistory;
        nameHistoryLoaded = true;
        try {
            const response = await fetch(`${DATA_BASE}/bank_name_history.json`);
            if (response.ok) {
                const data = await response.json();
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    nameHistory = data;
                }
            }
        } catch (e) {
            // 任意データのため失敗は無視する
        }
        return nameHistory;
    }

    function getHistory(code) {
        return (nameHistory && nameHistory[code]) || [];
    }

    // 「旧名称」（補助表示用）の整形
    function formatOldNames(code) {
        return getHistory(code).map(h => {
            if (!h || !h.name) return null;
            return h.valid_to ? `${h.name}（〜${h.valid_to}）` : h.name;
        }).filter(Boolean);
    }

    // 検索用の補助名称マップ { code: [旧名, ...] }
    function buildAltNames() {
        if (!nameHistory) return undefined;
        const alt = {};
        for (const code in nameHistory) {
            const names = (nameHistory[code] || [])
                .map(h => h && h.name)
                .filter(Boolean);
            if (names.length) alt[code] = names;
        }
        return Object.keys(alt).length ? alt : undefined;
    }

    async function loadBranches(bankCode) {
        if (branchesCache[bankCode]) {
            return branchesCache[bankCode];
        }

        showLoading();
        try {
            const response = await fetch(`${DATA_BASE}/branches/${bankCode}.json`);
            if (!response.ok) throw new Error('Failed to load branches data');
            const branches = await response.json();
            branchesCache[bankCode] = branches;
            return branches;
        } catch (e) {
            showError('支店データの読み込みに失敗しました: ' + e.message);
            throw e;
        } finally {
            hideLoading();
        }
    }

    function searchBranches(pattern, bankCode) {
        return ZenginSearch.searchBranches(branchesCache[bankCode], pattern);
    }

    // --- 共通レンダリング部品 ---

    // row の hira/kana をもとに「ひらがな（半角カタカナ）」形式で表示する。
    // 従来は hira 優先で表示していたため、主表示は変更しない。
    // 半角カタカナは kana（全角カタカナ）からの決定的な変換で補助表示する。
    function kanaRowHtml(row) {
        if (!row) return '';
        const primary = row.hira || row.kana || '';
        if (!primary) return '';
        let han = '';
        if (row.kana) {
            const converted = hankaku(row.kana);
            if (converted && converted !== row.kana) han = converted;
        }
        const display = han ? `${escapeHtml(primary)}（${escapeHtml(han)}）` : escapeHtml(primary);
        const copyBtn = han ? ' ' + copyButtonHTML(han, '半角カタカナ') : '';
        return `<div class="result-kana">${display}${copyBtn}</div>`;
    }

    function oldNamesHtml(code) {
        const old = formatOldNames(code);
        if (!old.length) return '';
        return `<div class="old-names">旧称: ${escapeHtml(old.join('、'))}</div>`;
    }

    function codeChipHtml(label, value) {
        return `<span class="code-chip"><span class="code-label">${label}</span>` +
            `<span class="code-value">${escapeHtml(value)}</span>` +
            copyButtonHTML(value, `${label}コード`) +
            `</span>`;
    }

    // --- 銀行検索 ---

    function renderBankResults(banks) {
        hideError();
        closeSuggestions(bankSuggest);
        elements.branchResults.classList.add('hidden');

        if (banks.length === 0) {
            elements.bankResults.innerHTML = '<div class="result-item">銀行が見つかりません</div>';
            elements.bankResults.classList.remove('hidden');
            return;
        }

        if (banks.length === 1) {
            selectBank(banks[0]);
            elements.bankResults.classList.add('hidden');
            return;
        }

        elements.bankResults.innerHTML = banks.map(bank => `
            <div class="result-item" tabindex="0" data-code="${escapeHtml(bank.code)}">
                <div class="result-main-row">
                    ${codeChipHtml('銀行', bank.code)}
                    <span class="result-name">${escapeHtml(bank.name)}</span>
                    <span class="result-actions">${copyButtonHTML(bank.name, '銀行名')}</span>
                </div>
                ${kanaRowHtml(bank)}
                ${bank.roma ? `<div class="result-roma">${escapeHtml(bank.roma)}</div>` : ''}
                ${oldNamesHtml(bank.code)}
            </div>
        `).join('');

        elements.bankResults.classList.remove('hidden');
        initCopyButtons(elements.bankResults);

        elements.bankResults.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', () => {
                const code = item.dataset.code;
                const bank = banksData[code];
                selectBank(bank);
            });
            item.addEventListener('keydown', (e) => {
                // コピー操作のキーボード操作はカード選択に奪われないようにする
                if (e.target.closest('.copy-btn')) return;
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const code = item.dataset.code;
                    const bank = banksData[code];
                    selectBank(bank);
                }
            });
        });
    }

    function selectBank(bank) {
        selectedBank = bank;
        elements.bankInput.value = '';
        closeSuggestions(bankSuggest);
        elements.bankResults.classList.add('hidden');
        elements.selectedBankCode.innerHTML = escapeHtml(bank.code) + copyButtonHTML(bank.code, '銀行コード');
        elements.selectedBankName.innerHTML = escapeHtml(bank.name) + copyButtonHTML(bank.name, '銀行名');
        const old = formatOldNames(bank.code);
        elements.selectedBankOldNames.textContent = old.length ? `旧称: ${old.join('、')}` : '';
        initCopyButtons(elements.selectedBankSection);
        elements.selectedBankSection.classList.remove('hidden');
        elements.branchSearchSection.classList.remove('hidden');
        elements.branchInput.focus();
        hideError();
    }

    function clearSelectedBank() {
        selectedBank = null;
        elements.selectedBankSection.classList.add('hidden');
        elements.selectedBankCode.innerHTML = '';
        elements.selectedBankName.innerHTML = '';
        elements.selectedBankOldNames.textContent = '';
        elements.branchSearchSection.classList.add('hidden');
        elements.branchResults.classList.add('hidden');
        elements.branchInput.value = '';
        closeSuggestions(branchSuggest);
        elements.bankInput.focus();
    }

    async function handleBankSearch() {
        hideError();
        const pattern = elements.bankInput.value.trim();
        if (!pattern) return;

        try {
            await Promise.all([loadBanks(), loadNameHistory()]);
            const results = searchBanks(pattern);
            renderBankResults(results);
        } catch (e) {
            // Error already shown in loadBanks
        }
    }

    // --- 支店検索 ---

    function renderBranchResults(branches) {
        hideError();
        closeSuggestions(branchSuggest);

        if (branches.length === 0) {
            elements.branchResults.innerHTML = '<div class="result-item">支店が見つかりません</div>';
            elements.branchResults.classList.remove('hidden');
            return;
        }

        const bankCode = selectedBank.code;
        const bankName = selectedBank.name;

        elements.branchResults.innerHTML = branches.map(branch => `
            <div class="result-item" tabindex="0">
                <div class="result-main-row">
                    ${codeChipHtml('銀行', bankCode)}
                    ${codeChipHtml('支店', branch.code)}
                    <span class="result-name">${escapeHtml(branch.name)}</span>
                    <span class="result-actions">${copyButtonHTML(branch.name, '支店名')}</span>
                </div>
                ${kanaRowHtml(branch)}
                ${branch.roma ? `<div class="result-roma">${escapeHtml(branch.roma)}</div>` : ''}
                <div class="result-bankname">（${escapeHtml(bankName)}）</div>
            </div>
        `).join('');

        elements.branchResults.classList.remove('hidden');
        initCopyButtons(elements.branchResults);
    }

    async function handleBranchSearch() {
        hideError();
        if (!selectedBank) return;

        const pattern = elements.branchInput.value.trim();
        if (!pattern) {
            elements.branchResults.classList.add('hidden');
            return;
        }

        try {
            await loadBranches(selectedBank.code);
            const results = searchBranches(pattern, selectedBank.code);
            renderBranchResults(results);
        } catch (e) {
            // Error already shown in loadBranches
        }
    }

    // --- インクリメンタル候補表示 ---

    function debounce(fn, ms) {
        let timer = null;
        return function(...args) {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function closeSuggestions(state) {
        state.open = false;
        state.activeIndex = -1;
        state.container.classList.add('hidden');
        state.container.innerHTML = '';
        state.input.setAttribute('aria-expanded', 'false');
        state.input.removeAttribute('aria-activedescendant');
    }

    function optionId(state, index) {
        return `${state.container.id}-opt-${index}`;
    }

    function setActiveSuggestion(state, index) {
        state.activeIndex = index;
        state.container.querySelectorAll('.suggestion-item').forEach((el, i) => {
            el.classList.toggle('active', i === index);
            el.setAttribute('aria-selected', i === index ? 'true' : 'false');
        });
        if (index >= 0) {
            state.input.setAttribute('aria-activedescendant', optionId(state, index));
            const active = state.container.querySelectorAll('.suggestion-item')[index];
            if (active && active.scrollIntoView) {
                active.scrollIntoView({ block: 'nearest' });
            }
        } else {
            state.input.removeAttribute('aria-activedescendant');
        }
    }

    function openSuggestions(state, items, total, footerNote) {
        state.items = items;
        state.open = true;
        state.activeIndex = -1;

        if (items.length === 0) {
            state.container.innerHTML =
                '<div class="suggestion-empty">一致する候補がありません — Enter で検索</div>';
        } else {
            state.container.innerHTML = items.map((item, i) => suggestionItemHtml(state, item, i)).join('');
            if (total > items.length) {
                state.container.innerHTML +=
                    `<div class="suggestion-footer">他 ${total - items.length} 件${footerNote || ''}</div>`;
            }
            state.container.querySelectorAll('.suggestion-item').forEach(el => {
                // blur より先に反応させるため click ではなく pointerdown を使う
                el.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    chooseSuggestion(state, Number(el.dataset.index));
                });
            });
        }

        state.container.classList.remove('hidden');
        state.input.setAttribute('aria-expanded', 'true');
        state.input.removeAttribute('aria-activedescendant');
    }

    function suggestionItemHtml(state, item, index) {
        const id = optionId(state, index);
        const han = hankaku(item.kana || '');
        const hasHan = han && han !== item.kana;
        const kana = item.kana
            ? `${escapeHtml(item.kana)}${hasHan ? `（${escapeHtml(han)}）` : ''}`
            : '';
        if (state === bankSuggest) {
            const old = formatOldNames(item.code);
            return `<div class="suggestion-item" role="option" id="${id}" data-index="${index}" aria-selected="false">` +
                `<span class="sug-code">${escapeHtml(item.code)}</span>` +
                `<span class="sug-name">${escapeHtml(item.name)}${old.length ? `<span class="sug-old">（旧: ${escapeHtml(old.join('、'))}）</span>` : ''}</span>` +
                `<span class="sug-kana">${kana}</span>` +
                `</div>`;
        }
        return `<div class="suggestion-item" role="option" id="${id}" data-index="${index}" aria-selected="false">` +
            `<span class="sug-code"><span class="code-label">銀行</span>${escapeHtml(selectedBank.code)}</span>` +
            `<span class="sug-code"><span class="code-label">支店</span>${escapeHtml(item.code)}</span>` +
            `<span class="sug-name">${escapeHtml(item.name)}</span>` +
            `<span class="sug-kana">${kana}</span>` +
            `</div>`;
    }

    function chooseSuggestion(state, index) {
        const item = state.items[index];
        closeSuggestions(state);
        if (!item) return;
        if (state === bankSuggest) {
            selectBank(item);
        } else {
            state.input.value = item.name;
            handleBranchSearch();
        }
    }

    function moveActiveSuggestion(state, delta) {
        if (!state.items.length) return;
        const count = state.items.length;
        let next = state.activeIndex + delta;
        if (next < 0) next = count - 1;
        if (next >= count) next = 0;
        setActiveSuggestion(state, next);
    }

    function handleInputKeydown(state, runFullSearch) {
        return (e) => {
            if (e.key === 'ArrowDown') {
                if (!state.open && state.items.length) {
                    openSuggestions(state, state.items, state.items.length);
                } else if (state.open) {
                    moveActiveSuggestion(state, 1);
                }
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowUp') {
                if (state.open) {
                    moveActiveSuggestion(state, -1);
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'Escape') {
                if (state.open) {
                    closeSuggestions(state);
                    e.preventDefault();
                }
                return;
            }
            if (e.key === 'Enter') {
                if (state.open && state.activeIndex >= 0) {
                    e.preventDefault();
                    chooseSuggestion(state, state.activeIndex);
                    return;
                }
                closeSuggestions(state);
                runFullSearch();
            }
        };
    }

    async function updateBankSuggestions() {
        const pattern = elements.bankInput.value.trim();
        if (!pattern) {
            closeSuggestions(bankSuggest);
            return;
        }
        try {
            await Promise.all([loadBanks(), loadNameHistory()]);
        } catch (e) {
            return; // エラーは loadBanks 側で表示済み
        }
        // 待ち時間に入力が変わった・空になった場合は再描画しない
        const current = elements.bankInput.value.trim();
        if (current !== pattern || !current) return;

        const results = searchBanks(pattern);
        const limited = ZenginSearch.limitResults(results, bankSuggest.max);
        openSuggestions(bankSuggest, limited.items, limited.total, ' — Enter で全件検索');
    }

    async function updateBranchSuggestions() {
        const pattern = elements.branchInput.value.trim();
        if (!pattern || !selectedBank) {
            closeSuggestions(branchSuggest);
            return;
        }
        try {
            await loadBranches(selectedBank.code);
        } catch (e) {
            return;
        }
        const current = elements.branchInput.value.trim();
        if (current !== pattern || !current) return;

        const results = searchBranches(pattern, selectedBank.code);
        const limited = ZenginSearch.limitResults(results, branchSuggest.max);
        openSuggestions(branchSuggest, limited.items, limited.total, ' — Enter で全件検索');
    }

    const debouncedUpdateBankSuggestions = debounce(updateBankSuggestions, SUGGEST_DEBOUNCE_MS);
    const debouncedUpdateBranchSuggestions = debounce(updateBranchSuggestions, SUGGEST_DEBOUNCE_MS);

    // 入力欄外のポインタ操作で候補を閉じる
    document.addEventListener('pointerdown', (e) => {
        for (const state of [bankSuggest, branchSuggest]) {
            if (state.open && !state.container.contains(e.target) && e.target !== state.input) {
                closeSuggestions(state);
            }
        }
    });

    // --- イベント接続 ---

    elements.bankSearchBtn.addEventListener('click', handleBankSearch);
    elements.bankInput.addEventListener('keydown', handleInputKeydown(bankSuggest, handleBankSearch));
    elements.bankInput.addEventListener('input', debouncedUpdateBankSuggestions);

    elements.branchSearchBtn.addEventListener('click', handleBranchSearch);
    elements.branchInput.addEventListener('keydown', handleInputKeydown(branchSuggest, handleBranchSearch));
    elements.branchInput.addEventListener('input', debouncedUpdateBranchSuggestions);

    elements.clearBankBtn.addEventListener('click', clearSelectedBank);

    loadBanks().then(loadNameHistory).catch(() => {});
})();