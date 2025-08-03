export const page1_2Questions = {
    "name": "Question 1",
    "elements": [
        {
            type: "html",
            name: "survey_intro",
            html: `
            <h2>Chart, Question, Explanation</h2>
            <img src="questions/images/question1_1.png" style="width: 100%;"/>
            `
        },
        {
            "type": "rating",
            "name": "question5",
            "title": "Simple task 1 (1: Strongly disagree - 7: Strongly agree)",
            "rateCount": 7,
            "rateMax": 7
        },
        {
            "type": "text",
            "name": "question6",
            "title": "Simple task 2"
        }
    ]
}