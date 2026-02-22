import { useEffect, useMemo, useState } from 'react'
import { LikertQuestion, OpenEndedInput, SurveyNav } from '../components'
import './consent.css'

type ConsentResponses = {
  email: string
  consentConfirm: '1' | '2' | ''
}

const STORAGE_KEY = 'preRegResponses'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getInitialPage() {
  const params = new URLSearchParams(window.location.search)
  const page = Number(params.get('page'))
  if (!Number.isFinite(page)) return 0
  return Math.max(0, Math.min(1, page))
}

function readStoredResponses(): ConsentResponses {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { email: '', consentConfirm: '' }
    const parsed = JSON.parse(raw) as Partial<ConsentResponses>
    return {
      email: typeof parsed.email === 'string' ? parsed.email : '',
      consentConfirm: parsed.consentConfirm === '1' || parsed.consentConfirm === '2' ? parsed.consentConfirm : '',
    }
  } catch {
    return { email: '', consentConfirm: '' }
  }
}

function getConsentApiUrl() {
  return import.meta.env.VITE_CONSENT_API_URL || 'http://localhost:3000/consent/add'
}

export default function ConsentPage() {
  const [page, setPage] = useState<number>(getInitialPage)
  const [responses, setResponses] = useState<ConsentResponses>(readStoredResponses)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return EMAIL_REGEX.test(responses.email) && responses.consentConfirm === '1'
  }, [responses.email, responses.consentConfirm])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(responses))
  }, [responses])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('page', String(page))
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [page])

  const submitConsent = async () => {
    setError(null)

    if (!EMAIL_REGEX.test(responses.email)) {
      setError('Please enter a valid email address.')
      return
    }
    if (responses.consentConfirm !== '1') {
      setError('Please complete the electronic signature.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(getConsentApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: responses.email.trim(),
          'consent-confirm': responses.consentConfirm,
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setPage(1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to submit consent: ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (page === 1) {
    return (
      <div className="consent-shell">
        <div className="consent-card">
          <h1>Your response is successfully submitted!</h1>
          <p>We will send you a main survey link to the email address you provided.</p>
          <p>You can now leave the page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="consent-shell">
      <div className="consent-card">
        <h1>Consent Form for Participation in Research</h1>

        <h3>Electronic Signature and Consent</h3>
        <p>
          By clicking the link below and providing your electronic signature, you acknowledge that:
          <br />• You have read and understood the information above.
          <br />• Your questions have been answered to your satisfaction.
          <br />• You agree to participate in this research under the terms described.
          <br />• Only participants who complete the electronic signature can access the main study.
        </p>

        <h3>Signature</h3>
        <p>Please follow the link to provide your electronic signature. [link]</p>

        <OpenEndedInput
          id="consent-email"
          labelText="Please enter your email address"
          placeholder="abc@xyz.com"
          inputType="email"
          required
          value={responses.email}
          onChange={(value) => setResponses((prev) => ({ ...prev, email: value }))}
        />

        <LikertQuestion
          name="consent-confirm"
          questionText="Did you complete the electronic signature?"
          labels={['Yes', 'No']}
          value={responses.consentConfirm}
          onChange={(value) =>
            setResponses((prev) => ({ ...prev, consentConfirm: value === '1' || value === '2' ? value : '' }))
          }
        />

        {error && <p className="consent-error">{error}</p>}

        <SurveyNav
          align="center"
          hidePrev
          onNext={submitConsent}
          nextLabel={submitting ? 'Submitting...' : 'Submit'}
          nextDisabled={submitting || !canSubmit}
        />
      </div>
    </div>
  )
}
