(function() {
    'use strict';

    const DATA_BASE = 'data';

    let banksData = null;
    let branchesCache = {};
    let selectedBank = null;

    const elements = {
        bankInput: document.getElementById('bank-input'),
        bankSearchBtn: document.getElementById('bank-search-btn'),
        bankResults: document.getElementById('bank-results'),
        selectedBankSection: document.getElementById('selected-bank'),
        selectedBankCode: document.getElementById('selected-bank-code'),
        selectedBankName: document.getElementById('selected-bank-name'),
        clearBankBtn: document.getElementById('clear-bank'),
        branchSearchSection: document.getElementById('branch-search-section'),
        branchInput: document.getElementById('branch-input'),
        branchSearchBtn: document.getElementById('branch-search-btn'),
        branchResults: document.getElementById('branch-results'),
        errorMessage: document.getElementById('error-message'),
        loading: document.getElementById('loading')
    };

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
            const ta = document.createElement('textarea');
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
            btn.setAttribute('aria-label', escapeHtml(label) + 'をコピー');
        }, 1500);
    }

    function initCopyButtons(container) {
        container.querySelectorAll('.copy-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var value = btn.dataset.copy;
                var label = btn.getAttribute('title') || '';
                copyToClipboard(value, btn, label);
            });
            btn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    btn.click();
                }
            });
        });
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
        return ZenginSearch.searchBanks(banksData, pattern);
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

    function renderBankResults(banks) {
        hideError();
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
                <span class="result-code">${escapeHtml(bank.code)}</span>
                ${copyButtonHTML(bank.code, '銀行コード')}
                <span class="result-name">${escapeHtml(bank.name)}</span>
                ${copyButtonHTML(bank.name, '銀行名')}
                <div class="result-kana">${escapeHtml(bank.hira || bank.kana || '')}</div>
                ${bank.roma ? `<div class="result-roma">${escapeHtml(bank.roma)}</div>` : ''}
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
        elements.bankResults.classList.add('hidden');
        elements.selectedBankCode.innerHTML = escapeHtml(bank.code) + copyButtonHTML(bank.code, '銀行コード');
        elements.selectedBankName.innerHTML = escapeHtml(bank.name) + copyButtonHTML(bank.name, '銀行名');
        elements.selectedBankSection.classList.remove('hidden');
        elements.branchSearchSection.classList.remove('hidden');
        elements.branchInput.focus();
        hideError();
        initCopyButtons(elements.selectedBankSection);
    }

    function clearSelectedBank() {
        selectedBank = null;
        elements.selectedBankSection.classList.add('hidden');
        elements.branchSearchSection.classList.add('hidden');
        elements.branchResults.classList.add('hidden');
        elements.branchInput.value = '';
        elements.bankInput.focus();
    }

    function renderBranchResults(branches) {
        hideError();

        if (branches.length === 0) {
            elements.branchResults.innerHTML = '<div class="result-item">支店が見つかりません</div>';
            elements.branchResults.classList.remove('hidden');
            return;
        }

        const bankCode = selectedBank.code;
        const bankName = selectedBank.name;

        elements.branchResults.innerHTML = branches.map(branch => `
            <div class="result-item" tabindex="0">
                <span class="result-code">${escapeHtml(bankCode)}-${escapeHtml(branch.code)}</span>
                ${copyButtonHTML(branch.code, '支店コード')}
                <span class="result-name">${escapeHtml(branch.name)}</span>
                ${copyButtonHTML(branch.name, '支店名')}
                <div class="result-kana">${escapeHtml(branch.hira || branch.kana || '')}</div>
                ${branch.roma ? `<div class="result-roma">${escapeHtml(branch.roma)}</div>` : ''}
                <div class="result-kana" style="margin-top: 0.25rem; font-size: 0.8rem;">(${escapeHtml(bankName)})</div>
            </div>
        `).join('');

        elements.branchResults.classList.remove('hidden');
        initCopyButtons(elements.branchResults);
    }

    async function handleBankSearch() {
        hideError();
        const pattern = elements.bankInput.value.trim();
        if (!pattern) return;

        try {
            await loadBanks();
            const results = searchBanks(pattern);
            renderBankResults(results);
        } catch (e) {
            // Error already shown in loadBanks
        }
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

    elements.bankSearchBtn.addEventListener('click', handleBankSearch);
    elements.bankInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleBankSearch();
    });

    elements.branchSearchBtn.addEventListener('click', handleBranchSearch);
    elements.branchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleBranchSearch();
    });

    elements.clearBankBtn.addEventListener('click', clearSelectedBank);

    loadBanks().catch(() => {});
})();