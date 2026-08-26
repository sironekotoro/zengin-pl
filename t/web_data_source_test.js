'use strict';

const path = require('path');
const ZenginData = require(path.join(__dirname, '..', 'web', 'data-source.js'));

const SHA = '647513f71c69505e09deb7a1da1717ec22dabedc';
const BASE = 'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data';
const versionedBase = BASE;

const failures = [];

function check(label, condition, detail) {
    if (!condition) failures.push(label + (detail ? `: ${detail}` : ''));
}

function response(body, status = 200) {
    const ok = status >= 200 && status < 300;
    return {
        ok,
        status,
        text: async () => String(body),
        json: async () => JSON.parse(String(body))
    };
}

function mockFetch(queue) {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        const value = queue[url];
        if (Array.isArray(value)) {
            if (!value.length) throw new Error(`no mock response for ${url}`);
            return value.length > 1 ? value.shift() : value[0];
        }
        if (typeof value === 'function') return value(url, options);
        if (!value) throw new Error(`no mock response for ${url}`);
        return value;
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

async function rejects(promise, label, expected) {
    try {
        await promise;
        check(label, false, 'did not reject');
    } catch (error) {
        check(label, true, error.message);
        if (expected) check(`${label} message`, error.message.includes(expected), error.message);
    }
}

async function main() {
    // revision の形式検証（空・文字種・長さを含む）。
    check('正常なrevisionを受け入れる', ZenginData.validateRevision(SHA.toUpperCase()) === SHA);
    for (const value of ['', 'not-a-sha', 'a'.repeat(39), 'g'.repeat(40), 'a'.repeat(41)]) {
        await rejects(Promise.resolve().then(() => ZenginData.validateRevision(value)),
            `不正なrevisionを拒否 (${JSON.stringify(value)})`, 'Invalid mirror revision');
    }

    // revision は no-store、JSON は通常の fetch（cache指定なし）。
    const banksUrl = `${versionedBase}/banks.json?v=${SHA}`;
    const branchesUrl = `${versionedBase}/branches/0001.json?v=${SHA}`;
    const updatedUrl = `${versionedBase}/updated_at?v=${SHA}`;
    const fetchImpl = mockFetch({
        [`${BASE}/revision`]: response(`\n${SHA.toUpperCase()}\r\n`),
        [banksUrl]: response('{"0001":{"code":"0001","name":"みずほ"}}'),
        [branchesUrl]: response('{"001":{"code":"001","name":"東京営業部"}}'),
        [updatedUrl]: response('20260630\n')
    });
    const source = ZenginData.createDataSource({ baseUrl: BASE, fetchImpl });
    check('revisionを正規化して返す', await source.loadRevision() === SHA);
    check('revision取得は1回', fetchImpl.calls.filter(c => c.url === `${BASE}/revision`).length === 1);
    check('revision取得はno-store', fetchImpl.calls[0].options && fetchImpl.calls[0].options.cache === 'no-store');
    check('banks URLにrevisionを含む', (await source.loadBanks())['0001'].name === 'みずほ');
    const banksCall = fetchImpl.calls.find(c => c.url === banksUrl);
    check('banks JSONはno-storeにしない', banksCall && banksCall.options === undefined, JSON.stringify(banksCall));
    check('branch URLにbank codeとrevisionを含む', (await source.loadBranches('0001'))['001'].code === '001');
    check('updated_atを正規化して返す', await source.loadUpdatedAt() === '20260630');
    check('revisionをURLエンコード済み値として付与する',
        source.buildVersionedUrl('banks.json').endsWith(`/banks.json?v=${encodeURIComponent(SHA)}`));

    // 同一銀行の branch fetch はメモリキャッシュし、失敗結果はキャッシュしない。
    const branchCalls = fetchImpl.calls.filter(c => c.url === branchesUrl).length;
    await source.loadBranches('0001');
    check('同一bankのbranchを再取得しない',
        fetchImpl.calls.filter(c => c.url === branchesUrl).length === branchCalls);

    const retryFetch = mockFetch({
        [`${BASE}/revision`]: response(SHA),
        [branchesUrl]: [response('', 503), response('{"001":{"code":"001"}}')]
    });
    const retrySource = ZenginData.createDataSource({ baseUrl: BASE, fetchImpl: retryFetch });
    await rejects(retrySource.loadBranches('0001'), 'branch HTTP失敗', 'HTTP 503');
    await retrySource.loadBranches('0001');
    check('branch HTTP失敗後は再取得する', retryFetch.calls.filter(c => c.url === branchesUrl).length === 2);

    // revision / banks / branch / updated_at のHTTP失敗。
    const failedRevision = mockFetch({ [`${BASE}/revision`]: response('', 503) });
    await rejects(ZenginData.createDataSource({ baseUrl: BASE, fetchImpl: failedRevision }).loadRevision(),
        'revision HTTP失敗', 'HTTP 503');

    const failedBanks = mockFetch({
        [`${BASE}/revision`]: response(SHA),
        [banksUrl]: response('', 503)
    });
    await rejects(ZenginData.createDataSource({ baseUrl: BASE, fetchImpl: failedBanks }).loadBanks(),
        'banks HTTP失敗', 'HTTP 503');

    const invalidUpdated = mockFetch({
        [`${BASE}/revision`]: response(SHA),
        [updatedUrl]: response('20261301')
    });
    await rejects(ZenginData.createDataSource({ baseUrl: BASE, fetchImpl: invalidUpdated }).loadUpdatedAt(),
        'updated_at不正形式', 'Invalid mirror updated_at');

    const failedUpdated = mockFetch({
        [`${BASE}/revision`]: response(SHA),
        [updatedUrl]: response('', 503)
    });
    await rejects(ZenginData.createDataSource({ baseUrl: BASE, fetchImpl: failedUpdated }).loadUpdatedAt(),
        'updated_at HTTP失敗', 'HTTP 503');

    for (const value of ['', '2026-06-30', '20260230', '20261301', 'not-a-date']) {
        await rejects(Promise.resolve().then(() => ZenginData.validateUpdatedAt(value)),
            `不正なupdated_atを拒否 (${JSON.stringify(value)})`, 'Invalid mirror updated_at');
    }
    check('updated_atの改行を許容', ZenginData.validateUpdatedAt('20260630\r\n') === '20260630');

    if (failures.length) {
        console.error('WEB DATA SOURCE FAILURES:');
        for (const failure of failures) console.error('  - ' + failure);
        process.exit(1);
    }
    console.log('web data source regression: all ok');
}

main().catch(error => {
    console.error('harness error:', error);
    process.exit(1);
});
