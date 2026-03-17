// api/claude.js — Vercel serverless function
// Validates JWT, checks subscription, detects credential sharing, proxies Anthropic.
// OWNER's API key is used — users never need their own.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_WINDOW_MINUTES = 15
const DAILY_CALL_LIMIT = 50

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Extract + verify Supabase JWT ──────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No auth token. Please sign in.' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' })
  }

  // ── 2. Check subscription ──────────────────────────────────────────────────
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, last_ip, last_seen, api_calls_today, api_calls_reset_at')
    .eq('user_id', user.id)
    .single()

  if (subErr || !sub) {
    return res.status(403).json({ error: 'No subscription found. Please subscribe at stackforge-app.vercel.app' })
  }
  if (sub.status !== 'active') {
    return res.status(403).json({ error: `Subscription ${sub.status}. Please reactivate to continue.` })
  }
  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    return res.status(403).json({ error: 'Subscription expired. Please renew.' })
  }

  // ── 3. Credential sharing detection ───────────────────────────────────────
  const clientIP = (req.headers['x-forwarded-for']?.split(',')[0]?.trim())
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown'

  const now = new Date()
  const lastSeen = sub.last_seen ? new Date(sub.last_seen) : null
  const minutesSince = lastSeen ? (now - lastSeen) / 60000 : Infinity

  if (sub.last_ip && sub.last_ip !== clientIP && minutesSince < SESSION_WINDOW_MINUTES) {
    const waitMins = Math.ceil(SESSION_WINDOW_MINUTES - minutesSince)
    return res.status(403).json({
      error: `Active session detected from another location. Please wait ${waitMins} min before accessing from a new device.`
    })
  }

  // ── 4. Daily rate limit ────────────────────────────────────────────────────
  const resetAt = sub.api_calls_reset_at ? new Date(sub.api_calls_reset_at) : new Date(0)
  const isNewDay = (now - resetAt) > 86400000
  const callsToday = isNewDay ? 0 : (sub.api_calls_today || 0)

  if (callsToday >= DAILY_CALL_LIMIT) {
    return res.status(429).json({
      error: `Daily limit of ${DAILY_CALL_LIMIT} generations reached. Resets at midnight UTC.`
    })
  }

  // ── 5. Update session tracking ─────────────────────────────────────────────
  await supabase.from('subscriptions').update({
    last_ip: clientIP,
    last_seen: now.toISOString(),
    api_calls_today: callsToday + 1,
    api_calls_reset_at: isNewDay ? now.toISOString() : sub.api_calls_reset_at
  }).eq('user_id', user.id)

  // ── 6. Parse request body ──────────────────────────────────────────────────
  const { system, messages, max_tokens = 8000 } = req.body || {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: expected { system, messages }' })
  }

  // Log for debugging
  console.log(`[Generate] user=${user.id} section=${req.body.section||'unknown'} max_tokens=${max_tokens}`)

  // ── 7. Call Anthropic ──────────────────────────────────────────────────────
  let anthropicRes, data
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: Math.min(max_tokens, 8000),
        system,
        messages
      })
    })
    data = await anthropicRes.json()
  } catch (fetchErr) {
    console.error('[Anthropic fetch error]', fetchErr.message)
    return res.status(502).json({
      error: `Connection to AI failed: ${fetchErr.message}. Please retry.`
    })
  }

  if (!anthropicRes.ok) {
    const errType = data?.error?.type || 'unknown'
    const errMsg = data?.error?.message || JSON.stringify(data)
    console.error('[Anthropic API error]', errType, errMsg)

    // Surface specific errors helpfully
    if (errType === 'overloaded_error') {
      return res.status(503).json({ error: 'AI is overloaded. Please wait 30 seconds and retry.' })
    }
    if (errType === 'rate_limit_error') {
      return res.status(429).json({ error: 'Rate limit hit. Please wait 1 minute and retry.' })
    }
    if (errType === 'authentication_error') {
      return res.status(500).json({ error: 'API key configuration error. Contact support.' })
    }
    if (data?.error?.message?.includes('max_tokens')) {
      return res.status(400).json({ error: 'Response too long. Try selecting fewer resources.' })
    }
    return res.status(502).json({
      error: `AI error (${errType}): ${errMsg.slice(0, 200)}`
    })
  }

  // Check for stop reason
  if (data.stop_reason === 'max_tokens') {
    console.warn('[Anthropic] Response truncated at max_tokens')
    // Still return the partial response - it's usually complete enough
  }

  console.log(`[Generate] done stop_reason=${data.stop_reason} input_tokens=${data.usage?.input_tokens} output_tokens=${data.usage?.output_tokens}`)

  return res.status(200).json(data)
}
