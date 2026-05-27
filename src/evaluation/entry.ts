import { isValidCodeFormat, lookupParticipant, normalizeCode, saveSession, loadSession } from './participantSession'

declare global {
  interface Window {
    __EVALUATION_BASE_PATH__?: string
  }
}

const evaluationBasePath = window.__EVALUATION_BASE_PATH__ ?? ''
const withBase = (p: string) => `${evaluationBasePath}${p}`

const form = document.getElementById('entryForm') as HTMLFormElement
const input = document.getElementById('codeInput') as HTMLInputElement
const messageEl = document.getElementById('entryMessage') as HTMLElement
const submitBtn = document.getElementById('entrySubmit') as HTMLButtonElement

function setMessage(text: string, kind: 'error' | 'info' = 'error') {
  messageEl.textContent = text
  messageEl.dataset.kind = text ? kind : ''
}

const existing = loadSession()
if (existing) {
  input.value = existing.code
  setMessage(`Resuming session for ${existing.code}.`, 'info')
}

input.addEventListener('input', () => {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  setMessage('')
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const raw = input.value
  if (!isValidCodeFormat(raw)) {
    setMessage('Participant code must be exactly 6 letters or digits.')
    input.focus()
    return
  }
  submitBtn.disabled = true
  setMessage('Validating...', 'info')
  try {
    const participant = await lookupParticipant(raw, withBase('/participants.json'))
    if (!participant) {
      setMessage('Unknown participant code. Please check and try again.')
      submitBtn.disabled = false
      input.focus()
      return
    }
    saveSession(participant)
    location.assign(withBase(`/run/?page=1`))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setMessage(`Could not validate code: ${message}`)
    submitBtn.disabled = false
  }
})

input.focus()
const normalized = normalizeCode(input.value)
if (normalized && normalized !== input.value) input.value = normalized
