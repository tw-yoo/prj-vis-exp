import {MainQuestion, SurveyQuestion, ExplanationType} from "../main_quesetion_template.js";

const surveyQuestionText = "The provided answer is correct.";

export const q1 = new MainQuestion({
    questionId: "q1",
    explanationType: ExplanationType.OURS,
    chartQuestionText: "Which two years since 2005 had the highest number of cases, and what were their values?",
    chartQuestionAnswer: "1049.94",
    surveyQuestions: [
        new SurveyQuestion(
            "likert",
            surveyQuestionText,
            ["Yes", "No"]
        )
    ]
});
