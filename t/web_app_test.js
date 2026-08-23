'use strict';

// Web 版（web/app.js）のインクリメンタル検索キーボード操作と
// ARIA アクセシビリティ状態の更新を検証する Node 用回帰テスト。
//
// 対象の振る舞い（docs/github-pages-search-plan.md §16.1 参照）:
//   - ArrowDown で候補を開く / 候補内を移動
//   - ArrowUp で候補内を逆方向に移動
//   - Escape で候補リストを閉じる
//   - Enter で選択 / 全件検索
//   - combobox/listbox ARIA 状態（aria-expanded / aria-activedescendant）
//
// すべて mock DOM を用いたオフライン・決定論的なテストで、
// ブラウザ依存・ネットワーク依存はない。

const path = require('path');
const root = path.resolve(__dirname, '..');

// Provide global ZenginSearch (search.js dependency of app.js)
require(path.join(root, 'web', 'search.js'));
const ZenginApp = require(path.join(root, 'web', 'app.js'));

const failures = [];

function check(label, cond, detail) {
    if (!cond) {
        failures.push(label + (detail ? ': ' + detail : ''));
    }
}

function createMockInput() {
    var attrs = {};
    return {
        setAttribute: function (name, value) { attrs[name] = value; },
        getAttribute: function (name) { return attrs[name]; },
        removeAttribute: function (name) { delete attrs[name]; },
        _attrs: attrs,
    };
}

function createMockContainer(id) {
    var classList = {
        _classes: ['hidden'],
        add: function (c) { if (this._classes.indexOf(c) === -1) this._classes.push(c); },
        remove: function (c) {
            var idx = this._classes.indexOf(c);
            if (idx !== -1) this._classes.splice(idx, 1);
        },
        contains: function (c) { return this._classes.indexOf(c) !== -1; },
    };
    var children = [];
    var container = {
        id: id || 'test-suggestions',
        classList: classList,
        innerHTML: '',
        querySelectorAll: function (sel) {
            if (sel === '.suggestion-item') return children;
            return [];
        },
        _children: children,
    };
    return container;
}

// Helper to populate suggestion items in a container mock
function addSuggestionItems(container, count) {
    var items = [];
    for (var i = 0; i < count; i++) {
        var el = {
            classList: {
                _classes: [],
                add: function (c) {
                    if (this._classes.indexOf(c) === -1) this._classes.push(c);
                },
                remove: function (c) {
                    var idx = this._classes.indexOf(c);
                    if (idx !== -1) this._classes.splice(idx, 0);
                },
                toggle: function (c, force) {
                    var idx = this._classes.indexOf(c);
                    if (force) { if (idx === -1) this._classes.push(c); }
                    else { if (idx !== -1) this._classes.splice(idx, 1); }
                },
                contains: function (c) { return this._classes.indexOf(c) !== -1; },
            },
            setAttribute: function (name, value) { this[name] = value; },
            getAttribute: function (name) { return this[name]; },
            scrollIntoView: function () {},
        };
        items.push(el);
    }
    container._children = items;
    container.querySelectorAll = function (sel) {
        if (sel === '.suggestion-item') return items;
        return [];
    };
    return items;
}

