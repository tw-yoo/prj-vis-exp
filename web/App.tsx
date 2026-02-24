import ChartWorkbenchPage from './workbench/pages/ChartWorkbenchPage'
import DemoPage from './demo/pages/DemoPage'
import SurveyRouter, { isSurveyView } from './survey/SurveyRouter'
import SpecTestPage from './specTest/pages/SpecTestPage'

export default function App() {
  const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(window.location.search)
  const viewMode = params.get('view')

  if (normalizedPath === '/specTest') {
    return <SpecTestPage />
  }

  if (normalizedPath === '/demo') {
    return <DemoPage />
  }

  if (isSurveyView(viewMode)) {
    return <SurveyRouter viewMode={viewMode} />
  }

  return <ChartWorkbenchPage />
}
