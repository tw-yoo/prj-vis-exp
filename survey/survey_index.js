import {generateCompletionCode, renderQuestionChart} from "./charts/chart_genearation.js";
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
import {surveyPageLast} from "./questions/main/survey_last.js";


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
    creator.survey.widthMode = "static";

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
                    break;
                case "chart_tutorial2":
                    await renderQuestionChart(
                        opt.htmlElement,
                        "chart_tutorial2",
                    )
                    break;
                case "survey_last":
                    await generateCompletionCode(
                        document.querySelector('.sd-question')
                    )
                    break;
            }
          // if (opt.question.name === "question1") {
          // }
        });
        if (!options.survey.__timingAttached) {
          setupPageTimingFor(options.survey);
          options.survey.__timingAttached = true;
        }
      }
    });

    creator.activeTab = "preview";
    creator.render(document.getElementById("surveyCreator"));

    const questionList = [
        introPage,
        tutorialPage1,
        // tutorialPage2,
        tutorialPage3_1,
        tutorialPage3_2,
        // tutorialPage3_3,
        // tutorialPage3_4,
        tutorialPageLast,
        //
        // page1_1Questions,
        // page1_2Questions,
        surveyPageLast
    ];

    const surveyJson = {
      pages: questionList,
      headerView: "advanced",
        widthMode: "static"
    };
    creator.JSON = surveyJson;

    // --- page-level timing tracking ---
    function setupPageTimingFor(survey) {
      const pageStartTimes = {};
      // const firstPageName = survey.pages && survey.pages.length ? survey.pages[0].name : null;

      function generateFallbackUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }

      function createSessionIfNeeded() {
        console.log('Creating session');
        if (!survey.data.session_id) {
          const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : generateFallbackUUID();
          survey.data.session_id = id;
          if (!survey.data.session_started_at) {
            survey.data.session_started_at = new Date().toISOString();
          }
        }
        return survey.data.session_id;
      }

      function sendPageTimingToBackend(pageName, durationMs) {
        console.log('Sending page to backend page');
        const payload = {
          page: pageName,
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
          survey_data: survey.data
        };
        if (survey.data.session_id) {
          payload.session_id = survey.data.session_id;
        }
        fetch('http://localhost:3000/api/page-timing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch((e) => {
          console.warn('Failed to send timing data', e);
        });
      }

      function sendFinalSurveyData(survey) {
        let surveyData = survey.data || {};
        if (Object.keys(surveyData).length === 0 && typeof survey.getPlainData === 'function') {
          const plain = survey.getPlainData({ includeEmpty: true });
          surveyData = plain.reduce((acc, item) => { acc[item.name] = item.value; return acc; }, {});
        }
        const payload = {
          session_id: survey.data.session_id,
          event: 'survey_completed',
          timestamp: new Date().toISOString(),
          session_started_at: survey.data.session_started_at,
          time_per_page: survey.data.time_per_page || {},
          page_transitions: survey.data.page_transitions || [],
          survey_data: surveyData
        };
        fetch('http://localhost:3000/api/survey-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(response => {
          if (response.ok) {
            console.log('Successfully sent final survey data');
          } else {
            console.warn('Failed to send final survey data', response.statusText);
          }
        }).catch(e => {
          console.warn('Failed to send final survey data', e);
        });
      }

      survey.onStarted.add((sender) => {
        if (sender.currentPage) {
          pageStartTimes[sender.currentPage.name] = Date.now();
        }
      });

      survey.onCurrentPageChanged.add((sender, options) => {
        const now = Date.now();
        if (options.oldCurrentPage) {
          if (!survey.data.session_id && options.oldCurrentPage && survey.pages && survey.pages.length && options.oldCurrentPage.name === survey.pages[0].name) {
            createSessionIfNeeded();
          }
          const prevName = options.oldCurrentPage.name;
          const start = pageStartTimes[prevName] || 0;
          if (start) {
            const durationMs = now - start;
            const times = sender.data.time_per_page || {};
            times[prevName] = (times[prevName] || 0) + durationMs;
            sender.data.time_per_page = times;
            if (options.newCurrentPage) {
              const transitions = sender.data.page_transitions || [];
              transitions.push({
                from_page: prevName,
                to_page: options.newCurrentPage.name,
                duration_ms: durationMs,
                transition_at: new Date(now).toISOString()
              });
              sender.data.page_transitions = transitions;
            }
          }
        }
        if (options.newCurrentPage) {
          pageStartTimes[options.newCurrentPage.name] = now;
        }
      });

      survey.onComplete.add((sender) => {
        const now = Date.now();
        if (sender.currentPage) {
          const currName = sender.currentPage.name;
          const start = pageStartTimes[currName] || 0;
          if (start) {
            const durationMs = now - start;
            const times = sender.data.time_per_page || {};
            times[currName] = (times[currName] || 0) + durationMs;
            sender.data.time_per_page = times;
          }
        }
        sendFinalSurveyData(sender);
        console.log('Per-page durations (ms):', sender.data.time_per_page);
      });
    }
});