import { renderQuestionChartAndButton } from "./charts/chart_genearation.js";
import {page1Questions} from "./questions/intro1.js";
import {page1_1Questions} from "./questions/question1_1.js";
import {page1_2Questions} from "./questions/question1_2.js";


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

    creator.onSurveyInstanceCreated.add((sender, options) => {
      if (options.area === "designer-tab" || options.area === "preview-tab") {
        const designerSurvey = options.survey;
        designerSurvey.onAfterRenderQuestion.add(async (surveyInst, opt) => {
          if (opt.question.name === "question1") {
              await renderQuestionChartAndButton(
                  opt.htmlElement,
                  "question1",
            );
          }
        });
      }
    });

    creator.activeTab = "designer";
    creator.render(document.getElementById("surveyCreator"));

    const questionList = [
        page1Questions,
        page1_1Questions,
        page1_2Questions,
    ];

    const surveyJson = {
      pages: questionList,
      headerView: "advanced"
    };
    creator.JSON = surveyJson;
});