export const preRegistrationPageQuestionList= [
    {
        name: "page1",
        elements: [
            {
                type: "html",
                name: "pre_registration_intro",
                html: `
                <h2>Pre-Registration Form</h2>
                <p>We are a team of researchers at the Human-Data Interaction Lab at Yonsei University. Thank you for your interest in our research.</p>
                <p>If you have any questions, please reach out to Taewon Yoo at twyoo@yonsei.ac.kr. Thank you!</p>
                `
            },
            {
                type: "radiogroup",
                name: "question1",
                title: "Is this your first time participating in this survey?",
                isRequired: true,
                choices: [
                    {
                        value: "Item 1",
                        text: "Yes"
                    },
                    {
                        value: "Item 2",
                        text: "No"
                    }
                ]
            },
            {
                type: "radiogroup",
                name: "question2",
                title: "Are you currently between the ages of 18 and 64?",
                choices: [
                    {
                        value: "Item 1",
                        text: "Yes"
                    },
                    {
                        value: "Item 2",
                        text: "No"
                    }
                ]
            },
            {
                type: "rating",
                name: "question3",
                title: "How well do you speak English?",
                isRequired: true,
                minRateDescription: "Not at all",
                maxRateDescription: "Very well"
            },
            {
                type: "radiogroup",
                name: "question2_1",
                title: "To participate in this survey, we need you to have access to a laptop of desktop computer. Do you have a laptop or a desktop computer that can be used during the interview session?",
                isRequired: true,
                choices: [
                    {
                        value: "Item 1",
                        text: "Yes"
                    },
                    {
                        value: "Item 2",
                        text: "No"
                    }
                ]
            }
        ]
    },
    {
        name: "page3",
        elements: [
            {
                type: "html",
                name: "pre_registration_intro",
                html: `
                <h2>You are ready!</h2>
                <p>We will send you a consent form link to this email address.</p>
                <p>Please click the "Complete" button.</p>
                `
            },
            {
                type: "text",
                name: "question3_1",
                title: "What is your email address?"
            }
        ]
    }
]