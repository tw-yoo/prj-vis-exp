export type DataCollectionPageKind = 'login' | 'static' | 'tutorial-example' | 'task' | 'complete'

export interface LoginPageDescriptor {
  kind: 'login'
  id: 'login'
  slug: 'login'
}

export interface StaticPageDescriptor {
  kind: 'static'
  id: string
  slug: string
  path: string
}

export interface TutorialExamplePageDescriptor {
  kind: 'tutorial-example'
  id: string
  slug: string
  exampleId: string
}

export interface TaskPageDescriptor {
  kind: 'task'
  id: 'tutorial-task' | 'main-task'
  slug: string
  mode: 'tutorial' | 'main'
  chartId: string
}

export interface CompletePageDescriptor {
  kind: 'complete'
  id: 'complete'
  slug: 'complete'
}

export type DataCollectionPageDescriptor =
  | LoginPageDescriptor
  | StaticPageDescriptor
  | TutorialExamplePageDescriptor
  | TaskPageDescriptor
  | CompletePageDescriptor

const LOGIN_PAGE: LoginPageDescriptor = { kind: 'login', id: 'login', slug: 'login' }
const TUTORIAL_INTRO_PAGE: StaticPageDescriptor = {
  kind: 'static',
  id: 'tutorial_index',
  slug: 'tutorial_index',
  path: 'pages/tutorial/tutorial_index.html',
}
const TUTORIAL_END_PAGE: StaticPageDescriptor = {
  kind: 'static',
  id: 'tutorial_end',
  slug: 'tutorial_end',
  path: 'pages/tutorial/tutorial_end.html',
}
const COMPLETE_PAGE: CompletePageDescriptor = { kind: 'complete', id: 'complete', slug: 'complete' }

const TUTORIAL_EXAMPLE_IDS = ['tutorial_ex1', 'tutorial_ex2', 'tutorial_ex3', 'tutorial_ex4', 'tutorial_ex5']

export function buildDataCollectionPageDescriptors(
  assignedCharts: string[],
  tutorialCharts: string[],
): DataCollectionPageDescriptor[] {
  const tutorialTasks: TaskPageDescriptor[] = (tutorialCharts || []).map((chartId) => ({
    kind: 'task',
    id: 'tutorial-task',
    mode: 'tutorial',
    chartId,
    slug: `tutorial-${chartId}`,
  }))

  const mainTasks: TaskPageDescriptor[] = (assignedCharts || []).map((chartId) => ({
    kind: 'task',
    id: 'main-task',
    mode: 'main',
    chartId,
    slug: chartId,
  }))

  const tutorialExamples: TutorialExamplePageDescriptor[] = TUTORIAL_EXAMPLE_IDS.map((exampleId) => ({
    kind: 'tutorial-example',
    id: exampleId,
    slug: exampleId,
    exampleId,
  }))

  return [LOGIN_PAGE, TUTORIAL_INTRO_PAGE, ...tutorialExamples, ...tutorialTasks, TUTORIAL_END_PAGE, ...mainTasks, COMPLETE_PAGE]
}

export function computeProgressTotal(descriptors: DataCollectionPageDescriptor[]) {
  const total = descriptors.filter((descriptor) => descriptor.id !== 'login').length
  return total > 0 ? total : 1
}

export function computeProgressCurrent(descriptors: DataCollectionPageDescriptor[], pageIndex: number) {
  const currentDescriptor = descriptors[pageIndex]
  if (!currentDescriptor || currentDescriptor.id === 'login') return null
  let current = 0
  for (let index = 0; index <= pageIndex; index += 1) {
    if (descriptors[index]?.id !== 'login') current += 1
  }
  return current > 0 ? current : 1
}

