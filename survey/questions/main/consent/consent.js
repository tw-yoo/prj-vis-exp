export const surveyConsentQuestionList= [
    {
        name: "page1",
        elements: [
            {
                type: "html",
                name: "consent_intro",
                html: `
                <h2>Consent Form for Participation in Research</h2>
                
                <h3>Electronic Signature and Consent</h3>
                By clicking the link below and providing your electronic signature, you acknowledge that: <br/>
                \t•\tYou have read and understood the information above. <br/>
                \t•\tYour questions have been answered to your satisfaction (you may contact the team if you have any before signing). <br/>
                \t•\tYou agree to participate in this research under the terms described. <br/>
                \t•\tYou understand that only participants who complete the electronic signature will receive access to the main study.
                
                <h3>Signature</h3>
                Please follow the link to provide your electronic signature. <br/>
                [link]
                `
            },
            {
                type: "radiogroup",
                name: "consent_confirm",
                title: "Did you complete the electronic signature?",
                isRequired: true,
                choices: [
                    {
                        value: "yes",
                        text: "Yes"
                    },
                    {
                        value: "no",
                        text: "No"
                    }
                ]
            }
        ]
    },
    {
        name: "page2",
        elements: [
            {
                type: "html",
                name: "consent_intro",
                html: `
                <h2>Thank you!</h2>
                <p>Thank you so much for your interest in our research!</p>
                <p>We will send you a survey link to your email address.</p>
                <p>Please click the <strong>"Complete"</strong> button</p>
                `
            }
        ]
    }
]