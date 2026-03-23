// src/api.js — authenticated Anthropic proxy
// Sends JWT to Vercel serverless, which uses owner's API key.
// Users never need their own Anthropic account.

import { supabase } from './supabase.js'

// Retry config for transient AI errors
const RETRYABLE_STATUSES = new Set([429, 502, 503])
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 3000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function callClaude(system, user, section = 'unknown') {
  // Get current session — Supabase auto-refreshes expired tokens
  const { data: { session }, error: sessionErr } = await supabase.auth.getSession()
  if (sessionErr || !session) {
    throw new Error('Not authenticated. Please sign in.')
  }

  let lastError = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 3s, 6s
      await sleep(RETRY_DELAY_MS * attempt)
    }

    let res, data

    try {
      res = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          section,
          system,
          messages: [{ role: 'user', content: user }],
          max_tokens: 8000
        })
      })
    } catch (networkErr) {
      lastError = new Error(`Network error: ${networkErr.message}. Check your connection and retry.`)
      // Network errors are always retryable
      continue
    }

    try {
      data = await res.json()
    } catch (parseErr) {
      throw new Error(`Invalid response from server (status ${res.status}). Please retry.`)
    }

    if (!res.ok) {
      const msg = data?.error || `Server error ${res.status}`

      // Don't retry auth errors or client errors (4xx except 429)
      if (res.status === 401 || res.status === 403) {
        throw new Error(msg)
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(msg)
      }

      lastError = new Error(msg)

      if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        console.warn(`[API] Retrying after ${res.status} (attempt ${attempt + 1}/${MAX_RETRIES}): ${msg}`)
        continue
      }

      throw lastError
    }

    const text = data.content?.map(b => b.text || '').join('') || ''
    if (!text.trim()) {
      throw new Error('AI returned empty response. Please retry.')
    }
    return text
  }

  throw lastError || new Error('Request failed after retries. Please try again.')
}
