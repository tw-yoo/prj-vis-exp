export const tutorialPage2= {
    name: "tutorial2",
    elements: [
        {
            type: "html",
            name: "chart_tutorial_intro",
            html: `
            <h2>튜토리얼</h2>
            <p><strong>각 세트에는 차트와 질문, 그리고 한 가지 설명 방법(방법 1 ~ 4)이 나옵니다.</strong></p>
            <p><strong>차트:</strong> 바 차트, 라인 차트 중 한 가지가 주어집니다.</p>
            <p><strong>질문:</strong> 주어진 차트와 관련된 질문이 주어집니다.</p>
            <p><strong>설명:</strong> 질문의 답변에 대한 설명이 주어집니다. 설명은 텍스트, 또는 이미지 등을 포함합니다. </p>
            
            <p>각 세트마다 주어진 차트, 질문, 설명을 잘 읽고, 설문에 응답해주시기 바랍니다.</p>
            
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
        }
    ]
}