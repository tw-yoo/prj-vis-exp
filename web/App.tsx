import ChartWorkbenchPage from './workbench/pages/ChartWorkbenchPage'
import DemoPage from './demo/pages/DemoPage'
import SurveyRouter, { isSurveyView } from './survey/SurveyRouter'
import SpecTestPage from './specTest/pages/SpecTestPage'
import RenderingPage from './rendering/pages/RenderingPage'
import DataPage from './data/pages/DataPage'
import ReviewPage from './review/pages/ReviewPage'
import OperationSpecPage from './operationSpec/pages/OperationSpecPage'

// Clean-path aliases for survey views (e.g. /pre-registration) in addition to
// the ?view= query form. Keeps deep links like localhost:5173/pre-registration working.
const SURVEY_PATH_VIEWS: Record<string, string> = {
  '/pre-registration': 'pre-registration',
  '/pre-registration/status': 'pre-registration-status',
  '/consent': 'consent',
  '/main-survey': 'main-survey',
  '/data-collection': 'data-collection',
  '/result-viewer': 'result-viewer',
}

// Strip the Vite base prefix (e.g. '/prj-vis-exp' on GitHub Pages) so path routing
// matches the same way in dev (base '/') and production ('/prj-vis-exp/').
function getBaseRelativePath() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
  let pathname = window.location.pathname
  if (base && (pathname === base || pathname.startsWith(`${base}/`))) {
    pathname = pathname.slice(base.length)
  }
  return pathname.replace(/\/+$/, '') || '/'
}

export default function App() {
  const normalizedPath = getBaseRelativePath()
  const params = new URLSearchParams(window.location.search)
  const viewMode = SURVEY_PATH_VIEWS[normalizedPath] ?? params.get('view')

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
