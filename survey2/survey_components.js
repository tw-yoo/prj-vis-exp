// survey_components.js
export function createNavButtons({ prevId = 'prev', nextId = 'next', onPrev, onNext }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'survey-nav';
    const prev = document.createElement('button');
    prev.className = 'button prev-btn';
    prev.id = prevId;
    prev.textContent = 'Previous';
    prev.disabled = true;
    prev.addEventListener('click', () => { if (onPrev) onPrev(); });
    const next = document.createElement('button');
    next.className = 'button next-btn';
    next.id = nextId;
    next.textContent = 'Next';
    next.addEventListener('click', () => { if (onNext) onNext(); });
    wrapper.append(prev, next);
    // double button text size and padding
    prev.style.fontSize = '2rem';
    next.style.fontSize = '2rem';
    prev.style.padding = '1.1em 2.4em';
    next.style.padding = '1.1em 2.4em';
    return wrapper;
}

export function createLikertQuestion({ name, questionText, labels = [], baseId = 'likert' }) {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'likert-group';
    fieldset.setAttribute('aria-label', questionText);
    const legend = document.createElement('legend');
    legend.className = 'question';
    legend.textContent = questionText;
    fieldset.appendChild(legend);
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'options';
    labels.forEach((labelText, idx) => {
        const value = idx + 1;
        const label = document.createElement('label');
        label.className = 'likert-option';
        label.style.fontSize = '2rem';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = String(value);
        input.id = `${baseId}-option-${value}`;
        const custom = document.createElement('span');
        custom.className = 'custom-radio';
        const spanText = document.createElement('span');
        spanText.className = 'option-text';
        spanText.textContent = labelText;
        // double radio and text size
        custom.style.width = '36px';
        custom.style.height = '36px';
        custom.style.marginBottom = '8px';
        spanText.style.fontSize = '2rem';
        label.append(input, custom, spanText);
        optionsDiv.appendChild(label);
    });
    fieldset.appendChild(optionsDiv);
    return fieldset;
}

export function createOpenEndedInput({ id, labelText, placeholder = '', multiline = false }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'text-input-wrapper';
    const label = document.createElement('label');
    label.className = 'question';
    label.setAttribute('for', id);
    label.textContent = labelText;
    let input;
    if (multiline) {
        input = document.createElement('textarea');
        input.rows = 3;
        input.style.resize = 'vertical';
    } else {
        input = document.createElement('input');
        input.type = 'text';
    }
    input.id = id;
    input.className = 'text-input';
    input.placeholder = placeholder;
    wrapper.append(label, input);
    return wrapper;
}

export function getLikertValue(name) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    for (const r of radios) {
        if (r.checked) return r.value;
    }
    return null;
}

export function getOpenEndedValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    return el.value;
}

// Example auto-setup if placeholder exists
document.addEventListener('DOMContentLoaded', () => {
    const dyn = document.getElementById('dynamic-insert');
    if (!dyn) return;
    const nav = createNavButtons({
        prevId: 'prev_dynamic',
        nextId: 'next_dynamic',
        onPrev: () => console.log('prev clicked'),
        onNext: () => console.log('next clicked')
    });
    const likert = createLikertQuestion({
        name: 'satisfaction_dynamic',
        questionText: 'How satisfied are you with the interface (dynamic)?',
        labels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'],
        baseId: 'likert_dynamic'
    });
    const openInput = createOpenEndedInput({
        id: 'comment_dynamic',
        labelText: 'Any comments (dynamic)?',
        placeholder: 'Type here...',
        multiline: true
    });
    dyn.append(nav, likert, openInput);
});

