const ledeText = '';

export const tutorialExamplesData = {
    tutorial_ex1: {
        order: 1,
        total: 5,
        title: 'Simple Bar Chart Example',
        specPath: 'pages/tutorial/bar_simple.json',
        question: 'What is the average market share of the top 3 companies?',
        answer: '0.126',
        operations: ['Sort', 'Nth', 'Average'],
        explanation: [
            '1. Sort companies by market share in descending order',
            '2. Select the top 3 companies: Conad (0.148), Coop Italia (0.129), Selex (0.101)',
            '3. Calculate the average: (0.148 + 0.129 + 0.101) / 3 = 0.126'
        ].join('\n')
    },
    tutorial_ex2: {
        order: 2,
        total: 5,
        title: 'Grouped Bar Chart Example',
        specPath: 'pages/tutorial/bar_grouped.json',
        question: 'What is the difference between the highest percentage in the Men group and the lowest percentage in the Women group?',
        answer: '0.622',
        operations: ['Filter', 'Find Extremum', 'Difference'],
        explanation: [
            '1. Filter data to get only Men group values',
            '2. Find the maximum percentage in Men: 0.752 (60 years and over)',
            '3. Filter data to get only Women group values',
            '4. Find the minimum percentage in Women: 0.13 (18 to 39 years)',
            '5. Calculate the difference: 0.752 - 0.13 = 0.622'
        ].join('\n')
    },
    tutorial_ex3: {
        order: 3,
        total: 5,
        title: 'Stacked Bar Chart Example',
        specPath: 'pages/tutorial/bar_stacked.json',
        question: 'Which racial/ethnic group has the highest combined share of interested respondents (Very interested + Somewhat interested)?',
        answer: 'Hispanic',
        operations: ['Filter', 'Sum', 'Find Extremum'],
        explanation: [
            '1. For each racial/ethnic group, filter only "Very interested" and "Somewhat interested"',
            '2. Sum these values for each group:',
            '   - White: 0.2 + 0.35 = 0.55',
            '   - Hispanic: 0.16 + 0.43 = 0.59',
            '   - Black: 0.19 + 0.33 = 0.52',
            '   - Other: 0.21 + 0.34 = 0.55',
            '3. Find the maximum value: 0.59 (Hispanic group)'
        ].join('\n')
    },
    tutorial_ex4: {
        order: 4,
        total: 5,
        title: 'Simple Line Chart Example',
        specPath: 'pages/tutorial/line_simple.json',
        question: 'How many years have enterprise numbers above the overall average?',
        answer: '4',
        operations: ['Average', 'Filter', 'Count'],
        explanation: [
            '1. Calculate the overall average across all years',
            '   - Average = 498722.56',
            '2. Filter to find years where number of enterprises > 498722.56',
            '   - Filtered years: 2012, 2013, 2014, 2016',
            '3. Count the number of filtered years: 4'
        ].join('\n')
    },
    tutorial_ex5: {
        order: 5,
        total: 5,
        title: 'Multiple Line Chart Example',
        specPath: 'pages/tutorial/line_multiple.json',
        question: 'What is the difference between Playoff teams and All teams in the year when Playoff teams had their second highest average payroll?',
        answer: '21',
        operations: ['Filter', 'Sort', 'Nth', 'Retrieve Value', 'Difference'],
        explanation: [
            '1. Filter the data to get only Playoff teams values',
            '2. Sort Playoff teams values in descending order',
            '3. Find the 2nd highest value using Nth operation',
            '   - 2nd highest value for Playoff teams: 109.9 (occurs in 2009)',
            '4. Retrieve All teams\' value in the same year (2009)',
            '   - All teams in 2009: 88.9',
            '5. Calculate the difference: 109.9 - 88.9 = 21'
        ].join('\n')
    }
};
