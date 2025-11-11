import {MainQuestion, SurveyQuestion, ExplanationType} from "../main_survey/main_quesetion_template.js";
import {getSurveyQuestions} from "../survey_questions.js";
const TUTORIAL_TEMPLATE_PATH = 'pages/tutorial/tutorial_question_template.html';

const tutorial1ChartVlSpec = "tutorial1";
const tutorial1QuestionText = "What is the lowest case value?";
const tutorial1AnswerText = "The lowest case value is 123.061.";

const tutorial2ChartVlSpec = "tutorial2";
const tutorial2QuestionText = "What is the third-highest value?";
const tutorial2AnswerText = "The third-highest value is 603 nests.";

const tutorial3ChartVlSpec = "tutorial3";
const tutorial3QuestionText = "What is the difference between 2006 and 2008?";
const tutorial3AnswerText = "The difference between 2006 and 2008 is 2118.41.";

export const TUTORIAL_QUESTIONS = [
    ...getSurveyQuestions(tutorial1ChartVlSpec, tutorial1QuestionText, tutorial1AnswerText, ExplanationType.BASELINE, TUTORIAL_TEMPLATE_PATH),
    ...getSurveyQuestions(tutorial2ChartVlSpec, tutorial2QuestionText, tutorial2AnswerText, ExplanationType.OURS, TUTORIAL_TEMPLATE_PATH),
    ...getSurveyQuestions(tutorial3ChartVlSpec, tutorial3QuestionText, tutorial3AnswerText, ExplanationType.OURS, TUTORIAL_TEMPLATE_PATH),
];
