(function (global) {
    'use strict';

    const DEFAULT_BASE_URL =
        'https://raw.githubusercontent.com/sironekotoro/zengin-data-mirror/main/data';
    const REVISION_RE = /^[0-9a-f]{40}$/i;
    const UPDATED_AT_RE = /^(\d{4})(\d{2})(\d{2})$/;

    function dataError(code, message) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function trimText(value) {
        return String(value == null ? '' : value).trim();
    }

    function validateRevision(value) {
        const revision = trimText(value);
        if (!REVISION_RE.test(revision)) {
            throw dataError('revision', 'Invalid mirror revision');
        }
        return revision.toLowerCase();
    }

    function validateUpdatedAt(value) {
        const updatedAt = trimText(value);
        const match = UPDATED_AT_RE.exec(updatedAt);
        if (!match) {
            throw dataError('updated_at', 'Invalid mirror updated_at');
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (year < 1 || date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            throw dataError('updated_at', 'Invalid mirror updated_at');
        }
        return updatedAt;
    }

    function normalizeBaseUrl(baseUrl) {
        return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    }

    function buildVersionedUrl(baseUrl, path, revision) {
        const safeRevision = validateRevision(revision);
        const safePath = String(path || '').replace(/^\/+/, '');
        if (!safePath || safePath.includes('..')) {
            throw new Error('Invalid mirror data path');
        }

        // revision is a cache-busting key. The value is not used as a raw ref:
        // mirror's revision identifies the upstream source state and is not
        // necessarily a commit SHA in the mirror repository.
        return `${normalizeBaseUrl(baseUrl)}/${safePath}` +
            `?v=${encodeURIComponent(safeRevision)}`;
    }

    function responseError(path, response) {
        const status = response && response.status ? `HTTP ${response.status}` : 'network error';
        return dataError(path === 'revision' ? 'revision' : 'data', `${status} while loading ${path}`);
    }

    function createDataSource(options) {
        options = options || {};
        const baseUrl = normalizeBaseUrl(options.baseUrl);
        const fetchImpl = options.fetchImpl || global.fetch;
        if (typeof fetchImpl !== 'function') {
            throw new Error('fetch is not available');
        }

        let revision = null;
        let revisionPromise = null;
        let updatedAtPromise = null;
        let banksPromise = null;
        const branchesPromises = new Map();

        async function loadRevision() {
            if (revision) return revision;
            if (revisionPromise) return revisionPromise;

            // revision is the freshness check. It must bypass browser/CDN cache.
            revisionPromise = (async function () {
                const response = await fetchImpl(`${baseUrl}/revision`, { cache: 'no-store' });
                if (!response || !response.ok) throw responseError('revision', response);
                return validateRevision(await response.text());
            })();

            try {
                revision = await revisionPromise;
                return revision;
            } finally {
                revisionPromise = null;
            }
        }

        async function loadUpdatedAt() {
            if (updatedAtPromise) return updatedAtPromise;
            updatedAtPromise = (async function () {
                const currentRevision = await loadRevision();
                const response = await fetchImpl(
                    buildVersionedUrl(baseUrl, 'updated_at', currentRevision)
                );
                if (!response || !response.ok) throw responseError('updated_at', response);
                return validateUpdatedAt(await response.text());
            })();
            updatedAtPromise.catch(() => { updatedAtPromise = null; });
            return updatedAtPromise;
        }

        async function loadJson(path) {
            const currentRevision = await loadRevision();
            const response = await fetchImpl(buildVersionedUrl(baseUrl, path, currentRevision));
            if (!response || !response.ok) throw responseError(path, response);
            const data = await response.json();
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error(`Invalid JSON object in ${path}`);
            }
            return data;
        }

        async function loadBanks() {
            if (banksPromise) return banksPromise;
            banksPromise = loadJson('banks.json');
            banksPromise.catch(() => { banksPromise = null; });
            return banksPromise;
        }

        async function loadBranches(bankCode) {
            const code = String(bankCode || '');
            if (!/^\d{4}$/.test(code)) {
                throw new Error('Invalid bank code');
            }
            if (branchesPromises.has(code)) return branchesPromises.get(code);

            const promise = loadJson(`branches/${encodeURIComponent(code)}.json`);
            branchesPromises.set(code, promise);
            promise.catch(() => { branchesPromises.delete(code); });
            return promise;
        }

        return {
            baseUrl,
            loadRevision,
            loadUpdatedAt,
            loadBanks,
            loadBranches,
            buildVersionedUrl: (path, currentRevision) =>
                buildVersionedUrl(baseUrl, path, currentRevision || revision)
        };
    }

    const ZenginData = {
        DEFAULT_BASE_URL,
        validateRevision,
        validateUpdatedAt,
        buildVersionedUrl,
        createDataSource
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ZenginData;
    }
    global.ZenginData = ZenginData;
})(typeof window !== 'undefined' ? window : globalThis);
