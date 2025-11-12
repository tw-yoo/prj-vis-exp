import {
    DEFAULT_TEMPLATE_PATH,
    ExplanationType,
    MainQuestion,
    SurveyQuestion
} from "./main_survey/main_quesetion_template.js";

const surveyQuestion1_1Text = "The provided answer is correct.";
const surveyQuestion2_1Text = "The explanation clearly demonstrates how the answer is reached.";
const surveyQuestion2_2Text = "This explanation made it transparent how the system found the answer.";
const surveyQuestion2_3Text = "It was easy to follow the steps and verify the answer.";
const surveyQuestion2_4Text = "I am confident that this explanation is trustworthy and free of errors.";

const likertQuestions = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"]

export const surveyQuestion1List = [
    new SurveyQuestion(
        "likert",
        surveyQuestion1_1Text,
        ["Yes", "No"]
    )
];

export const surveyQuestion2List = [
    new SurveyQuestion(
        "likert",
        surveyQuestion2_1Text,
        likertQuestions
    ),
    new SurveyQuestion(
        "likert",
        surveyQuestion2_2Text,
        likertQuestions
    ),
    new SurveyQuestion(
        "likert",
        surveyQuestion2_3Text,
        likertQuestions
    ),
    new SurveyQuestion(
        "likert",
        surveyQuestion2_4Text,
        likertQuestions
    )
]

export function getSurveyQuestions(
    questionId,
    questionText,
    answerText,
    explanationType,
    templatePath = DEFAULT_TEMPLATE_PATH,
    options = {}
) {
    const { introKeys = [], pageIds = [], slugs = [] } = options || {};

    const surveyQuestionList = [surveyQuestion1List, surveyQuestion2List];
    const surveyQuestionItemList = [];

    for (let i = 0; i < surveyQuestionList.length; i++) {
        const introKey = Array.isArray(introKeys) ? introKeys[i] : null;
        const pageId = Array.isArray(pageIds) ? pageIds[i] : null;
        const slug = Array.isArray(slugs) ? slugs[i] : null;
        surveyQuestionItemList.push(
            new MainQuestion({
                questionId,
                explanationType,
                chartQuestionText: questionText,
                chartQuestionAnswer: answerText,
                surveyQuestions: surveyQuestionList[i],
                templatePath: templatePath,
                pageId,
                slug,
                tutorialIntroKey: introKey,
                isContinuation: i > 0
            })
        )
    }

    return surveyQuestionItemList;
}
