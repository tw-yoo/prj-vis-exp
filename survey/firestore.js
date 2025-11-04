const CONFIG_URL = '/config.json';
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
    if (Array.isArray(value)) {
        return {
            arrayValue: {
                values: value.map(item => encodeValue(item))
            }
        };
    }
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

// Client apps must NOT call Firestore's :listCollectionIds (admin/IAM-only).
// Keep a stub to avoid accidental use.
async function listCollectionIds() {
  return [];
}

export async function recordPreRegistration(payload = {}) {
    if (!payload || typeof payload.email !== 'string' || !payload.email.trim()) {
        throw new Error('Email is required for pre-registration');
    }
    const normalizedEmail = payload.email.trim().toLowerCase();
    const docId = normalizedEmail.replace(/[^a-z0-9]/gi, '_');
    const path = ['pre-registration', docId];
    const existing = await getDocument(path);
    const fields = {
        email: normalizedEmail,
        updatedAt: new Date()
    };
    Object.entries(payload).forEach(([key, value]) => {
        if (key === 'email') return;
        fields[key] = value;
    });
    if (!existing) {
        fields.createdAt = new Date();
    }
    await patchDocument(path, fields);
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
  // keep legacy per-question write (backward compatibility)
  const payload = {
    value: value == null ? '' : String(value),
    updatedAt: new Date()
  };
  await patchDocument(['survey', code, questionKey, 'response'], payload);

  // update aggregate state snapshot to avoid collection enumeration
  const statePath = ['survey', code, 'state', 'snapshot'];
  const existing = await getDocument(statePath);
  const prev = (existing && existing.fields) ? existing.fields : {};

  const merged = {
    ...prev,
    responses: {
      ...(prev.responses || {}),
      [questionKey]: value == null ? '' : String(value)
    },
    updatedAt: new Date()
  };

  await patchDocument(statePath, merged);
}

export async function saveSurveyTiming(code, pageKey, seconds, extra = {}) {
  // keep legacy per-page timing write
  const {
    answers: answersMap,
    sessions: rawSessions,
    totalVisits,
    visitIndex,
    ...meta
  } = extra || {};
  const answerEntries = (answersMap && typeof answersMap === 'object' && answersMap !== null)
    ? Object.entries(extra.answers).slice(0, 200)
    : [];
  const hasAnswers = answerEntries.length > 0;
  const answers = hasAnswers ? Object.fromEntries(answerEntries) : null;
  const sessions = Array.isArray(rawSessions)
    ? rawSessions
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
    : null;
  const normalizedTotalVisits = Number.isFinite(totalVisits) ? Number(totalVisits) : (sessions ? sessions.length : null);
  const normalizedVisitIndex = Number.isFinite(visitIndex) ? Number(visitIndex) : null;
  const payload = {
    seconds: Number.isFinite(seconds) ? Number(seconds) : 0,
    updatedAt: new Date()
  };
  if (hasAnswers) {
    payload.answers = answers;
  }
  if (sessions && sessions.length) {
    payload.sessions = sessions;
  }
  if (normalizedTotalVisits !== null) {
    payload.totalVisits = normalizedTotalVisits;
  }
  if (normalizedVisitIndex !== null) {
    payload.visitIndex = normalizedVisitIndex;
  }
  Object.entries(meta || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'pageIndex' || key === 'pageId' || key === 'pageSlug') {
      payload[key] = value;
    }
  });
  await patchDocument(['survey', code, pageKey, 'time'], payload);

  // update aggregate state snapshot
  const statePath = ['survey', code, 'state', 'snapshot'];
  const existing = await getDocument(statePath);
  const prev = (existing && existing.fields) ? existing.fields : {};

  const merged = {
    ...prev,
    timings: {
      ...(prev.timings || {}),
      [pageKey]: sessions && sessions.length
        ? sessions
        : (Number.isFinite(seconds) ? Number(seconds) : 0)
    },
    updatedAt: new Date()
  };
  if (hasAnswers) {
    merged.pageAnswers = {
      ...(prev.pageAnswers || {}),
      [pageKey]: answers
    };
  }
  if (normalizedTotalVisits !== null) {
    merged.totalVisits = {
      ...(prev.totalVisits || {}),
      [pageKey]: normalizedTotalVisits
    };
  }
  if (normalizedVisitIndex !== null) {
    merged.lastVisitIndex = {
      ...(prev.lastVisitIndex || {}),
      [pageKey]: normalizedVisitIndex
    };
  }

  await patchDocument(statePath, merged);
}

export async function fetchSurveyState(code) {
  const stateDoc = await getDocument(['survey', code, 'state', 'snapshot']);
  const fields = stateDoc && stateDoc.fields ? stateDoc.fields : {};
  return {
    responses: fields.responses || {},
    timings: fields.timings || {},
    pageAnswers: fields.pageAnswers || {}
  };
}
