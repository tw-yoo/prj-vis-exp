import './preRegistration.css'

/**
 * Shown in place of the pre-registration form once recruitment has ended.
 * The form itself still exists and is reachable with ?reopen=1 (see
 * SurveyRouter) so recruitment can be resumed without a code change.
 */
export default function PreRegistrationClosedPage() {
  return (
    <div className="pre-reg-page">
      <div className="pr-shell">
        <div className="pr-status pr-status--done">
          <div className="pr-status__icon">✓</div>
          <div>
            <h1>Recruitment for this study has closed</h1>
            <p className="pr-footnote">
              Thank you so much for your interest — we are no longer accepting new pre-registrations.
            </p>
          </div>
        </div>

        <section className="pr-card pr-card--note">
          <div className="pr-card__body">
            <p className="pr-subtle">
              We were grateful for the response to this study, and recruitment filled up faster than we expected. If you
              already pre-registered and completed a session, thank you for taking part — your contribution genuinely
              helps this research.
            </p>
            <p className="pr-subtle">
              If you already pre-registered but have not heard from us, no further action is needed on your side.
            </p>
            <p className="pr-subtle">
              Questions about the study? Please contact Taewon Yoo at <strong>twyoo@yonsei.ac.kr</strong>. You may now
              close this window.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
