import ChartWorkbenchPage from './workbench/pages/ChartWorkbenchPage'
import SurveyRouter, { isSurveyView } from './survey/SurveyRouter'

export default function App() {
  const params = new URLSearchParams(window.location.search)
  const viewMode = params.get('view')

  if (isSurveyView(viewMode)) {
    return <SurveyRouter viewMode={viewMode} />
  }

  return <ChartWorkbenchPage />
}
