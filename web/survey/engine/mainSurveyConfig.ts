export type ExplanationType = 'OURS' | 'BASELINE' | 'EXPERT'

export type SurveyPhase = 'tutorial' | 'main'

export interface QuestionPageConfig {
  responseId: string
  phase: SurveyPhase
  questionId: string
  chartQuestionText: string
  chartQuestionAnswer: string
  explanationType: ExplanationType
  trackTime: boolean
}

export interface StaticPageConfig {
  path: string
  trackTime: boolean
}

export interface PostSessionPageConfig {
  examplesPath: string
  trackTime: boolean
}

export interface SurveyPageDescriptor {
  id: string
  slug: string
  kind: 'static' | 'question' | 'post-session'
  static?: StaticPageConfig
  question?: QuestionPageConfig
  postSession?: PostSessionPageConfig
}

interface QuestionSeed {
  questionId: string
  chartQuestionText: string
  chartQuestionAnswer: string
  explanationType: ExplanationType
}

const tutorialSeeds: QuestionSeed[] = [
  {
    questionId: 'tutorial1',
    chartQuestionText: 'What is the lowest case value?',
    chartQuestionAnswer: 'The lowest case value is 123.061.',
    explanationType: 'BASELINE',
  },
  // {
  //   questionId: 'tutorial2',
  //   chartQuestionText: 'What is the third-highest value?',
  //   chartQuestionAnswer: 'The third-highest value is 603 nests.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'tutorial3',
  //   chartQuestionText: 'What is the difference between 2006 and 2008?',
  //   chartQuestionAnswer: 'The difference between 2006 and 2008 is 2118.41.',
  //   explanationType: 'OURS',
  // },
]

const mainSeeds: QuestionSeed[] = [
  {
    questionId: 'bar_simple_200_25',
    chartQuestionText: 'What is the minimum value?',
    chartQuestionAnswer: 'The minimum total cost is 5.0 (£ Million).',
    explanationType: 'BASELINE',
  },
  // {
  //   questionId: 'line_simple_202_135',
  //   chartQuestionText:
  //     'Is the sum of all positive year-over-year changes greater than the absolute sum of all negative year-over-year changes?',
  //   chartQuestionAnswer: 'Yes',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'bar_simple_202_80',
  //   chartQuestionText: 'What is the minimum value?',
  //   chartQuestionAnswer: 'The minimum value is 2235 metres, corresponding to Cima di Posta.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'bar_simple_202_191',
  //   chartQuestionText: 'What is the difference between the average of the highest three votes and the lowest three votes?',
  //   chartQuestionAnswer: 'The difference between the average of the highest three votes and the lowest three votes is 83940.33.',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'line_simple_201_7',
  //   chartQuestionText: 'What is the average of all values?',
  //   chartQuestionAnswer: 'The average of all Gross Domestic Product values is 10168.17.',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'line_simple_202_135',
  //   chartQuestionText: 'What is the largest single-step increase in the series between consecutive years?',
  //   chartQuestionAnswer:
  //     'The largest single-step increase in average audience share is 1.82 million, occurring between the 2002–2003 and 2003–2004 periods.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'line_simple_203_127',
  //   chartQuestionText: 'What is the latest value minus the earliest value?',
  //   chartQuestionAnswer: 'The latest attendance value minus the earliest attendance value is 47.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'line_simple_203_424',
  //   chartQuestionText: 'What is the difference between the 2nd-highest value and the 5th-highest value?',
  //   chartQuestionAnswer: 'The difference between the 2nd-highest winnings and the 5th-highest winnings is 265963.',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'bar_stacked_202_44',
  //   chartQuestionText: 'From the year 1900 onwards, what percentage of the combined population is contributed by the top 1 ethnic groups?',
  //   chartQuestionAnswer:
  //     'From the year 1900 onwards, the top 1 ethnic group contributes 85.56% of the combined population.',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'bar_stacked_202_196',
  //   chartQuestionText: 'From the year 1900 onwards, what percentage of the combined population is contributed by the top 1 ethnic groups?',
  //   chartQuestionAnswer:
  //     'From the year 1900 onwards, the top 1 ethnic group contributes 85.56% of the combined population.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'bar_stacked_203_59',
  //   chartQuestionText: "What is the maximum value of Brazil's production?",
  //   chartQuestionAnswer: 'The maximum production value for Brazil is 40000.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'bar_stacked_203_61',
  //   chartQuestionText: 'Across all nations, is the total number of Gold medals greater than the combined total of Silver and Bronze medals?',
  //   chartQuestionAnswer: 'No',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'bar_grouped_200_42',
  //   chartQuestionText: 'Which month has the highest average high temperature?',
  //   chartQuestionAnswer: 'July has the highest average high temperature.',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'bar_grouped_202_239',
  //   chartQuestionText:
  //     'Across all languages, is the average of the “synthesis” values greater than the average of the “derivation” values?',
  //   chartQuestionAnswer: 'Yes',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'bar_grouped_203_88',
  //   chartQuestionText: 'What is the average value of female?',
  //   chartQuestionAnswer: 'The average population for females is approximately 156399.33.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'bar_grouped_203_90',
  //   chartQuestionText: 'Among Hindu, Muslim, and Sikh, which group has the highest ratio of Work participation to Literacy?',
  //   chartQuestionAnswer: 'The Hindu group has the highest ratio of Work participation to Literacy.',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'line_multiple_200_10',
  //   chartQuestionText: 'What is the maximum value across all series and time points?',
  //   chartQuestionAnswer: 'NA',
  //   explanationType: 'BASELINE',
  // },
  // {
  //   questionId: 'line_multiple_201_22',
  //   chartQuestionText:
  //     'What is the difference between the highest gap and the lowest gap between average high and average low for each month?',
  //   chartQuestionAnswer: 'Yes',
  //   explanationType: 'OURS',
  // },
  // {
  //   questionId: 'line_multiple_202_269',
  //   chartQuestionText: 'Which series has the highest overall maximum value?',
  //   chartQuestionAnswer: 'NA',
  //   explanationType: 'OURS',
  // },
  {
    questionId: 'line_multiple_203_95',
    chartQuestionText: 'For the Democratic Party, what is the difference between the 2nd and the 5th highest values?',
    chartQuestionAnswer: 'NA',
    explanationType: 'BASELINE',
  },
]

