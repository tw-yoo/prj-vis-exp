import {MainQuestion, SurveyQuestion, ExplanationType} from "../main_survey/main_quesetion_template.js";

const tutorialSurveyQuestions = [
    new SurveyQuestion(
        "likert",
        "Q1: The provided answer is correct.",
        ["Yes", "No"]
    ),
    // new SurveyQuestion(
    //     "likert",
    //     "Q2: The explanation clearly demonstrates how the answer is reached.",
    //     ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]
    // )
];

const tutorialMainQuestion1 = new MainQuestion({
    questionId: "tutorial1",
    pageId: "tutorial_question",
    slug: "tutorial_question",
    explanationType: ExplanationType.BASELINE,
    chartQuestionText: "tutorial question 1",
    chartQuestionAnswer: "tutorial answer 1",
    surveyQuestions: tutorialSurveyQuestions
});

const tutorialMainQuestion2 = new MainQuestion({
    questionId: "tutorial2",
    pageId: "tutorial_question",
    slug: "tutorial_question",
    explanationType: ExplanationType.EXPERT,
    chartQuestionText: "tutorial question 2",
    chartQuestionAnswer: "tutorial answer 2",
    surveyQuestions: tutorialSurveyQuestions
});

const tutorialMainQuestion3 = new MainQuestion({
    questionId: "tutorial3",
    pageId: "tutorial_question",
    slug: "tutorial_question",
    explanationType: ExplanationType.OURS,
    chartQuestionText: "tutorial question 3",
    chartQuestionAnswer: "tutorial answer 3",
    surveyQuestions: tutorialSurveyQuestions
});

export const TUTORIAL_QUESTIONS = [
    tutorialMainQuestion1,
    tutorialMainQuestion2,
    tutorialMainQuestion3,
];
