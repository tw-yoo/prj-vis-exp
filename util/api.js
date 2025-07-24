export async function updateAnswerFromBackend(vlSpec, question) {

    const apiUrl = 'http://127.0.0.1:3000/genai';

    const requestBody = {
        spec: vlSpec,
        question: question
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseData = await response.json();

        console.log(responseData);

        document.getElementById('explanation').value = `Answer: ${responseData.answer}. \n\nExplanation: ${responseData.explanation}`;

    } catch (error) {
        console.error('Error sending prompt to GenAI:', error);
        // 오류 처리 로직
    }

}

// What is the difference between mean and max cases?