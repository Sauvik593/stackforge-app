// src/api.js
// Replaces direct Anthropic calls. Sends the user's Supabase JWT to our
// Vercel serverless proxy, which validates auth + calls Anthropic server-side.
// The Anthropic API key never touches the browser.

import { supabase } from './supabase.js'

export async function callClaude(system, user) {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated. Please sign in.')

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      system,
      messages: [{ role: 'user', content: user }],
      max_tokens: 4000
    })
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error || `Server error ${res.status}`)
  }

  return data.content?.map(b => b.text || '').join('') || ''
}