// =============================================================
// createSuggestState
// =============================================================
{
    var input = createMockInput();
    var container = createMockContainer('bank-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);

    check('createSuggestState は input を保持', state.input === input);
    check('createSuggestState は container を保持', state.container === container);
    check('createSuggestState は max を保持', state.max === 8);
    check('createSuggestState の初期 items は空配列',
        Array.isArray(state.items) && state.items.length === 0);
    check('createSuggestState の初期 activeIndex は -1', state.activeIndex === -1);
    check('createSuggestState の初期 open は false', state.open === false);
}

// =============================================================
// closeSuggestions
// =============================================================
{
    var input = createMockInput();
    var container = createMockContainer('bank-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.activeIndex = 2;
    state.items = [{ code: '0001', name: 'A' }];

    ZenginApp.closeSuggestions(state);

    check('closeSuggestions は open を false に', state.open === false);
    check('closeSuggestions は activeIndex を -1 に', state.activeIndex === -1);
    check('closeSuggestions は hidden クラスを追加',
        container.classList.contains('hidden'));
    check('closeSuggestions は aria-expanded を false に',
        input.getAttribute('aria-expanded') === 'false');
    check('closeSuggestions は aria-activedescendant を削除',
        input.getAttribute('aria-activedescendant') === undefined);
    check('closeSuggestions は innerHTML をクリア', container.innerHTML === '');
}

// =============================================================
// openSuggestions
// =============================================================
{
    var input = createMockInput();
    var container = createMockContainer('bank-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);
    var items = [{ code: '0001', name: 'みずほ' }, { code: '0005', name: '三菱UFJ' }];

    ZenginApp.openSuggestions(state, items, items.length);

    check('openSuggestions は items を保持', state.items === items && state.items.length === 2);
    check('openSuggestions は open を true に', state.open === true);
    check('openSuggestions は activeIndex を -1 にリセット', state.activeIndex === -1);
    check('openSuggestions は hidden を削除',
        !container.classList.contains('hidden'));
    check('openSuggestions は aria-expanded を true に',
        input.getAttribute('aria-expanded') === 'true');
    check('openSuggestions は aria-activedescendant を削除',
        input.getAttribute('aria-activedescendant') === undefined);
    check('openSuggestions は suggestion-item をレンダリング',
        container.innerHTML.indexOf('suggestion-item') !== -1);
}

// openSuggestions — 空リスト
{
    var input2 = createMockInput();
    var container2 = createMockContainer('bank-suggestions');
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);

    ZenginApp.openSuggestions(state2, [], 0);

    check('openSuggestions（空）は hidden を削除',
        !container2.classList.contains('hidden'));
    check('openSuggestions（空）は suggestion-empty を表示',
        container2.innerHTML.indexOf('suggestion-empty') !== -1);
}

// openSuggestions — footer note with truncated count
{
    var input3 = createMockInput();
    var container3 = createMockContainer('bank-suggestions');
    var state3 = ZenginApp.createSuggestState(input3, container3, 3);
    var manyItems = [
        { code: '0001', name: 'A' }, { code: '0005', name: 'B' }, { code: '0009', name: 'C' },
    ];

    ZenginApp.openSuggestions(state3, manyItems, 10);

    check('openSuggestions（truncated）に footer が含まれる',
        container3.innerHTML.indexOf('suggestion-footer') !== -1);
    check('openSuggestions（truncated）に残件数が含まれる',
        container3.innerHTML.indexOf('他 7 件') !== -1);
}

// =============================================================
// setActiveSuggestion
// =============================================================
{
    var input = createMockInput();
    var container = createMockContainer('bank-suggestions');
    addSuggestionItems(container, 3);
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }, { code: '0009', name: 'C' }];

    ZenginApp.setActiveSuggestion(state, 1);

    check('setActiveSuggestion は activeIndex を更新', state.activeIndex === 1);
    check('setActiveSuggestion は aria-activedescendant を設定',
        input.getAttribute('aria-activedescendant') === 'bank-suggestions-opt-1');
    check('setActiveSuggestion は選択中の item に active class を付与',
        container._children[1].classList.contains('active'));
    check('setActiveSuggestion は非選択 item に active class を付与しない',
        !container._children[0].classList.contains('active') &&
        !container._children[2].classList.contains('active'));
    check('setActiveSuggestion は選択中の aria-selected を true に',
        container._children[1].getAttribute('aria-selected') === 'true');
    check('setActiveSuggestion は非選択の aria-selected を false に',
        container._children[0].getAttribute('aria-selected') === 'false' &&
        container._children[2].getAttribute('aria-selected') === 'false');
}

// setActiveSuggestion — index -1 (clear active)
{
    var input2 = createMockInput();
    var container2 = createMockContainer('bank-suggestions');
    addSuggestionItems(container2, 1);
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.activeIndex = 0;

    ZenginApp.setActiveSuggestion(state2, -1);

    check('setActiveSuggestion(-1) は activeIndex を -1 に', state2.activeIndex === -1);
    check('setActiveSuggestion(-1) は aria-activedescendant を削除',
        input2.getAttribute('aria-activedescendant') === undefined);
}

// =============================================================
// moveActiveSuggestion
// =============================================================
{
    var input = createMockInput();
    var container = createMockContainer('bank-suggestions');
    addSuggestionItems(container, 3);
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.activeIndex = -1;
    state.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }, { code: '0009', name: 'C' }];

    ZenginApp.moveActiveSuggestion(state, 1);
    check('moveActiveSuggestion(1) from -1 は 0 に', state.activeIndex === 0,
        'actual ' + state.activeIndex);

    ZenginApp.moveActiveSuggestion(state, 1);
    check('moveActiveSuggestion(1) from 0 は 1 に', state.activeIndex === 1,
        'actual ' + state.activeIndex);
}

