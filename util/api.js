async function getKey() {
    const res = await fetch("./config.json");
    const config = await res.json();
    return config.API_KEY;
}

function stringifyDataForPrompt(data, maxRows = 2000) {
    if (!data) return "[]";

    // 배열일 경우
    if (Array.isArray(data)) {
        const sample = data.slice(0, maxRows); // 너무 크면 앞부분만 사용
        return JSON.stringify(sample, null, 2);
    }

    // 객체일 경우
    if (typeof data === "object") {
        return JSON.stringify(data, null, 2);
    }

    // 문자열(CSV 원문 등)일 경우
    return String(data);
}

export async function updateAnswerFromGemini(spec, question, hooks = {}) {
    const { onAnswerStart, onAnswerEnd, onOpsStart, onOpsEnd } = hooks;

    onAnswerStart?.();
    let opsStarted = false;
    let opsFinished = false;
    const key = await getKey();

    let data;
    if (spec.data && Array.isArray(spec.data.values)) {
        data = spec.data.values.map(d => ({...d}));
    } else if (spec.data && typeof spec.data.url === 'string') {
        if (spec.data.url.endsWith('.json')) {
            data = await d3.json(spec.data.url);
        } else {
            data = await d3.csv(spec.data.url);
        }
    } else {
        console.warn('spec.data.values or spec.data.url is required');
        data = [];
    }
    const dataString = stringifyDataForPrompt(data);
    const vlSpec = JSON.stringify(spec, null, 2);

    const questionPrompt = getFormattedQuestion(vlSpec, dataString, question);

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + key,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: questionPrompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                answer: { type: "STRING" },
                                explanation: { type: "STRING" }
                            }
                        }
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();

        const parsed = JSON.parse(responseData.candidates[0].content.parts[0].text);
        const answerEl = document.getElementById('explanation');
        if (answerEl) {
            answerEl.value = `Answer: ${parsed.answer}\n\nExplanation: ${parsed.explanation}`;
        }

        onOpsStart?.();
        opsStarted = true;
        try {
            await updateSpecFromExplanation(vlSpec, dataString, question, parsed.answer, parsed.explanation);
            onOpsEnd?.({ success: true });
            opsFinished = true;
        } catch (specError) {
            onOpsEnd?.({ success: false, error: specError });
            opsFinished = true;
            throw specError;
        }

        onAnswerEnd?.({ success: true });
    } catch (error) {
        if (opsStarted && !opsFinished) {
            onOpsEnd?.({ success: false, error });
        }
        onAnswerEnd?.({ success: false, error });
        const answerEl = document.getElementById('explanation');
        if (answerEl) {
            answerEl.value = 'Failed to generate answer.\nSee console for details.';
        }
        console.error('Error sending prompt to GenAI:', error);
    }
}

function getFormattedQuestion(vlSpec, data, question) {
    const specStr = typeof vlSpec === "string" ? vlSpec : JSON.stringify(vlSpec, null, 2);
    const dataStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);

    return `
Instructions: You will receive (A) a Vega-Lite specification, (B) tabular data, and (C) a natural-language question. Answer using only the supplied data and describe the process as if a person is performing sequential chart interactions (filtering, sorting, highlighting).

Human-centered Guidelines:
- Work strictly from the provided rows/columns. If information is missing, state that the table is insufficient.
- Narrate your reasoning in plain English (no Markdown or emphasis). Each sentence should read like stage directions: “Filter to … then highlight … finally compare …”.
- Keep workflows single-pass. Shared steps such as sorting or filtering should happen once, then reuse that state to pick multiple values (e.g., grab both middle ranks via a single "nth"-style step before averaging). Do not repeat identical operations for each target.
- When multiple marks are needed (e.g., median of an even-length list), describe isolating all required values first and then performing any aggregation in a final step.
- Mention numeric values with their associated labels so another person could reproduce the steps and confirm the answer.
- Call out ties or empty result sets explicitly. Do not claim statistical significance or causal relationships; limit the response to descriptive facts from the table.

Output: Provide (1) a concise English answer and (2) a short, human-centered explanation of the steps you took (still plain text, no Markdown). Keep everything self-contained so someone else could replicate the workflow.

INPUTS
(A) Vega-Lite Spec (for disambiguation only; never reference this in the answer)
\`\`\`json
${specStr}
\`\`\`

(B) Data
\`\`\`json
${dataStr}
\`\`\`

(C) Question
${question}
`;
}

async function updateSpecFromExplanation(vlSpec, data, question, answer, explanation) {
    // 1) Load instruction markdown (must be served by a local server; cannot be read from disk via file://)

    let instructionMd = "";
    try {
        const mdRes = await fetch("./instruction.md");
        if (!mdRes.ok) throw new Error(`Failed to load instruction.md: ${mdRes.status}`);
        instructionMd = await mdRes.text();
    } catch (e) {
        console.error("Could not load instruction.md. Make sure it exists at project root and is served by a local server.", e);
        instructionMd = ""; // fallback to empty instruction
    }

    // 2) Build prompt by combining instruction + task context
    const prompt = `
    ${instructionMd}
    
    -----
    
    ## Inputs
    ### Vega-Lite Spec
    \`\`\`json
    ${vlSpec}
    \`\`\`
    
    ### Data
    \`\`\`json
    ${data}
    \`\`\`
    
    ### Question
    ${question}
    
    ### Answer
    ${answer}
    
    ### Explanation
    ${explanation}
    `;
    try {
        const key = await getKey();
        const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + key,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            }
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => "<no body>");
            console.error("Gemini API error body:", errText);
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const dataJson = await res.json();
        let text = dataJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            console.warn('LLM did not return strict JSON, using raw text.');
            parsed = { ops: [], notes: text };
        }

        const updatedValue = JSON.stringify(parsed, null, 2);

        if (window.opsEditor && typeof window.opsEditor.setValue === 'function') {
            window.opsEditor.setValue(updatedValue);
        } else {
            const ta = document.getElementById('ops-spec');
            if (ta) ta.value = updatedValue;
        }

        // return { updatedSpec: parsed.updatedSpec, notes: parsed.notes ?? "" };

    } catch (err) {
        console.error("updateSpecFromExplanation error:", err);
        return { updatedSpec: null, notes: "", error: String(err) };
    }
}
