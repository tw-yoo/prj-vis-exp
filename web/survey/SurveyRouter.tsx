import { Suspense, lazy, useEffect, useMemo } from 'react'

const ResultViewerPage = lazy(() => import('./pages/ResultViewerPage'))
const ConsentPage = lazy(() => import('./pages/ConsentPage'))
const PreRegistrationPage = lazy(() => import('./pages/PreRegistrationPage'))
const MainSurveyPage = lazy(() => import('./pages/MainSurveyPage'))
const DataCollectionPage = lazy(() => import('./pages/DataCollectionPage'))

type SurveyViewMode =
  | 'result-viewer'
  | 'consent'
  | 'pre-registration'
  | 'main-survey'
  | 'data-collection'
  | null

type SurveyRouterProps = {
  viewMode: string | null
}

function isSurveyView(viewMode: string | null): viewMode is Exclude<SurveyViewMode, null> {
  return (
    viewMode === 'result-viewer' ||
    viewMode === 'consent' ||
    viewMode === 'pre-registration' ||
    viewMode === 'main-survey' ||
    viewMode === 'data-collection'
  )
}

function SurveyRouter({ viewMode }: SurveyRouterProps) {
  useEffect(() => {
    const className = 'survey-light-mode'
    document.body.classList.add(className)
    return () => {
      document.body.classList.remove(className)
    }
  }, [])

  const surveyPage = useMemo(() => {
    switch (viewMode) {
      case 'result-viewer':
        return <ResultViewerPage />
      case 'consent':
        return <ConsentPage />
      case 'pre-registration':
        return <PreRegistrationPage />
      case 'main-survey':
        return <MainSurveyPage />
      case 'data-collection':
        return <DataCollectionPage />
      default:
        return null
    }
  }, [viewMode])

  return <Suspense fallback={<div className="app-shell">Loading survey page…</div>}>{surveyPage}</Suspense>
}

export { isSurveyView }
export default SurveyRouter
