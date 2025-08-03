import { renderQuestionChartAndButton } from "./charts/chart_genearation.js";
import {introPage} from "./questions/main/intro1.js";
import {page1_1Questions} from "./questions/main/question1_1.js";
import {page1_2Questions} from "./questions/main/question1_2.js";
import {preRegistrationPageQuestionList} from "./questions/pre-registration/pre-registration.js";


document.addEventListener("DOMContentLoaded", async function() {

    const creator = new SurveyCreator.SurveyCreator({
        showDesignerTab: true,
        showJSONEditorTab: true,
        showLogicTab: false,
        showTranslationTab: false,
        showThemeTab: false,
        showPreviewTab: true,
        isAutoSave: false
    });
    creator.survey.widthMode = "responsive";

    creator.activeTab = "designer";
    creator.render(document.getElementById("surveyCreator"));

    const questionList = [
        preRegistrationPageQuestionList
    ];

    const surveyJson = {
        pages: preRegistrationPageQuestionList,
        headerView: "advanced"
    };
    creator.JSON = surveyJson;
});