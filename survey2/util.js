export async function getVegaLiteSpec(chartId) {
    let vegaLiteSpec;

    await fetch(`specs/charts/ch_${chartId}.json`)
        .then((r) => vegaLiteSpec = r.json())

    return vegaLiteSpec;
}

export async function getOperationSpec(questionName) {
    try {
        const res = await fetch(`specs/operations/op_${questionName}.json`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
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