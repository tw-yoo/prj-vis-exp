import { tutorialExamplesData } from './tutorial_examples_data.js';

const STYLE_ID = 'tutorial-example-template-style';
const TEMPLATE_STYLE = `
.tutorial-page--example {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px 18px 32px;
}
.tutorial-page--example .tutorial-header {
    margin-bottom: 18px;
}
.tutorial-page--example .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 12px;
    color: #6b7280;
    margin: 0 0 4px 0;
    font-weight: 600;
}
.tutorial-page--example .tutorial-header h1 {
    margin: 0 0 6px 0;
    font-size: 26px;
}
.tutorial-page--example .lede {
    margin: 0;
    color: #4b5563;
    line-height: 1.5;
}
.tutorial-page--example .example-grid {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 18px;
}
.tutorial-page--example .card {
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.tutorial-page--example .card-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid #e5e7eb;
}
.tutorial-page--example .card-header h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
}
.tutorial-page--example .card-header .hint {
    margin: 0;
    color: #6b7280;
    font-size: 13px;
}
.tutorial-page--example .chart-card .chart-host {
    padding: 20px;
    min-height: 400px;
}
.tutorial-page--example .form-card .form-body {
    padding: 20px;
}
.tutorial-page--example .example-answer {
    background: #f9fafb;
    border: 2px solid #10b981;
    border-radius: 8px;
    padding: 16px;
}
.tutorial-page--example .answer-section {
    margin-bottom: 16px;
}
.tutorial-page--example .answer-section:last-child {
    margin-bottom: 0;
}
.tutorial-page--example .answer-section strong {
    display: block;
    color: #059669;
    margin-bottom: 6px;
    font-size: 14px;
}
.tutorial-page--example .answer-text {
    background: #fff;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid #d1fae5;
    color: #1f2937;
    line-height: 1.5;
}
.tutorial-page--example .answer-text.explanation {
    white-space: pre-line;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
}
.tutorial-page--example .ops-display {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}
.tutorial-page--example .op-tag {
    background: #d1fae5;
    color: #065f46;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 13px;
    font-weight: 600;
    border: 1px solid #10b981;
}
@media (max-width: 1080px) {
    .tutorial-page--example .example-grid {
        grid-template-columns: 1fr;
    }
}
`;

const DEFAULT_TOTAL = 5;

function ensureStylesInjected() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = TEMPLATE_STYLE;
    document.head.appendChild(styleEl);
}

function fillElementText(element, text, options = {}) {
    if (!element) return;
    const { allowHTML = false } = options;
    if (allowHTML) {
        element.innerHTML = text || '';
    } else {
        element.textContent = text || '';
    }
}

function createOpsTags(container, operations = []) {
    if (!container) return;
    container.innerHTML = '';
    if (!Array.isArray(operations) || operations.length === 0) return;
    operations.forEach((op) => {
        const tag = document.createElement('span');
        tag.className = 'op-tag';
        tag.textContent = op;
        container.appendChild(tag);
    });
}

function renderExampleInto(element, exampleId) {
    if (!element) return;
    const data = tutorialExamplesData[exampleId];
    if (!data) {
        element.innerHTML = `<div class="tutorial-example-error">Missing tutorial data for "${exampleId}".</div>`;
        console.warn(`No tutorial example data found for "${exampleId}"`);
        return;
    }

    ensureStylesInjected();
    element.className = 'page-content tutorial-page tutorial-page--example';
    element.innerHTML = `
        <header class="tutorial-header">
            <div>
                <p class="eyebrow" data-slot="eyebrow"></p>
                <h1 data-slot="title"></h1>
                <p class="lede" data-slot="lede"></p>
                <div class="steps-box">
            <p>To successfully complete the study, please follow this steps:</p>
            <ol class="steps">
                <li><strong>Read</strong> the given chart carefully.</li>
                <li><strong>Create</strong> one compositional question whose answer can be obtained from the chart
                    (i.e., a question that combines at least two pieces of information from the chart).</li>
                <li><strong>Explain</strong> the steps you would follow to get the answer, in order.</li>
                <li><strong>Mark</strong> which arithmetic operations you use
                    (e.g., retrive value, filter, sort, compare).</li>
                <li><strong>Repeat</strong> these steps until you have created 20 questions in total.</li>
            </ol>
        </div>
            </div>
        <div class="reminder">
                <strong>Important:</strong> Use tools to calculate the answer, or proofread the question and explanation, but <strong>do not use LLMs to generate the question itself.</strong>
            </div>
        </header>

        <div class="example-grid">
            <section class="card chart-card">
                <div class="card-header">
                    <h3>Chart</h3>
                    <p>Read the chart. Hover over it to see the exact values.</p>
                </div>
                <div id="tutorial-chart-view__host" class="chart-host tutorial-example-chart" data-spec-path="">
                    <div id="tutorial-chart-view" class="d3chart-container">
                        <div class="chart-placeholder">Loading chart...</div>
                    </div>
                </div>
            </section>

            <section class="card form-card">
                <div class="card-header">
                    <h3>Example Question & Steps</h3>
                    <p>This is a pre-filled example. Use it to understand how the question is structured.</p>
                </div>

                <div class="form-body">
                    <div class="example-answer">
                        <div class="answer-section">
                            <strong>1. Question:</strong>
                            <div class="answer-text" data-slot="question"></div>
                        </div>

                        <div class="answer-section">
                            <strong>2. Explanation (Step-by-step):</strong>
                            <div class="answer-text explanation" data-slot="explanation"></div>
                        </div>

                        <div class="answer-section">
                            <strong>3. Operations Used:</strong>
                            <div class="ops-display" data-slot="operations"></div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;

    const eyebrow = element.querySelector('[data-slot="eyebrow"]');
    const title = element.querySelector('[data-slot="title"]');
    const lede = element.querySelector('[data-slot="lede"]');
    const hint = element.querySelector('[data-slot="hint"]');
    const question = element.querySelector('[data-slot="question"]');
    const explanation = element.querySelector('[data-slot="explanation"]');
    const opsContainer = element.querySelector('[data-slot="operations"]');
    const chartHost = element.querySelector('#tutorial-chart-view__host');

    const total = Number.isFinite(data.total) ? data.total : DEFAULT_TOTAL;
    fillElementText(eyebrow, `Tutorial Example ${data.order} of ${total}`);
    fillElementText(title, data.title);
    fillElementText(lede, data.lede, { allowHTML: true });
    if (hint) {
        if (data.hint) {
            fillElementText(hint, data.hint);
        } else {
            hint.remove();
        }
    }
    fillElementText(question, data.question);
    fillElementText(explanation, data.explanation);
    createOpsTags(opsContainer, data.operations);
    if (chartHost) {
        chartHost.dataset.specPath = data.specPath || '';
    }

    element.dataset.tutorialExampleRendered = 'true';
}

export function renderTutorialExamplePlaceholders(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const placeholders = root.querySelectorAll('[data-tutorial-example-id]');
    placeholders.forEach((placeholder) => {
        if (placeholder.dataset.tutorialExampleRendered === 'true') return;
        const exampleId = placeholder.dataset.tutorialExampleId;
        if (!exampleId) return;
        renderExampleInto(placeholder, exampleId);
    });
}
