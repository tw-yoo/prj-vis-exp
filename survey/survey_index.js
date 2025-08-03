import {renderQuestionChart} from "./charts/chart_genearation.js";
import {introPage} from "./questions/main/intro1.js";
import {page1_1Questions} from "./questions/main/question1_1.js";
import {page1_2Questions} from "./questions/main/question1_2.js";
import {tutorialPage1} from "./questions/main/tutorial1.js";
import {tutorialPageLast} from "./questions/main/tutorial_last.js";
import {tutorialPage2} from "./questions/main/tutorial2.js";
import {tutorialPage3_1} from "./questions/main/tutorial_3_1.js";
import {tutorialPage3_2} from "./questions/main/tutorial_3_2.js";
import {tutorialPage3_3} from "./questions/main/tutorial_3_3.js";
import {tutorialPage3_4} from "./questions/main/tutorial_3_4.js";


document.addEventListener("DOMContentLoaded", async function() {

    const creator = new SurveyCreator.SurveyCreator({
        showDesignerTab: true,
        showJSONEditorTab: true,
        showLogicTab: false,
        showTranslationTab: false,
        showThemeTab: false,
        showPreviewTab: true,
        isAutoSave: false,
        showSidebar: false
    });
    creator.survey.widthMode = "responsive";

    creator.onSurveyInstanceCreated.add((sender, options) => {
      if (options.area === "designer-tab" || options.area === "preview-tab") {
        const designerSurvey = options.survey;
        designerSurvey.onAfterRenderQuestion.add(async (surveyInst, opt) => {
            switch (opt.question.name) {
                case "question1":
                    await renderQuestionChart(
                        opt.htmlElement,
                        "question1",
                    );
                    break;
                case "chart_tutorial":
                    await renderQuestionChart(
                        opt.htmlElement,
                        "chart_tutorial",
                    )
            }
          // if (opt.question.name === "question1") {
          // }
        });
      }
    });

    creator.activeTab = "preview";
    creator.render(document.getElementById("surveyCreator"));

    const questionList = [
        tutorialPage1,
        tutorialPage2,
        tutorialPage3_1,
        tutorialPage3_2,
        tutorialPage3_3,
        tutorialPage3_4,
        tutorialPageLast,
        introPage,
        page1_1Questions,
        page1_2Questions,
    ];

    const surveyJson = {
      pages: questionList,
      headerView: "advanced"
    };
    creator.JSON = surveyJson;
});