// moveActiveSuggestion — wrapping: from last forward goes to first
{
    var input2 = createMockInput();
    var container2 = createMockContainer('bank-suggestions');
    addSuggestionItems(container2, 2);
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.open = true;
    state2.activeIndex = 1;
    state2.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }];

    ZenginApp.moveActiveSuggestion(state2, 1);
    check('moveActiveSuggestion（最後→先頭）に wrap',
        state2.activeIndex === 0, 'actual ' + state2.activeIndex);
}

// moveActiveSuggestion — wrapping: from first backward goes to last
{
    var input3 = createMockInput();
    var container3 = createMockContainer('bank-suggestions');
    addSuggestionItems(container3, 2);
    var state3 = ZenginApp.createSuggestState(input3, container3, 8);
    state3.open = true;
    state3.activeIndex = 0;
    state3.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }];

    ZenginApp.moveActiveSuggestion(state3, -1);
    check('moveActiveSuggestion（先頭→最後）に wrap',
        state3.activeIndex === 1, 'actual ' + state3.activeIndex);
}

// moveActiveSuggestion — empty items is no-op
{
    var input4 = createMockInput();
    var container4 = createMockContainer('bank-suggestions');
    var state4 = ZenginApp.createSuggestState(input4, container4, 8);
    state4.open = true;
    state4.activeIndex = -1;
    state4.items = [];

    ZenginApp.moveActiveSuggestion(state4, 1);
    check('moveActiveSuggestion（空リスト）は no-op',
        state4.activeIndex === -1);
}

// =============================================================
// handleInputKeydown — ArrowDown
// =============================================================
{
    // ArrowDown: closed with items → opens suggestions
    var input = createMockInput();
    var container = createMockContainer('test-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.items = [{ code: '0001', name: 'みずほ' }];
    var prevented = false;
    var fullSearchCalled = false;
    var handler = ZenginApp.handleInputKeydown(state, function () { fullSearchCalled = true; });

    handler({ key: 'ArrowDown', preventDefault: function () { prevented = true; } });

    check('ArrowDown（closed, has items）は open を true に', state.open === true);
    check('ArrowDown（closed, has items）は preventDefault', prevented === true);
    check('ArrowDown は fullSearch を呼ばない', fullSearchCalled === false);
}

{
    // ArrowDown: open → moves active down
    var input2 = createMockInput();
    var container2 = createMockContainer('test-suggestions');
    addSuggestionItems(container2, 3);
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.open = true;
    state2.activeIndex = 0;
    state2.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }, { code: '0009', name: 'C' }];
    var prevented2 = false;
    var handler2 = ZenginApp.handleInputKeydown(state2, function () {});

    handler2({ key: 'ArrowDown', preventDefault: function () { prevented2 = true; } });

    check('ArrowDown（open）は activeIndex を 1 に進める',
        state2.activeIndex === 1, 'actual ' + state2.activeIndex);
    check('ArrowDown（open）は preventDefault', prevented2 === true);
}

{
    // ArrowDown: closed, no items → just preventDefault
    var input3 = createMockInput();
    var container3 = createMockContainer('test-suggestions');
    var state3 = ZenginApp.createSuggestState(input3, container3, 8);
    state3.items = [];
    var prevented3 = false;
    var handler3 = ZenginApp.handleInputKeydown(state3, function () {});

    handler3({ key: 'ArrowDown', preventDefault: function () { prevented3 = true; } });

    check('ArrowDown（closed, no items）は open を false のまま',
        state3.open === false);
    check('ArrowDown（closed, no items）は preventDefault',
        prevented3 === true);
}

// =============================================================
// handleInputKeydown — ArrowUp
// =============================================================
{
    // ArrowUp: open → moves active up
    var input = createMockInput();
    var container = createMockContainer('test-suggestions');
    addSuggestionItems(container, 3);
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.activeIndex = 1;
    state.items = [{ code: '0001', name: 'A' }, { code: '0005', name: 'B' }, { code: '0009', name: 'C' }];
    var prevented = false;
    var handler = ZenginApp.handleInputKeydown(state, function () {});

    handler({ key: 'ArrowUp', preventDefault: function () { prevented = true; } });

    check('ArrowUp（open）は activeIndex を 0 に戻す',
        state.activeIndex === 0, 'actual ' + state.activeIndex);
    check('ArrowUp（open）は preventDefault', prevented === true);
}

