import { data_rows, renderValidationSimpleBarChart, function1, function2 } from './data/e1/e1_q1.js';
const chartIdInput = document.getElementById('chartIdInput');
const questionTextEl = document.getElementById('questionText');
const statusEl = document.getElementById('status');
const sceneInfoEl = document.getElementById('sceneInfo');
const svgContainerEl = document.getElementById('svgContainer');
const textChunkEl = document.getElementById('textChunk');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const svgModeButton = document.getElementById('svgModeButton');
const d3ModeButton = document.getElementById('d3ModeButton');
const d3AniModeButton = document.getElementById('d3AniModeButton');
const oursModeButton = document.getElementById('oursModeButton');
const vlModeButton = document.getElementById('vlModeButton');
const modelButtonsEl = document.getElementById('modelButtons');

const modeToFile = {
    svg: 'svg_result.json',
    d3: 'd3_result.json',
    d3ani: 'd3_result_ani.json',
    ours: 'ours_d3_result_ani.json',
    vl: 'vl_result.json'
};

const modeToInputFile = {
    svg: 'svg_input.json',
    d3: 'd3_input.json',
    d3ani: 'd3_input.json',
    ours: 'd3_input.json',
    vl: 'vl_input.json'
};

const modeButtons = {
    svg: svgModeButton,
    d3: d3ModeButton,
    d3ani: d3AniModeButton,
    ours: oursModeButton,
    vl: vlModeButton
};

let availableModels = [];
let currentModel = '';
let currentMode = 'svg';
let currentScenes = [];
let currentSceneIndex = -1;
let currentChartId = '';
let currentInputData = null;
let currentBaseChart = null;
let currentOursRenderedSceneIndex = -1;

const HARDCODED_CHART_ID = 'mock-chart-1';
const mockSteps = [
    { text: 'text1', run: function1 },
    { text: 'text2', run: function2 }
];
let highestCompletedStepIndex = -1;
let currentMockStepIndex = -1;

function updateModeButtons() {
    Object.entries(modeButtons).forEach(([mode, button]) => {
        button.classList.toggle('active', mode === currentMode);
        button.setAttribute('aria-pressed', String(mode === currentMode));
    });
}

function updateModelButtons() {
    Array.from(modelButtonsEl.querySelectorAll('.mode-button')).forEach((button) => {
        const model = button.dataset.model || '';
        button.classList.toggle('active', model === currentModel);
        button.setAttribute('aria-pressed', String(model === currentModel));
    });
}

function renderModelButtons() {
    modelButtonsEl.innerHTML = '';

    if (!availableModels.length) {
        return;
    }

    availableModels.forEach((model) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mode-button';
        button.dataset.model = model;
        button.textContent = model;
        button.addEventListener('click', () => {
            setModel(model);
        });
        modelButtonsEl.appendChild(button);
    });

    updateModelButtons();
}

