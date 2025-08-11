import {
    createNavButtons,
    createLikertQuestion,
    createOpenEndedInput, createChart
} from '../components.js';

let pageHistory = [];
function goBack() {
    if (pageHistory.length <= 1) return;
    pageHistory.pop();
    const prevIndex = pageHistory[pageHistory.length - 1];
    loadPage(prevIndex, false);
}

const responses = {};
const STORAGE_KEY = 'preRegResponses';
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
    Object.assign(responses, JSON.parse(saved));
}

function screeningPassed(userResponses) {
    return userResponses["consent-confirm"] === "1"
}

document.addEventListener('change', e => {
    if (e.target.matches('input[type="radio"]')) {
        responses[e.target.name] = e.target.value;
    }
});

document.addEventListener('input', e => {
    if (e.target.matches('input[type="text"], textarea')) {
        responses[e.target.name] = e.target.value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
    }
});

function renderComponents() {

    document.querySelectorAll('[data-component="chart"]').forEach(async el  => {
        const { chart } = el.dataset;
        await createChart(chart);
    });

    document.querySelectorAll('[data-component="likert"]').forEach(el => {
        const { name, question, labels, baseid } = el.dataset;
        const comp = createLikertQuestion({
            name,
            questionText: question,
            labels: labels.split('|'),
            baseId: baseid
        });
        el.replaceWith(comp);
    });

    document.querySelectorAll('[data-component="open-ended"]').forEach(el => {
        const { id, labeltext, placeholder, multiline } = el.dataset;
        const comp = createOpenEndedInput({
            id,
            labelText: labeltext,
            placeholder,
            multiline: multiline === 'true'
        });
        el.replaceWith(comp);
    });
}

const pages = [
    'pages/consent.html',
    'pages/consent-last.html'
];

const params = new URLSearchParams(window.location.search);
let idx = parseInt(params.get('page'), 10);
if (isNaN(idx) || idx < 0 || idx >= pages.length) {
    idx = 0;
}

const container = () => document.querySelector('.main-scroll');
const dynInsert = () => document.getElementById('dynamic-insert');
const btnPrev = () => document.querySelector('.prev-btn');
const btnNext = () => document.querySelector('.next-btn');

function updateButtons() {
    const prev = btnPrev();
    const next = btnNext();
    if (prev) prev.disabled = pageHistory.length <= 1;
    if (next) next.disabled = false;
}

async function loadPage(i, pushHistory = true) {
    if (i < 0 || i >= pages.length) return;
    if (pushHistory) {
        pageHistory.push(i);
    }
    idx = i;

    history.replaceState(null, '', `?page=${idx}`);
    updateButtons();
    const scrollEl = container();
    if (!scrollEl) return;

    scrollEl.innerHTML = '<div id="dynamic-insert"></div>';
    try {
        const isLastPage = idx > 0;
        const isAvailable = idx === 0;
        const res = await fetch(pages[idx], { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status);
        const frag = await res.text();
        const placeholder = scrollEl.querySelector('#dynamic-insert');
        if (placeholder) placeholder.insertAdjacentHTML('afterend', frag);

        renderComponents();

        const nav = createNavButtons({
            prevId: `prev_${idx}`,
            nextId: `next_${idx}`,
            onPrev: goBack,
            onNext: async () => {
                if (idx === 0) {
                    const email = responses.email || '';
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        alert('Please enter a valid email address.');
                        return;
                    }

                    if (screeningPassed(responses)) {
                        try {
                            const res = await fetch('http://localhost:3000/consent/add', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(responses)
                            });
                            if (!res.ok) throw new Error(res.statusText);

                            loadPage(1);
                        } catch (error) {
                            alert('Error: ' + error.message);
                        }
                    } else {
                        alert("Please complete the electronic signature.")
                    }
                }
            },
            isLastPage: true,
            isAvailable: isAvailable,
            hidePrev: true,
        });
        scrollEl.appendChild(nav);
    } catch (e) {
        scrollEl.innerHTML = `<div class="error">Error: ${e.message}</div>`;
    }
    updateButtons();
}

document.addEventListener('DOMContentLoaded', () => {
    loadPage(idx);
});