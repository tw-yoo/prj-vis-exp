const CONFIG_URL = '../config.json';
const FIRESTORE_HOST = 'https://firestore.googleapis.com/v1';

let cachedSettings = null;
let configPromise = null;

async function loadConfig() {
    if (cachedSettings) return cachedSettings;
    if (!configPromise) {
        configPromise = (async () => {
            const res = await fetch(CONFIG_URL, { cache: 'no-store' });
            if (!res.ok) {
                throw new Error(`Failed to load config.json (HTTP ${res.status})`);
            }
            return res.json();
        })();
    }
    const raw = await configPromise;
    const apiKey = raw.API_KEY || raw.apiKey || '';
    const projectId = raw.PROJECT_ID || raw.projectId || '';
    const databaseId = raw.DATABASE_ID || raw.databaseId || '(default)';
    if (!apiKey) {
        throw new Error('Missing API_KEY in config.json');
    }
    if (!projectId) {
        throw new Error('Missing PROJECT_ID in config.json');
    }
    cachedSettings = { apiKey, projectId, databaseId };
    return cachedSettings;
}

async function getSettings() {
    return loadConfig();
}

function encodeSegment(seg) {
    return encodeURIComponent(seg);
}

function encodeValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        if (Number.isInteger(value)) {
            return { integerValue: String(value) };
        }
        return { doubleValue: value };
    }
    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }
    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }
    if (value && typeof value === 'object') {
        return {
            mapValue: {
                fields: encodeFields(value)
            }
        };
    }
    return { stringValue: value == null ? '' : String(value) };
}

function encodeFields(obj) {
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
        out[key] = encodeValue(val);
    }
    return out;
}

function decodeValue(value) {
    if (!value) return undefined;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return new Date(value.timestampValue).toISOString();
    if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
    if ('arrayValue' in value) {
        const vals = value.arrayValue.values || [];
        return vals.map(decodeValue);
    }
    return undefined;
}

function decodeFields(fields) {
    const out = {};
    for (const [key, val] of Object.entries(fields || {})) {
        out[key] = decodeValue(val);
    }
    return out;
}

async function requestFirestore(pathSegments, { method = 'GET', body = null, isCollectionIds = false } = {}) {
    const { apiKey, projectId, databaseId } = await getSettings();
    const basePath = `${FIRESTORE_HOST}/projects/${projectId}/databases/${databaseId}/documents`;
    const path = Array.isArray(pathSegments) ? pathSegments.map(encodeSegment).join('/') : pathSegments;
    const postfix = isCollectionIds ? ':listCollectionIds' : '';
    const url = `${basePath}/${path}${postfix}?key=${encodeURIComponent(apiKey)}`;
    const headers = { Accept: 'application/json' };
    const options = { method, headers };
    if (body) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (res.status === 404) return null;
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firestore ${method} ${url} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

async function getDocument(pathSegments) {
    const doc = await requestFirestore(pathSegments);
    if (!doc) return null;
    return { name: doc.name, fields: decodeFields(doc.fields || {}) };
}

async function patchDocument(pathSegments, fields) {
    const body = { fields: encodeFields(fields) };
    await requestFirestore(pathSegments, { method: 'PATCH', body });
}

async function listCollectionIds(pathSegments) {
    const res = await requestFirestore(pathSegments, {
        method: 'POST',
        isCollectionIds: true,
        body: { pageSize: 200 }
    });
    if (!res) return [];
    return Array.isArray(res.collectionIds) ? res.collectionIds : [];
}

export async function validateSurveyCode(code) {
    const doc = await getDocument(['survey', code]);
    return doc !== null;
}

export async function ensureSurveyDocument(code) {
    const exists = await getDocument(['survey', code]);
    if (!exists) {
        await patchDocument(['survey', code], {
            code,
            createdAt: new Date()
        });
    } else {
        await patchDocument(['survey', code], {
            lastAccessedAt: new Date()
        });
    }
}

export async function saveSurveyResponse(code, questionKey, value) {
    const payload = {
        value: value == null ? '' : String(value),
        updatedAt: new Date()
    };
    await patchDocument(['survey', code, questionKey, 'response'], payload);
}

export async function saveSurveyTiming(code, pageKey, seconds, extra = {}) {
    const payload = {
        seconds: Number.isFinite(seconds) ? Number(seconds) : 0,
        updatedAt: new Date(),
        ...extra
    };
    await patchDocument(['survey', code, pageKey, 'time'], payload);
}

export async function fetchSurveyState(code) {
    const exists = await getDocument(['survey', code]);
    if (!exists) return { responses: {}, timings: {}, pageAnswers: {} };
    const collections = await listCollectionIds(['survey', code]);
    const responses = {};
    const timings = {};
    const pageAnswers = {};

    for (const col of collections) {
        const responseDoc = await getDocument(['survey', code, col, 'response']);
        if (responseDoc && responseDoc.fields && typeof responseDoc.fields.value !== 'undefined') {
            responses[col] = responseDoc.fields.value;
            continue;
        }
        const timeDoc = await getDocument(['survey', code, col, 'time']);
        if (timeDoc && timeDoc.fields) {
            if (typeof timeDoc.fields.seconds !== 'undefined') {
                timings[col] = Number(timeDoc.fields.seconds) || 0;
            }
            if (timeDoc.fields.answers && typeof timeDoc.fields.answers === 'object') {
                pageAnswers[col] = timeDoc.fields.answers;
            }
        }
    }

    return { responses, timings, pageAnswers };
}
