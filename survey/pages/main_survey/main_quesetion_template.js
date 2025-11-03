const DEFAULT_TEMPLATE_PATH = 'pages/main_survey/main_question_template.html';
const templateCache = new Map();
const QUESTION_SPEC_ROOT = 'pages/main_survey/main_questions/specs';
const QUESTION_CHART_SPEC_ROOT = `${QUESTION_SPEC_ROOT}/charts`;
const QUESTION_OP_SPEC_ROOT = `${QUESTION_SPEC_ROOT}/ops`;

export const ExplanationType = Object.freeze({
    OURS: 'OURS',
    BASELINE: 'BASELINE',
    EXPERT: 'EXPERT'
});

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

async function fetchTemplate(path = DEFAULT_TEMPLATE_PATH) {
    if (!templateCache.has(path)) {
        const loader = (async () => {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) {
                throw new Error(`Failed to load main survey question template (${res.status})`);
            }
            return await res.text();
        })();
        templateCache.set(path, loader);
    }
    return await templateCache.get(path);
}

async function fetchText(path) {
    if (!isNonEmptyString(path)) return '';
    try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) {
            console.warn(`Failed to fetch text from ${path} (HTTP ${res.status})`);
            return '';
        }
        return await res.text();
    } catch (err) {
        console.warn(`Failed to fetch text from ${path}`, err);
        return '';
    }
}

function normalizeSpecInput(raw) {
    if (!isNonEmptyString(raw)) return '';
    let value = raw.trim();
    if (!value) return '';
    if (value.startsWith('./')) {
        value = value.slice(2);
    }
    return value;
}

