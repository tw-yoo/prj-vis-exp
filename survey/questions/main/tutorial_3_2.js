export const tutorialPage3_2= {
    name: "tutorial2",
    elements: [
        {
            type: "html",
            name: "chart_tutorial_intro",
            html: `
            <h2>튜토리얼 (2/4)</h2>
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
            name: "chart_tutorial2",
            html: `
                <h3>주어지는 질문 예시:</h3>
                <h3>2009년 이후 연도 중 revenue가 가장 높은 상위 3개 연도와 그 합은 얼마인가?</h3>
            `
        },
        {
            type: "html",
            name: "chart_exp2",
            html: `
                <h3>설명 2: 다음 설명을 읽고 설문에 응답해주세요.</h3>
                <img src="questions/main/images/tutorial_llm_image.png" style="width: 50%;"/>
                <p>The two years after 2005 with the highest number of cases are 2017 and 2016. The sum of their cases is 1049.94.</p>
                <div class="container">
        <p>To answer the question, we need to analyze the provided dataset, which contains 'cases' and 'year' information. The question asks for the two years with the most cases from 2005 onwards and the sum of those cases.</p>
        <ol>
            <li>
                <strong>Filter:</strong> We consider years “since 2009,” i.e., 2009 and later. The relevant subset of the data is:
                <ul>
                    <li>2009: 80.7</li>
                    <li>2010: 82.84</li>
                    <li>2011: 94.52</li>
                    <li>2012: 113.29</li>
                    <li>2013: 156.34</li>
                    <li>2014: 167.05</li>
                    <li>2015: 189.4</li>
                </ul>
            </li>
            <li>
                <strong>Sort:</strong> Sort these years by revenue in descending order:
                <ul style="list-style-type: disc; padding-left: 40px;">
                    <li>2015: 189.4</li>
                    <li>2014: 167.05</li>
                    <li>2013: 156.34</li>
                    <li>… (others are lower)</li>
                </ul>
            </li>
            <li>
                <strong>Select top 3:</strong> The top three are 2015, 2014, and 2013.
            </li>
            <li>
                <strong>Aggregate (sum):</strong> Add their revenues:
                189.4 + 167.05 + 156.34 = 512.79
            </li>
        </ol>
    </div>
            `
        },
        {
            type: "html",
            name: "tutorial_3_1exp",
            html: `
                <h3>설명을 읽고 난 뒤, 아래 설문에 응답해주세요. </h3>
            `
        },
        {
            type: "rating",
            name: "question2",
            title: "제시된 설명이 정확하다",
            minRateDescription: "전혀 동의하지 않는다.",
            maxRateDescription: "매우 동의한다."
        }
    ]
}