{
    // ArrowUp: closed → no-op (no preventDefault)
    var input2 = createMockInput();
    var container2 = createMockContainer('test-suggestions');
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.open = false;
    var prevented2 = false;
    var handler2 = ZenginApp.handleInputKeydown(state2, function () {});

    handler2({ key: 'ArrowUp', preventDefault: function () { prevented2 = true; } });

    check('ArrowUp（closed）は open を false のまま', state2.open === false);
    check('ArrowUp（closed）は preventDefault しない', prevented2 === false);
}

// =============================================================
// handleInputKeydown — Escape
// =============================================================
{
    // Escape: open → closes
    var input = createMockInput();
    var container = createMockContainer('test-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.activeIndex = 1;
    state.items = [{ code: '0001', name: 'A' }];
    var prevented = false;
    var handler = ZenginApp.handleInputKeydown(state, function () {});

    handler({ key: 'Escape', preventDefault: function () { prevented = true; } });

    check('Escape（open）は open を false に', state.open === false);
    check('Escape（open）は activeIndex を -1 に', state.activeIndex === -1);
    check('Escape（open）は preventDefault', prevented === true);
}

{
    // Escape: closed → no-op
    var input2 = createMockInput();
    var container2 = createMockContainer('test-suggestions');
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.open = false;
    var prevented2 = false;
    var handler2 = ZenginApp.handleInputKeydown(state2, function () {});

    handler2({ key: 'Escape', preventDefault: function () { prevented2 = true; } });

    check('Escape（closed）は open を false のまま', state2.open === false);
    check('Escape（closed）は preventDefault しない', prevented2 === false);
}

// =============================================================
// handleInputKeydown — Enter (no active suggestion)
// =============================================================
{
    // Enter: open but no active selection → close + full search
    var input = createMockInput();
    var container = createMockContainer('test-suggestions');
    var state = ZenginApp.createSuggestState(input, container, 8);
    state.open = true;
    state.activeIndex = -1;
    state.items = [{ code: '0001', name: 'A' }];
    var prevented = false;
    var fullSearchCalled = false;
    var handler = ZenginApp.handleInputKeydown(state, function () { fullSearchCalled = true; });

    handler({ key: 'Enter', preventDefault: function () { prevented = true; } });

    check('Enter（open, no active）は fullSearch を呼ぶ', fullSearchCalled === true);
    check('Enter（open, no active）は open を false に', state.open === false);
    // Enter without active suggestion does NOT preventDefault (browser form submit allowed)
    check('Enter（open, no active）は preventDefault しない', prevented === false);
}

{
    // Enter: closed → full search
    var input2 = createMockInput();
    var container2 = createMockContainer('test-suggestions');
    var state2 = ZenginApp.createSuggestState(input2, container2, 8);
    state2.open = false;
    var fullSearchCalled2 = false;
    var handler2 = ZenginApp.handleInputKeydown(state2, function () { fullSearchCalled2 = true; });

    handler2({ key: 'Enter', preventDefault: function () {} });

    check('Enter（closed）は fullSearch を呼ぶ', fullSearchCalled2 === true);
}

// Enter with active suggestion: verifies dispatch is wired
// (the actual chooseSuggestion branches depend on UI state — selectBank or
//  handleBranchSearch — which are browser-only paths. The keyboard dispatch
//  and closeSuggestions behavior is verified in this test for completeness.)
{
    var input3 = createMockInput();
    var container3 = createMockContainer('test-suggestions');
    var state3 = ZenginApp.createSuggestState(input3, container3, 8);
    state3.open = true;
    state3.activeIndex = 0;
    state3.items = [{ code: '0001', name: 'みずほ' }];
    var prevented3 = false;
    var fullSearchCalled3 = false;
    var handler3 = ZenginApp.handleInputKeydown(state3, function () { fullSearchCalled3 = true; });

    handler3({ key: 'Enter', preventDefault: function () { prevented3 = true; } });

    check('Enter（open, active）は preventDefault する', prevented3 === true);
    check('Enter（open, active）は fullSearch を呼ばない（chooseSuggestion 優先）',
        fullSearchCalled3 === false);
    // chooseSuggestion clears the state:
    check('Enter（open, active）は closeSuggestions 経由で open を false に',
        state3.open === false);
}

// =============================================================
// Results
// =============================================================

if (failures.length) {
    console.error('WEB APP REGRESSION FAILURES:');
    for (var i = 0; i < failures.length; i++) {
        console.error('  - ' + failures[i]);
    }
    process.exit(1);
}

console.log('web app keyboard/accessibility regression: all ok');
process.exit(0);