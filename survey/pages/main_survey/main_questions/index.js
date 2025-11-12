import {getSurveyQuestions} from "../../survey_questions.js";
import {
    q1AnswerText, q1ChartVlSpec, q1ExplanationType, q1QuestionText,
    q2AnswerText, q2ChartVlSpec, q2ExplanationType, q2QuestionText,
    q3AnswerText, q3ChartVlSpec, q3ExplanationType, q3QuestionText,
    q4AnswerText, q4ChartVlSpec, q4ExplanationType, q4QuestionText,
    q5ChartVlSpec, q5QuestionText, q5AnswerText, q5ExplanationType,
    q6ChartVlSpec, q6QuestionText, q6AnswerText, q6ExplanationType,
    q7ChartVlSpec, q7QuestionText, q7AnswerText, q7ExplanationType,
    q8ChartVlSpec, q8QuestionText, q8AnswerText, q8ExplanationType,
    q9ChartVlSpec, q9QuestionText, q9AnswerText, q9ExplanationType,
    q10ChartVlSpec, q10QuestionText, q10AnswerText, q10ExplanationType,
    q11ChartVlSpec, q11QuestionText, q11AnswerText, q11ExplanationType,
    q12ChartVlSpec, q12QuestionText, q12AnswerText, q12ExplanationType,
    q13ChartVlSpec, q13QuestionText, q13AnswerText, q13ExplanationType,
    q14ChartVlSpec, q14QuestionText, q14AnswerText, q14ExplanationType,
    q15ChartVlSpec, q15QuestionText, q15AnswerText, q15ExplanationType,
    q16ChartVlSpec, q16QuestionText, q16AnswerText, q16ExplanationType,
    q17ChartVlSpec, q17QuestionText, q17AnswerText, q17ExplanationType,
    q18ChartVlSpec, q18QuestionText, q18AnswerText, q18ExplanationType,
    q19ChartVlSpec, q19QuestionText, q19AnswerText, q19ExplanationType,
    q20ChartVlSpec, q20QuestionText, q20AnswerText, q20ExplanationType
} from "./question_part1.js";

import {ExplanationType} from "../main_quesetion_template.js";

export const MAIN_SURVEY_QUESTIONS = [
    ...getSurveyQuestions(q1ChartVlSpec, q1QuestionText, q1AnswerText, q1ExplanationType),
    ...getSurveyQuestions(q2ChartVlSpec, q2QuestionText, q2AnswerText, q2ExplanationType),
    ...getSurveyQuestions(q3ChartVlSpec, q3QuestionText, q3AnswerText, q3ExplanationType),
    ...getSurveyQuestions(q4ChartVlSpec, q4QuestionText, q4AnswerText, q4ExplanationType),
    ...getSurveyQuestions(q5ChartVlSpec, q5QuestionText, q5AnswerText, q5ExplanationType),
    ...getSurveyQuestions(q6ChartVlSpec, q6QuestionText, q6AnswerText, q6ExplanationType),
    ...getSurveyQuestions(q7ChartVlSpec, q7QuestionText, q7AnswerText, q7ExplanationType),
    ...getSurveyQuestions(q8ChartVlSpec, q8QuestionText, q8AnswerText, q8ExplanationType),
    ...getSurveyQuestions(q9ChartVlSpec, q9QuestionText, q9AnswerText, q9ExplanationType),
    ...getSurveyQuestions(q10ChartVlSpec, q10QuestionText, q10AnswerText, q10ExplanationType),
    ...getSurveyQuestions(q11ChartVlSpec, q11QuestionText, q11AnswerText, q11ExplanationType),
    ...getSurveyQuestions(q12ChartVlSpec, q12QuestionText, q12AnswerText, q12ExplanationType),
    ...getSurveyQuestions(q13ChartVlSpec, q13QuestionText, q13AnswerText, q13ExplanationType),
    ...getSurveyQuestions(q14ChartVlSpec, q14QuestionText, q14AnswerText, q14ExplanationType),
    // ...getSurveyQuestions(q15ChartVlSpec, q15QuestionText, q15AnswerText, q15ExplanationType),
    ...getSurveyQuestions(q16ChartVlSpec, q16QuestionText, q16AnswerText, q16ExplanationType),
    // ...getSurveyQuestions(q17ChartVlSpec, q17QuestionText, q17AnswerText, q17ExplanationType),
    // ...getSurveyQuestions(q18ChartVlSpec, q18QuestionText, q18AnswerText, q18ExplanationType),
    // ...getSurveyQuestions(q19ChartVlSpec, q19QuestionText, q19AnswerText, q19ExplanationType),
    // ...getSurveyQuestions(q20ChartVlSpec, q20QuestionText, q20AnswerText, q20ExplanationType),
];
