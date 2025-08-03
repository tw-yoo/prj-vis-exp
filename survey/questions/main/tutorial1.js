export const tutorialPage1= {
    name: "tutorial1",
    elements: [
        {
            type: "html",
            name: "survey_intro",
            html: `
            <h2>튜토리얼</h2>
            <p>실제 설문 전 연습용 예시를 통해 실험의 흐름을 익혀보겠습니다. 튜토리얼은 약 <strong>5분</strong>이 소요됩니다.</p>
            
            <h3>설문 진행 과정</h3>
            <p>본 설을 통해 다음과 같은 작업을 수행하게 됩니다.</p>
            <ol>
                <li><strong>차트를 보고 질문을 읽습니다.</strong> 각 세트마다 하나의 차트와 그에 대한 질문이 주어집니다.</li>
                <li><strong>설명(방법 1~4 중 하나)을 봅니다.</strong> 해당 질문에 대해 "방법 X"라는 이름으로 표시된 설명이 함께 나타납니다.</li>
                <li><strong>설명 이해도 관련 질문에 응답합니다.</strong> 객관식 설문 세 개의 문항에 응답하게 됩니다.</li>
                <li><strong>다음 세트로 넘어갑니다.</strong> 총 24개의 세트에 대해 반복합니다. 네 가지 설명 방법이 무작위로 나타납니다.</li>
            </ol>
            `
        }
    ]
}