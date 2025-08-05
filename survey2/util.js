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

