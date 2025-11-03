import {MainQuestion, SurveyQuestion, ExplanationType} from "../main_survey/main_quesetion_template.js";

const tutorialSurveyQuestions = [
    new SurveyQuestion(
        "likert",
        "Q1: The provided answer is correct.",
        ["Yes", "No"]
    ),
    new SurveyQuestion(
        "likert",
        "Q2: The explanation clearly demonstrates how the answer is reached.",
        ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
    )
];

const tutorialMainQuestion = new MainQuestion({
    questionId: "tutorial1",
    pageId: "tutorial_question",
    slug: "tutorial_question",
    explanationType: ExplanationType.BASELINE,
    chartQuestionText: "Which two years since 2005 had the highest number of cases, and what were their values?",
    chartQuestionAnswer: "2017: 533.91 and 2016: 516.03 (sum: 1049.94)",
    surveyQuestions: tutorialSurveyQuestions
});

export const TUTORIAL_QUESTIONS = [
    tutorialMainQuestion
];
