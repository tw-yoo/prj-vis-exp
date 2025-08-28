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

export async function updateAnswerFromGemini(spec, question) {


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
        document.getElementById('explanation').value = `Answer: ${parsed.answer}\n\nExplanation: ${parsed.explanation}`;

        await updateSpecFromExplanation(vlSpec, dataString, question, parsed.answer, parsed.explanation)

    } catch (error) {
        console.error('Error sending prompt to GenAI:', error);
    }

}

function getFormattedQuestion(vlSpec, data, question) {
    const formattedQuestion = `
  You are a data QA assistant. Answer the user's question by analyzing **only the values in Data**. The Vega-Lite spec is provided **only to disambiguate field names**; do not cite or reference it in your answer and do not base reasoning on encodings/axes/marks.
  
  RULES (STRICT):
  - Use **Data only** for any calculations or comparisons. If Data lacks what's required, respond with "unknown".
  - Do **not** mention or refer to: "Vega-Lite", "specification", "encoding", "axis", "mark", or other chart grammar terms.
  - Do **not** include code blocks, backticks, or markdown in your output.
  - Output must be valid JSON with **exactly**:
    {"answer": <string|number>, "explanation": <string>}
  - The explanation must describe the data-derived reasoning only (e.g., which rows/values determined the answer) without mentioning the spec or chart.
  - If the spec and data conflict, **trust Data**.
  
  INPUTS
  (0) Vega-Lite Spec (for disambiguation only; never reference this in the answer)
  \`\`\`json
  ${vlSpec}
  \`\`\`
  
  (1) Data
  \`\`\`json
  ${data}
  \`\`\`
  
  (2) Question
  ${question}
  `;
    return formattedQuestion;
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
    
    ### Data (sample or full)
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
