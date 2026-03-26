import { useEffect } from 'react'
import './surveyUi.css'

export interface CompletionCodeProps {
  code: string
  storageKey?: string
}

export function CompletionCode({ code, storageKey = 'completion_code' }: CompletionCodeProps) {
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, code)
    } catch {
      // localStorage may be unavailable in some environments.
    }
  }, [code, storageKey])

  return (
    <div className="completion-code">
      <span>Completion Code: </span>
      <strong id="completion-code">{code}</strong>
    </div>
  )
}

