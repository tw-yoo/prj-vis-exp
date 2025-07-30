export const page1Questions= {
    name: "page1",
    elements: [
    {
        type: "html",
        name: "survey_intro",
        html: `
            <h2>Thank you for participating our survey!</h2>
            <p>Introduction</p>
            <ul>
                <li>Introduction1</li>
                <li>Introduction2</li>
            </ul>
            `
    },
    {
        type: "text",
        name: "question2",
        title: "What is your name?",
        isRequired: false,
    },
    {
        type: "text",
        name: "question3",
        title: "How old are you? (e.g., 25, 34)",
        inputType: "number",
        isRequired: false,
    },
    {
        type: "text",
        name: "question4",
        title: "What is your job? (e.g., undergraduate student, graduate student, software developer)",
        isRequired: false,
    }
]
}