function createQuestionPage(seed: QuestionSeed, phase: SurveyPhase, index: number, trackTime: boolean): SurveyPageDescriptor {
  const responseId = `${phase}_${index + 1}_${seed.questionId}_${seed.explanationType.toLowerCase()}`
  return {
    id: responseId,
    slug: responseId,
    kind: 'question',
    question: {
      responseId,
      phase,
      questionId: seed.questionId,
      chartQuestionText: seed.chartQuestionText,
      chartQuestionAnswer: seed.chartQuestionAnswer,
      explanationType: seed.explanationType,
      trackTime,
    },
  }
}

export function buildMainSurveyPageDescriptors(): SurveyPageDescriptor[] {
  const tutorialQuestionPages = tutorialSeeds.map((seed, index) => createQuestionPage(seed, 'tutorial', index, false))
  const mainQuestionPages = mainSeeds.map((seed, index) => createQuestionPage(seed, 'main', index, true))

  return [
    {
      id: 'access_code',
      slug: 'main',
      kind: 'static',
      static: { path: 'pages/main.html', trackTime: true },
    },
    {
      id: 'tutorial_overview',
      slug: 'tutorial_overview',
      kind: 'static',
      static: { path: 'pages/tutorial/tutorial_overview.html', trackTime: false },
    },
    ...tutorialQuestionPages,
    {
      id: 'main_survey_intro',
      slug: 'main_intro',
      kind: 'static',
      static: { path: 'pages/main_survey/main_intro.html', trackTime: true },
    },
    ...mainQuestionPages,
    {
      id: 'post_session',
      slug: 'post_session',
      kind: 'post-session',
      postSession: { examplesPath: 'data/post_session_examples.json', trackTime: true },
    },
    {
      id: 'completion',
      slug: 'completion',
      kind: 'static',
      static: { path: 'pages/completion.html', trackTime: false },
    },
  ]
}
