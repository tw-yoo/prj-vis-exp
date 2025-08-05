export const tutorialPage3_1= {
    name: "tutorial2",
    elements: [
        {
            type: "html",
            name: "chart_tutorial_intro",
            html: `
            <h2>튜토리얼 (1/4)</h2>
            <p><strong>각 세트에는 차트와 질문, 그리고 한 가지 설명 방법(방법 1 ~ 4)이 나옵니다.</strong></p>
            <p><strong>차트:</strong> 바 차트, 라인 차트 중 한 가지가 주어집니다.</p>
            <p><strong>질문:</strong> 주어진 차트와 관련된 질문이 주어집니다.</p>
            <p><strong>설명:</strong> 질문의 답변에 대한 설명이 주어집니다. 설명은 텍스트, 또는 이미지 등을 포함합니다. </p>
            
            <p>각 세트마다 주어진 차트, 질문, 설명을 잘 읽고, 설문에 응답해주시기 바랍니다.</p>
            <p>이 설문에서는 각 라운드(설명+응답)에 소요된 <strong>시간을 기록</strong>하고 있습니다. 이는 여러분이 설명을 이해하고 반응하는 데 걸리는 시간을 분석하기 위한 목적이며, <strong>정답</strong>의 정확성이 가장 중요합니다. 너무 천천히 끌기보다는 내용을 빠르게 읽고 <strong>직관적</strong>으로 응답을 부탁드립니다.</p>
            
            <h3>주어지는 차트 예시:</h3>
            `
        },
        {
            type: "html",
            name: "chart_tutorial",
            html: `
                <h3>주어지는 질문 예시:</h3>
                <h3>2005년 이후 연도 중 cases가 가장 많은 두 해는 언제이며, 각각의 값은 얼마인가요?</h3>
            `
        },
        {
            type: "html",
            name: "chart_exp1",
            html: `
                <h3>주어지는 설명 예시</h3>
                <p>The two years after 2005 with the highest number of cases are 2017 and 2016. The sum of their cases is 1049.94.</p>
                <div class="container">
        <p>To answer the question, we need to analyze the provided dataset, which contains 'cases' and 'year' information. The question asks for the two years with the most cases from 2005 onwards and the sum of those cases.</p>
        <ol>
            <li>
                <strong>Filter the Data:</strong> We first isolate the data points for the years 2005 and later.
                <ul>
                    <li>2005: 184.211</li>
                    <li>2006: 168.827</li>
                    <li>2007: 174.935</li>
                    <li>2008: 186.108</li>
                    <li>2009: 223.809</li>
                    <li>2010: 262.799</li>
                    <li>2011: 297.551</li>
                    <li>2012: 325.044</li>
                    <li>2013: 344.23</li>
                    <li>2014: 408.037</li>
                    <li>2015: 456.216</li>
                    <li>2016: 516.031</li>
                    <li>2017: 533.909</li>
                </ul>
            </li>
            <li>
                <strong>Identify the Top Two Years:</strong> By examining the 'cases' values for this filtered period, we can identify the two highest values.
                <ul style="list-style-type: disc; padding-left: 40px;">
                    <li>The highest number of cases is <strong>533.909</strong>, which occurred in the year <strong>2017</strong>.</li>
                    <li>The second-highest number of cases is <strong>516.031</strong>, which occurred in the year <strong>2016</strong>.</li>
                </ul>
            </li>
            <li>
                <strong>Calculate the Sum:</strong> Finally, we sum the 'cases' for these two years.
                <p class="calculation">
                    Sum = 533.909 (from 2017) + 516.031 (from 2016) = <strong>1049.94</strong>.
                </p>
            </li>
        </ol>
    </div>
            `
        },
        {
            type: "html",
            name: "tutorial_3_1exp",
            html: `
                <h3>차트, 질문, 설명을 읽고 난 뒤 아래 설문에 응답해주세요. </h3>
            `
        },
        {
            type: "rating",
            name: "survey_question1",
            title: "이 설명을 통해 질문의 정답을 이해할 수 있었다.",
            minRateDescription: "전혀 동의하지 않는다.",
            maxRateDescription: "매우 동의한다."
        },
        {
            type: "rating",
            name: "survey_question1",
            title: "제시된 설명이 정확하다",
            minRateDescription: "전혀 동의하지 않는다.",
            maxRateDescription: "매우 동의한다."
        }
    ]
}