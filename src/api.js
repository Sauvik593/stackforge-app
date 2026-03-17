// src/api.js — authenticated Anthropic proxy
// Sends JWT to Vercel serverless, which uses owner's API key.
// Users never need their own Anthropic account.

import { supabase } from './supabase.js'

export async function callClaude(system, user, section = 'unknown') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated. Please sign in.')

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
    throw new Error(`Network error: ${networkErr.message}. Check your connection and retry.`)
  }

  try {
    data = await res.json()
  } catch (parseErr) {
    throw new Error(`Invalid response from server (status ${res.status}). Please retry.`)
  }

  if (!res.ok) {
    // Surface the actual error message from the server
    const msg = data?.error || `Server error ${res.status}`
    throw new Error(msg)
  }

  const text = data.content?.map(b => b.text || '').join('') || ''
  if (!text.trim()) {
    throw new Error('AI returned empty response. Please retry.')
  }
  return text
}
