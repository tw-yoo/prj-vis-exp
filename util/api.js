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
Instructions: You will receive (A) a Vega-Lite chart specification, (B) tabular data, and (C) a natural-language question. Your task is to answer the question by analyzing the data and explaining your reasoning as if you're telling a story about the data itself—NOT about chart operations.

Critical Guidelines:
- FOCUS ON THE DATA, NOT THE OPERATIONS: Don't say "sort by X then filter Y". Instead, describe what you found: "The three highest values are A, B, C..."
- BE CONVERSATIONAL: Write like you're explaining to a colleague over coffee, not writing a technical manual
- LEAD WITH FINDINGS: Start each reasoning step with what you discovered, then mention the values
- MENTION CONCRETE VALUES: Always include the actual numbers and labels so readers can verify
- USE NATURAL TRANSITIONS: "Looking at the data...", "Among these...", "Comparing these values...", "This means..."

Bad Example (operation-focused):
"Sort the data by Votes descending. Take the top 3. Calculate their average."

Good Example (data-focused):
"Looking at the vote counts, the three highest-polling parties are Liberal Democratic League (164,376 votes), Anti Revolutionary Party (143,843 votes), and General League (76,605 votes). Their average is about 128,275 votes. On the other end, the three lowest performers are Christian Historicals (62,770), Free-thinking Democratic League (51,595), and Other parties (18,638), averaging 44,334 votes. The difference between these two groups is 83,940 votes."

Structure your explanation as:
1. State what you're looking for
2. Name the specific data points you found (with values)
3. Perform any calculations while showing the numbers
4. State the final answer clearly

Output: Provide (1) a SHORT final answer (just the number/value), and (2) a DATA-FOCUSED explanation in plain English (no Markdown, no operation descriptions).

INPUTS
(A) Vega-Lite Spec (for field names only)
\`\`\`json
${specStr}
\`\`\`

(B) Data
\`\`\`json
${dataStr}
\`\`\`

(C) Question
${question}

Remember: Explain WHAT you found in the data, not HOW you searched for it.
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
