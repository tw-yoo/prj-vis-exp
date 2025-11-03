export async function getVegaLiteSpec(chartId) {
    const candidates = [
        `specs/charts/ch_${chartId}.json`,
        `pages/main_survey/main_questions/specs/charts/ch_${chartId}.json`
    ];

    let lastError = null;
    for (const path of candidates) {
        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) {
                if (res.status === 404) continue;
                lastError = new Error(`Failed to load chart spec from ${path} (HTTP ${res.status})`);
                continue;
            }
            const spec = await res.json();
            Object.defineProperty(spec, '__resolvedFrom', {
                value: path,
                configurable: true,
                enumerable: false
            });
            return spec;
        } catch (err) {
            lastError = err;
        }
    }
    const error = lastError || new Error(`Failed to load chart spec for ${chartId}`);
    throw error;
}

export async function getOperationSpec(questionName) {
    try {
        const candidates = [
            `specs/ops/${questionName}.json`,
            `pages/main_survey/main_questions/specs/ops/${questionName}.json`,
            `pages/main_survey/main_questions/specs/ops/op_${questionName}.json`
        ];
        for (const path of candidates) {
            const res = await fetch(path, { cache: 'no-store' });
            if (res.status === 404) continue;
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        }
        return null;
    } catch (e) {
        console.warn("Could not load operation spec:", e);
        return null;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getRandomCompletionCode() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const len = 6;
    let code = '';

    try {
        const arr = new Uint32Array(len);
        crypto.getRandomValues(arr);
        for (let i = 0; i < len; i++) {
            code += alphabet[arr[i] % alphabet.length];
        }
    } catch (_) {
        // Fallback to Math.random if crypto is unavailable
        for (let i = 0; i < len; i++) {
            code += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
    }

    return code;
}