function resolveChartSpecPath(identifier) {
    const input = normalizeSpecInput(identifier);
    if (!input) return '';
    if (input.includes('://')) return input;
    if (input.startsWith('../') || input.startsWith('pages/')) return input;

    let relative = input;
    if (relative.startsWith('specs/')) {
        relative = relative.slice('specs/'.length);
    }
    const marker = 'charts/';
    const idx = relative.indexOf(marker);
    if (idx >= 0) {
        relative = relative.slice(idx + marker.length);
    }
    relative = relative.replace(/^\//, '');
    const segments = relative.split('/').filter(Boolean);
    const fileSegment = segments.pop() || '';
    let baseName = fileSegment.replace(/\.json$/i, '');
    if (!baseName.startsWith('ch_')) {
        baseName = `ch_${baseName.replace(/^ch_/, '')}`;
    }
    const fileName = `${baseName}.json`;
    const prefix = segments.length ? `${segments.join('/')}/` : '';
    return `${QUESTION_CHART_SPEC_ROOT}/${prefix}${fileName}`;
}

function resolveOperationSpecPath(identifier) {
    const input = normalizeSpecInput(identifier);
    if (!input) return '';
    if (input.includes('://')) return input;
    if (input.startsWith('../') || input.startsWith('pages/')) return input;

    let relative = input;
    if (relative.startsWith('specs/')) {
        relative = relative.slice('specs/'.length);
    }
    const marker = 'ops/';
    const idx = relative.indexOf(marker);
    if (idx >= 0) {
        relative = relative.slice(idx + marker.length);
    }
    relative = relative.replace(/^\//, '');
    const segments = relative.split('/').filter(Boolean);
    const fileSegment = segments.pop() || '';
    let baseName = fileSegment.replace(/\.json$/i, '');
    if (!baseName.startsWith('op_')) {
        baseName = `op_${baseName.replace(/^op_/, '')}`;
    }
    const fileName = `${baseName}.json`;
    const prefix = segments.length ? `${segments.join('/')}/` : '';
    return `${QUESTION_OP_SPEC_ROOT}/${prefix}${fileName}`;
}

function deriveOperationPaths(identifier) {
    const jsonPath = resolveOperationSpecPath(identifier);
    if (!jsonPath) return { json: '', html: '' };
    const htmlPath = jsonPath.endsWith('.json')
        ? jsonPath.replace(/\.json$/i, '.html')
        : `${jsonPath}.html`;
    return {
        json: jsonPath,
        html: htmlPath
    };
}

function normalizeSurveyQuestions(rawList) {
    if (!rawList) return [];
    if (rawList instanceof SurveyQuestion) return [rawList];
    if (Array.isArray(rawList)) {
        return rawList.map(item => {
            if (item instanceof SurveyQuestion) return item;
            throw new Error('Survey question entries must be instances of SurveyQuestion');
        });
    }
    throw new Error('Invalid survey question list: expected SurveyQuestion or array of SurveyQuestion instances');
}

function inferChartIdFromSpec(path) {
    if (!isNonEmptyString(path)) return '';
    const fileName = path.split('/').pop() || '';
    return fileName.replace(/^ch_/, '').replace(/\.json$/i, '');
}

function ensureStringValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
}

function normalizeExplanationType(value) {
    if (!isNonEmptyString(value)) return ExplanationType.OURS;
    const normalized = value.trim().toUpperCase();
    return Object.values(ExplanationType).includes(normalized)
        ? normalized
        : ExplanationType.OURS;
}

export class SurveyQuestion {
    constructor(
        questionType,
        questionText,
        questionLabelList,
        options = {}
    ) {
        if (!isNonEmptyString(questionType)) {
            throw new Error('SurveyQuestion requires a question type');
        }
        if (!isNonEmptyString(questionText)) {
            throw new Error('SurveyQuestion requires question text');
        }
        this.questionType = questionType;
        this.questionText = questionText;
        this.questionLabelList = Array.isArray(questionLabelList)
            ? questionLabelList.map(label => String(label))
            : [];
        this.isRequired = options.isRequired !== false;
    }

    createPlaceholder(name) {
        if (!isNonEmptyString(name)) {
            throw new Error('SurveyQuestion placeholder requires a name');
        }
        if (this.questionType === 'likert') {
            return this.createLikertPlaceholder(name);
        }
        throw new Error(`Unsupported survey question type: ${this.questionType}`);
    }

    createLikertPlaceholder(name) {
        const placeholder = document.createElement('div');
        placeholder.setAttribute('data-component', 'likert');
        placeholder.setAttribute('data-name', name);
        placeholder.setAttribute('data-question', this.questionText);
        placeholder.setAttribute('data-labels', this.questionLabelList.join('|'));
        placeholder.setAttribute('data-baseid', name);
        if (this.isRequired) {
            placeholder.setAttribute('data-required', 'true');
        }
        return placeholder;
    }
}

export class MainQuestion {
    constructor({
        questionId,
        explanationType = ExplanationType.OURS,
        chartQuestionText = '',
        chartQuestionAnswer = '',
        surveyQuestions = [],
        expertExpPath = '',
        templatePath = DEFAULT_TEMPLATE_PATH,
        chartSpecId = null,
        operationId = null,
        pageId = null,
        slug = null
    }) {
        if (!isNonEmptyString(questionId)) {
            throw new Error('MainQuestion requires a questionId');
        }
        this.questionId = questionId.trim();
        this.explanationType = normalizeExplanationType(explanationType);
        this.chartQuestionText = ensureStringValue(chartQuestionText);
        this.chartQuestionAnswer = ensureStringValue(chartQuestionAnswer);
        this.surveyQuestions = normalizeSurveyQuestions(surveyQuestions);
        this.expertExpPath = expertExpPath || '';
        this.templatePath = templatePath || DEFAULT_TEMPLATE_PATH;
        this.chartSpecPath = resolveChartSpecPath(chartSpecId || this.questionId);
        this.operationPaths = deriveOperationPaths(operationId || this.questionId);
        this.internalPageId = isNonEmptyString(pageId) ? pageId : this.questionId;
        this.slugValue = isNonEmptyString(slug) ? slug : this.internalPageId;
    }

    get pageId() {
        return this.internalPageId;
    }

    get slug() {
        return this.slugValue;
    }

    async render(templatePath = this.templatePath) {
        const templateHTML = await fetchTemplate(templatePath);
        const template = document.createElement('template');
        template.innerHTML = templateHTML;

        this.decorateRoot(template);
        await this.decorateCharts(template);
        this.decorateQuestionText(template);
        this.decorateSurveyQuestions(template);

        return template.innerHTML;
    }

    decorateRoot(template) {
        const root = template.content.querySelector('[data-role="main-question-root"]');
        if (!root) return;
        root.setAttribute('data-question-id', this.questionId);
        root.setAttribute('data-explanation-type', this.explanationType);
        if (isNonEmptyString(this.expertExpPath)) {
            root.setAttribute('data-expert-exp', this.expertExpPath);
        }
    }

    async decorateCharts(template) {
        const chartId = inferChartIdFromSpec(this.chartSpecPath);
        const placeholders = template.content.querySelectorAll('[data-component="chart"]');
        if (placeholders.length) {
            placeholders.forEach((node, index) => {
                if (this.chartSpecPath) {
                    node.setAttribute('data-spec-path', this.chartSpecPath);
                }
                if (chartId) {
                    node.setAttribute('data-chart', chartId);
                }
                if (index === 0) {
                    node.setAttribute('data-disable-navigator', 'true');
                }
            });
        }

        const explanationContainer = template.content.querySelector('[data-role="explanation-chart"]');
        if (!explanationContainer) return;

        if (this.explanationType === ExplanationType.BASELINE) {
            explanationContainer.removeAttribute('data-component');
            explanationContainer.removeAttribute('data-chart');
            explanationContainer.removeAttribute('data-opspec');
            explanationContainer.removeAttribute('data-spec-path');

            const html = await this.loadBaselineExplanation();
            if (html) {
                explanationContainer.innerHTML = html;
            } else {
                explanationContainer.innerHTML = '<div class="baseline-explanation-missing">Baseline explanation unavailable.</div>';
            }
            return;
        }

        if (this.chartSpecPath) {
            explanationContainer.setAttribute('data-spec-path', this.chartSpecPath);
        }
        if (chartId) {
            explanationContainer.setAttribute('data-chart', chartId);
        }
        const opSpecValue = this.resolveOperationSpecValue();
        if (opSpecValue) {
            explanationContainer.setAttribute('data-opspec', opSpecValue);
        } else {
            explanationContainer.removeAttribute('data-opspec');
        }
    }

    decorateQuestionText(template) {
        const questionTextNode = template.content.querySelector('[data-field="chart-question-text"]');
        if (questionTextNode) {
            questionTextNode.textContent = this.chartQuestionText;
        }
        const answerNode = template.content.querySelector('[data-field="chart-question-answer"]');
        if (answerNode) {
            answerNode.textContent = this.chartQuestionAnswer;
        }
    }

    decorateSurveyQuestions(template) {
        const container = template.content.querySelector('[data-field="survey-question-container"]');
        if (!container) return;
        container.innerHTML = '';
        this.surveyQuestions.forEach((surveyQuestion, index) => {
            const name = `${this.internalPageId}_q${index + 1}`;
            const placeholder = surveyQuestion.createPlaceholder(name);
            placeholder.setAttribute('data-name', name);
            container.appendChild(placeholder);
        });
    }

    resolveOperationSpecValue() {
        if (this.explanationType === ExplanationType.BASELINE) return '';
        return this.operationPaths.json;
    }

    resolveBaselineHtmlPath() {
        return this.operationPaths.html;
    }

    async loadBaselineExplanation() {
        const htmlPath = this.resolveBaselineHtmlPath();
        if (!isNonEmptyString(htmlPath)) return '';
        return await fetchText(htmlPath);
    }
}
