import ChartWorkbenchPage from './workbench/pages/ChartWorkbenchPage'
import DemoPage from './demo/pages/DemoPage'
import SurveyRouter, { isSurveyView } from './survey/SurveyRouter'
import SpecTestPage from './specTest/pages/SpecTestPage'
import RenderingPage from './rendering/pages/RenderingPage'
import DataPage from './data/pages/DataPage'
import ReviewPage from './review/pages/ReviewPage'
import OperationSpecPage from './operationSpec/pages/OperationSpecPage'

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

  if (normalizedPath === '/rendering') {
    return <RenderingPage />
  }

  if (normalizedPath === '/data') {
    return <DataPage />
  }

  if (normalizedPath === '/review') {
    return <ReviewPage />
  }

  if (normalizedPath === '/operationSpec') {
    return <OperationSpecPage />
  }

  if (isSurveyView(viewMode)) {
    return <SurveyRouter viewMode={viewMode} />
  }

  return <ChartWorkbenchPage />
}
