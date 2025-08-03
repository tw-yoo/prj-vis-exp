import {surveyConsentQuestionList} from "./questions/main/consent/consent.js";

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

    const surveyJson = {
        pages: surveyConsentQuestionList,
        headerView: "advanced"
    };
    creator.JSON = surveyJson;
});