async function loadAvailableModels() {
    const uniqueModels = new Set();

    const filename = modeToFile[currentMode];
    if (filename) {
        try {
            const response = await fetch(`./${filename}?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                Object.keys(data || {}).forEach((model) => uniqueModels.add(model));
            }
        } catch (error) {
            console.warn(`Failed to inspect models from ${filename}:`, error);
        }
    }

    availableModels = Array.from(uniqueModels).sort();

    if (!currentModel || !uniqueModels.has(currentModel)) {
        currentModel = availableModels[0] || '';
    }

    renderModelButtons();
}

async function loadResultData() {
    const filename = modeToFile[currentMode];
    if (!filename) {
        throw new Error(`No result file configured for mode: ${currentMode}`);
    }

    const response = await fetch(`./${filename}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${filename} (${response.status})`);
    }

    return await response.json();
}

async function loadInputData() {
    const filename = modeToInputFile[currentMode];
    if (!filename) {
        throw new Error(`No input file configured for mode: ${currentMode}`);
    }

    const response = await fetch(`./${filename}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load ${filename} (${response.status})`);
    }

    currentInputData = await response.json();
    return currentInputData;
}

async function renderVegaLiteScene(spec) {
    svgContainerEl.innerHTML = '';

    if (!spec || typeof spec !== 'object') {
        svgContainerEl.innerHTML = '<div>No Vega-Lite spec found.</div>';
        return;
    }

    try {
        await vegaEmbed(svgContainerEl, spec, {
            actions: false,
            renderer: 'svg'
        });
    } catch (error) {
        console.error(error);
        svgContainerEl.innerHTML = `<div>Failed to render Vega-Lite chart: ${error.message}</div>`;
    }
}

function hydrateD3DataBindings(container) {
    const svg = d3.select(container).select('svg');
    if (svg.empty()) {
        return;
    }

    svg.selectAll('rect.main-bar').each(function () {
        const el = d3.select(this);
        const year = el.attr('data-x-value') || el.attr('data-target');
        const company = el.attr('data-series') || el.attr('data-group-value');
        const value = el.attr('data-y-value') || el.attr('data-value');

        if (year == null || company == null || value == null) {
            return;
        }

        el.datum({
            Year: String(year),
            key: String(company),
            value: +value
        });
    });
}

async function executeD3Code(d3Code) {
    if (!d3Code || !String(d3Code).trim()) {
        return;
    }

    const container = svgContainerEl;
    const svgElement = container.querySelector('svg');
    if (!svgElement) {
        throw new Error('No SVG element found for D3 rendering.');
    }

    hydrateD3DataBindings(container);

    try {
        const runD3 = new Function('d3', 'container', 'svgElement', `"use strict";\n${d3Code}`);
        const result = runD3(d3, container, svgElement);
        if (result && typeof result.then === 'function') {
            await result;
        }
    } catch (error) {
        throw new Error(`Failed to execute D3 code: ${error.message}`);
    }
}

async function renderD3Scene(scene) {
    svgContainerEl.innerHTML = scene.svg_code || '<div>No SVG code found.</div>';

    const d3Code = scene.d3_code || '';
    if (!String(d3Code).trim()) {
        return;
    }

    try {
        await executeD3Code(d3Code);
    } catch (error) {
        console.error(error);
        statusEl.textContent = `D3 execution error: ${error.message}`;

        const errorEl = document.createElement('div');
        errorEl.style.marginTop = '12px';
        errorEl.style.padding = '10px';
        errorEl.style.background = '#ffe6e6';
        errorEl.style.border = '1px solid #ffb3b3';
        errorEl.style.borderRadius = '8px';
        errorEl.style.color = '#a33';
        errorEl.style.fontSize = '14px';
        errorEl.textContent = `D3 execution error: ${error.message}`;

        svgContainerEl.appendChild(errorEl);
    }
}

function renderBaseD3Chart() {
    svgContainerEl.innerHTML = currentBaseChart || 'Chart';
    currentOursRenderedSceneIndex = -1;
}

async function renderAnimatedD3Scene(sceneIndex) {
    const previousSvg = sceneIndex === 0
        ? currentBaseChart
        : currentScenes[sceneIndex - 1]?.svg_code;

    svgContainerEl.innerHTML = previousSvg || '<div>No SVG code found.</div>';

    const scene = currentScenes[sceneIndex];
    const d3Code = scene?.d3_code || '';
    if (!String(d3Code).trim()) {
        return;
    }

    try {
        await executeD3Code(d3Code);
    } catch (error) {
        console.error(error);
        statusEl.textContent = `D3 execution error: ${error.message}`;

        const errorEl = document.createElement('div');
        errorEl.style.marginTop = '12px';
        errorEl.style.padding = '10px';
        errorEl.style.background = '#ffe6e6';
        errorEl.style.border = '1px solid #ffb3b3';
        errorEl.style.borderRadius = '8px';
        errorEl.style.color = '#a33';
        errorEl.style.fontSize = '14px';
        errorEl.textContent = `D3 execution error: ${error.message}`;

        svgContainerEl.appendChild(errorEl);
    }
}

async function renderOursD3Scene(sceneIndex) {
    try {
        if (!currentBaseChart) {
            svgContainerEl.innerHTML = '<div>No base SVG found.</div>';
            currentOursRenderedSceneIndex = -1;
            return;
        }

        if (sceneIndex === currentOursRenderedSceneIndex) {
            return;
        }

        const shouldReset =
            currentOursRenderedSceneIndex < 0 ||
            sceneIndex < currentOursRenderedSceneIndex ||
            sceneIndex > currentOursRenderedSceneIndex + 1 ||
            !svgContainerEl.querySelector('svg');

        const startIndex = shouldReset ? 0 : currentOursRenderedSceneIndex + 1;
        if (shouldReset) {
            svgContainerEl.innerHTML = currentBaseChart;
            currentOursRenderedSceneIndex = -1;
        }

        for (let index = startIndex; index <= sceneIndex; index += 1) {
            const scene = currentScenes[index];
            const d3Code = scene?.d3_code || '';
            if (!String(d3Code).trim()) {
                currentOursRenderedSceneIndex = index;
                continue;
            }
            await executeD3Code(d3Code);
            currentOursRenderedSceneIndex = index;
        }
    } catch (error) {
        console.error(error);
        statusEl.textContent = `D3 execution error: ${error.message}`;

        const errorEl = document.createElement('div');
        errorEl.style.marginTop = '12px';
        errorEl.style.padding = '10px';
        errorEl.style.background = '#ffe6e6';
        errorEl.style.border = '1px solid #ffb3b3';
        errorEl.style.borderRadius = '8px';
        errorEl.style.color = '#a33';
        errorEl.style.fontSize = '14px';
        errorEl.textContent = `D3 execution error: ${error.message}`;

        svgContainerEl.appendChild(errorEl);
    }
}

function renderTextChunks() {
    if (!currentScenes.length) {
        textChunkEl.textContent = 'Explanation text';
        return;
    }

    textChunkEl.innerHTML = '';

    currentScenes.forEach((scene, index) => {
        const chunkEl = document.createElement('span');
        chunkEl.className = 'text-chunk-item';
        chunkEl.textContent = scene.text_chunk || '';

        const isActive = index === currentSceneIndex;
        const isUnlocked = index <= currentSceneIndex + 1;
        const isCompleted = currentSceneIndex > index;

        if (isActive) {
            chunkEl.classList.add('active');
            chunkEl.style.color = '#000000';
            chunkEl.style.fontWeight = '700';
            chunkEl.style.cursor = 'pointer';
        } else if (isCompleted) {
            chunkEl.style.color = '#000000';
            chunkEl.style.fontWeight = '400';
            chunkEl.style.cursor = 'pointer';
        } else if (isUnlocked) {
            chunkEl.style.color = '#4b5563';
            chunkEl.style.fontWeight = '400';
            chunkEl.style.cursor = 'pointer';
        } else {
            chunkEl.style.color = '#6b7280';
            chunkEl.style.fontWeight = '400';
            chunkEl.style.cursor = 'default';
        }

        if (isUnlocked) {
            chunkEl.addEventListener('click', () => {
                currentSceneIndex = index;
                void renderScene();
            });
        }

        textChunkEl.appendChild(chunkEl);

        if (index < currentScenes.length - 1) {
            textChunkEl.appendChild(document.createTextNode(' '));
        }
    });
}

async function renderScene() {
    sceneInfoEl.textContent = '';
    renderTextChunks();

    if (currentSceneIndex < 0) {
        if (currentMode === 'vl') {
            await renderVegaLiteScene(currentBaseChart);
        } else if (currentMode === 'd3' || currentMode === 'd3ani' || currentMode === 'ours') {
            renderBaseD3Chart();
        } else {
            svgContainerEl.innerHTML = currentBaseChart || 'Chart';
        }
        prevButton.disabled = true;
        nextButton.disabled = true;
        return;
    }

    const scene = currentScenes[currentSceneIndex];
    const sceneNumber = scene.scene_number ?? currentSceneIndex + 1;

    if (currentMode === 'vl') {
        await renderVegaLiteScene(scene.vega_lite_spec);
    } else if (currentMode === 'ours') {
        await renderOursD3Scene(currentSceneIndex);
    } else if (currentMode === 'd3ani') {
        await renderAnimatedD3Scene(currentSceneIndex);
    } else if (currentMode === 'd3') {
        await renderD3Scene(scene);
    } else {
        svgContainerEl.innerHTML = scene.svg_code || '<div>No SVG code found.</div>';
    }

    prevButton.disabled = currentSceneIndex <= 0;
    nextButton.disabled = currentSceneIndex < 0 || currentSceneIndex >= currentScenes.length - 1;
}

async function loadChart(chartId) {
    const normalizedChartId = String(chartId).trim();
    if (!normalizedChartId) {
        statusEl.textContent = '';
        currentScenes = [];
        currentChartId = '';
        currentBaseChart = null;
        currentSceneIndex = -1;
        currentOursRenderedSceneIndex = -1;
        await renderScene();
        return;
    }

    statusEl.textContent = '';

    try {
        const data = await loadResultData();
        const inputData = await loadInputData();
        const scenes = data?.[currentModel]?.[normalizedChartId];

        if (!Array.isArray(scenes) || scenes.length === 0) {
            statusEl.textContent = currentModel
                ? `No result found for chart ID "${normalizedChartId}" under model "${currentModel}".`
                : `No result found for chart ID "${normalizedChartId}".`;
            questionTextEl.textContent = 'Question not available';
            currentScenes = [];
            currentChartId = normalizedChartId;
            currentBaseChart = null;
            currentSceneIndex = -1;
            currentOursRenderedSceneIndex = -1;
            await renderScene();
            return;
        }

        currentScenes = scenes;
        const inputEntry = inputData?.[normalizedChartId] || {};
        const question = inputEntry.question || '';
        questionTextEl.textContent = question || 'Question not available';
        currentBaseChart = inputEntry.svg || inputEntry.vega_lite_spec || inputEntry.vl_spec || inputEntry.spec || null;
        console.log('Initial base chart source for current mode:', currentMode, currentBaseChart);
        currentChartId = normalizedChartId;
        currentSceneIndex = -1;
        currentOursRenderedSceneIndex = -1;
        statusEl.textContent = '';
        await renderScene();
    } catch (error) {
        console.error(error);
        statusEl.textContent = `Error: ${error.message}`;
        currentScenes = [];
        currentChartId = normalizedChartId;
        currentBaseChart = null;
        currentSceneIndex = -1;
        currentOursRenderedSceneIndex = -1;
        await renderScene();
    }
}

function resetViewerForModeChange() {
    currentScenes = [];
    currentSceneIndex = -1;
    currentChartId = '';
    currentBaseChart = null;
    currentOursRenderedSceneIndex = -1;
    statusEl.textContent = '';
    void renderScene();
}

async function setMode(mode) {
    if (!modeToFile[mode] || currentMode === mode) {
        return;
    }

    currentMode = mode;
    updateModeButtons();
    await loadAvailableModels();
    resetViewerForModeChange();
}

function setModel(model) {
    if (!model || currentModel === model) {
        return;
    }

    currentModel = model;
    updateModelButtons();
    resetViewerForModeChange();
}

chartIdInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
        await loadChart(chartIdInput.value);
    }
});

prevButton.addEventListener('click', () => {
    if (currentSceneIndex > 0) {
        currentSceneIndex -= 1;
        void renderScene();
    }
});

nextButton.addEventListener('click', () => {
    if (currentSceneIndex < currentScenes.length - 1) {
        currentSceneIndex += 1;
        void renderScene();
    }
});

svgModeButton.addEventListener('click', () => {
    void setMode('svg');
});

d3ModeButton.addEventListener('click', () => {
    void setMode('d3');
});

d3AniModeButton.addEventListener('click', () => {
    void setMode('d3ani');
});

oursModeButton.addEventListener('click', () => {
    void setMode('ours');
});

vlModeButton.addEventListener('click', () => {
    void setMode('vl');
});


function renderMockStepTexts() {
    textChunkEl.innerHTML = '';

    mockSteps.forEach((step, index) => {
        const stepEl = document.createElement('span');
        stepEl.className = 'step-text-item';
        stepEl.textContent = step.text;

        const isActive = index === currentMockStepIndex;
        const isCompleted = index <= highestCompletedStepIndex;
        const isUnlocked = index <= highestCompletedStepIndex + 1;

        if (isActive) {
            stepEl.classList.add('active');
        } else if (isCompleted) {
            stepEl.classList.add('completed');
        } else if (!isUnlocked) {
            stepEl.classList.add('disabled');
        }

        if (isUnlocked) {
            stepEl.addEventListener('click', async () => {
                await runMockStep(index);
            });
        }

        textChunkEl.appendChild(stepEl);

        if (index < mockSteps.length - 1) {
            textChunkEl.appendChild(document.createTextNode(' '));
        }
    });
}

async function runMockStep(index) {
    if (index > highestCompletedStepIndex + 1) {
        return;
    }

    const step = mockSteps[index];
    if (!step || typeof step.run !== 'function') {
        return;
    }

    currentMockStepIndex = index;
    renderMockStepTexts();

    try {
        const result = step.run({
            d3,
            container: svgContainerEl,
            svgElement: svgContainerEl.querySelector('svg'),
            data: data_rows
        });

        if (result && typeof result.then === 'function') {
            await result;
        }

        highestCompletedStepIndex = Math.max(highestCompletedStepIndex, index);
        statusEl.textContent = '';
    } catch (error) {
        console.error(error);
        statusEl.textContent = `Step execution error: ${error.message}`;
    }

    renderMockStepTexts();
}

function initializeMockViewer() {
    currentChartId = HARDCODED_CHART_ID;
    questionTextEl.textContent = 'Mock question for one hard-coded chart';
    statusEl.textContent = '';
    svgContainerEl.innerHTML = '';
    renderValidationSimpleBarChart({ container: svgContainerEl });
    highestCompletedStepIndex = -1;
    currentMockStepIndex = -1;
    renderMockStepTexts();
}

initializeMockViewer();
