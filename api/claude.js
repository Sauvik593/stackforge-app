// api/claude.js — Vercel serverless function
// Validates the user's Supabase JWT, checks their subscription is active,
// detects concurrent sessions (credential sharing), then proxies to Anthropic
// using the OWNER'S API key. Users never need their own Anthropic account.
// The Anthropic API key NEVER leaves this server function.

import { createClient } from '@supabase/supabase-js'

// Service-role client bypasses RLS so we can read + update any row
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// How many minutes before we allow a different IP to use the same account.
// 15 minutes = someone sharing credentials gets blocked if both use it within 15 min.
const SESSION_WINDOW_MINUTES = 15

// Daily API call limit per user.
// At ~$0.10 per generation, 50 calls/day = max $5/day per user.
// Your $20/month subscription covers ~$15-20 in API costs per month per user
// assuming normal usage. Raise this if you want, lower it to protect costs.
const DAILY_CALL_LIMIT = 50

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── 1. Extract + verify Supabase JWT ─────────────────────────────────────
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'No auth token' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' })

  // ── 2. Check subscription is active ──────────────────────────────────────
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, last_ip, last_seen, api_calls_today, api_calls_reset_at')
    .eq('user_id', user.id)
    .single()

  if (subErr || !sub) return res.status(403).json({ error: 'No subscription found. Please subscribe at stackforgeai.com' })
  if (sub.status !== 'active') return res.status(403).json({ error: `Subscription is ${sub.status}. Please reactivate at stackforgeai.com` })

  // Check subscription hasn't expired (belt + suspenders beyond Lemon Squeezy webhook)
  if (sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
    return res.status(403).json({ error: 'Subscription has expired. Please renew at stackforgeai.com' })
  }

  // ── 3. Credential sharing detection ──────────────────────────────────────
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown'

  const now = new Date()
  const lastSeen = sub.last_seen ? new Date(sub.last_seen) : null
  const minutesSinceLastSeen = lastSeen ? (now - lastSeen) / 60000 : Infinity

  // If we've seen a DIFFERENT IP within SESSION_WINDOW_MINUTES, block this request
  if (
    sub.last_ip &&
    sub.last_ip !== clientIP &&
    minutesSinceLastSeen < SESSION_WINDOW_MINUTES
  ) {
    console.warn(`[SHARING DETECTED] user=${user.id} prev_ip=${sub.last_ip} new_ip=${clientIP} mins_ago=${minutesSinceLastSeen.toFixed(1)}`)
    return res.status(403).json({
      error: `Active session detected from another location. Please wait ${Math.ceil(SESSION_WINDOW_MINUTES - minutesSinceLastSeen)} minutes before accessing from a new device, or contact support if this is unexpected.`
    })
  }

  // ── 4. Daily rate limit ───────────────────────────────────────────────────
  const resetAt = sub.api_calls_reset_at ? new Date(sub.api_calls_reset_at) : new Date(0)
  const isNewDay = (now - resetAt) > 86400000  // 24 hours in ms

  const callsToday = isNewDay ? 0 : (sub.api_calls_today || 0)
  if (callsToday >= DAILY_CALL_LIMIT) {
    return res.status(429).json({ error: `Daily limit of ${DAILY_CALL_LIMIT} generations reached. Resets at midnight UTC.` })
  }

  // ── 5. Update session tracking in Supabase ────────────────────────────────
  await supabase.from('subscriptions').update({
    last_ip: clientIP,
    last_seen: now.toISOString(),
    api_calls_today: callsToday + 1,
    api_calls_reset_at: isNewDay ? now.toISOString() : sub.api_calls_reset_at
  }).eq('user_id', user.id)

  // ── 6. Parse request body ─────────────────────────────────────────────────
  const { system, messages, max_tokens = 4000 } = req.body || {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request body. Expected { system, messages }' })
  }

  // ── 7. Proxy to Anthropic ─────────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      system,
      messages
    })
  })

  const data = await anthropicRes.json()
  if (!anthropicRes.ok) {
    console.error('[Anthropic error]', data)
    return res.status(502).json({ error: 'AI generation failed. Please try again.' })
  }

  return res.status(200).json(data)
}
