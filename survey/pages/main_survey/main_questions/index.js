import {getSurveyQuestions} from "../../survey_questions.js";
import {
    q1AnswerText, q1ChartVlSpec, q1QuestionText,
    q2AnswerText, q2ChartVlSpec, q2QuestionText,
    q3AnswerText, q3ChartVlSpec, q3QuestionText,
    q4AnswerText, q4ChartVlSpec, q4QuestionText,
} from "./question_part1.js";

import {ExplanationType} from "../main_quesetion_template.js";

export const MAIN_SURVEY_QUESTIONS = [
    ...getSurveyQuestions(q1ChartVlSpec, q1QuestionText, q1AnswerText, ExplanationType.BASELINE),
    ...getSurveyQuestions(q2ChartVlSpec, q2QuestionText, q2AnswerText, ExplanationType.OURS),
    ...getSurveyQuestions(q3ChartVlSpec, q3QuestionText, q3AnswerText, ExplanationType.OURS),
    ...getSurveyQuestions(q4ChartVlSpec, q4QuestionText, q4AnswerText, ExplanationType.BASELINE),
];
