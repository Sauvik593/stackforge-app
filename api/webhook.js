// api/webhook.js — Lemon Squeezy webhook handler
// Receives payment events and updates Supabase subscriptions table.
// Lemon Squeezy calls this URL automatically when subscriptions change.

import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Verify the webhook came from Lemon Squeezy (not someone faking it)
function verifySignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const digest = hmac.digest('hex')
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'hex'),
      Buffer.from(signature, 'hex')
    )
  } catch {
    // Buffers differ in length — signatures are definitely not equal
    return false
  }
}

// Read raw body (Vercel parses body by default, we need raw for signature)
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// Efficiently find a user's auth ID by email using a DB function (O(1) indexed lookup).
// The get_user_id_by_email function is defined in supabase-schema.sql.
// Falls back to paginated admin API if the function is not yet deployed.
async function findUserIdByEmail(email) {
  // Fast path: use the indexed DB function (requires supabase-schema.sql to be run)
  const { data: rpcId, error: rpcErr } = await supabase
    .rpc('get_user_id_by_email', { p_email: email })

  if (!rpcErr && rpcId) return rpcId

  // Slow fallback: paginate auth users (for new deployments before schema is applied)
  console.warn('[Webhook] RPC get_user_id_by_email unavailable, falling back to listUsers')
  let page = 1
  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000
    })
    if (error) {
      console.error('[Webhook] listUsers error:', error.message)
      return null
    }
    if (!users?.length) return null
    const found = users.find(u => u.email === email)
    if (found) return found.id
    if (users.length < 1000) return null
    page++
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // ── Validate required env vars ─────────────────────────────────────────────
  if (!process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error('[Webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not set')
    return res.status(500).json({ error: 'Webhook not configured' })
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  const rawBody = await getRawBody(req)
  const signature = req.headers['x-signature']

  if (!signature) {
    console.error('[Webhook] Missing x-signature header')
    return res.status(401).json({ error: 'Missing signature' })
  }

  const isValid = verifySignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('[Webhook] Invalid signature — possible spoofed request')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  let event
  try {
    event = JSON.parse(rawBody.toString())
  } catch (parseErr) {
    console.error('[Webhook] Failed to parse body:', parseErr.message)
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const eventName = event.meta?.event_name
  const attrs = event.data?.attributes

  // Customer email is the link between Lemon Squeezy and Supabase Auth
  const email = attrs?.user_email
  const lsSubId = event.data?.id
  const lsCustomerId = String(attrs?.customer_id || '')

  if (!email) {
    console.error('[Webhook] No email in event payload for', eventName)
    return res.status(400).json({ error: 'Missing user_email in payload' })
  }

  console.log(`[Webhook] ${eventName} — ${email}`)

  // ── Determine new subscription status ─────────────────────────────────────
  let status = null
  let periodEnd = null

  if (eventName === 'subscription_created' || eventName === 'subscription_resumed') {
    status = 'active'
    periodEnd = attrs?.renews_at || attrs?.ends_at
  } else if (eventName === 'subscription_updated') {
    status = attrs?.status === 'active' ? 'active' : attrs?.status
    periodEnd = attrs?.renews_at || attrs?.ends_at
  } else if (eventName === 'subscription_cancelled') {
    // Cancelled = access continues until period end, then expires
    status = 'cancelled'
    periodEnd = attrs?.ends_at
  } else if (eventName === 'subscription_expired') {
    status = 'inactive'
  } else if (eventName === 'subscription_paused') {
    status = 'paused'
  } else if (eventName === 'subscription_payment_failed') {
    // Grace period — Lemon Squeezy will retry; don't cut off immediately
    console.warn(`[Webhook] Payment failed for ${email} — Lemon Squeezy will retry`)
    return res.status(200).json({ received: true })
  } else {
    console.log(`[Webhook] Unhandled event: ${eventName}`)
    return res.status(200).json({ received: true })
  }

  // ── Look up user_id from Supabase Auth by email ───────────────────────────
  let userId = null

  // Fast path: check existing subscription row first
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('email', email)
    .single()

  if (existing?.user_id) {
    userId = existing.user_id
  } else {
    // Slow path: search auth users (paginated, exits early when found)
    userId = await findUserIdByEmail(email)
    // Note: if user hasn't signed up yet, userId stays null.
    // The webhook still creates the subscription row — when they sign up,
    // App.jsx's fetchSub will match by user_id after they verify email.
  }

  // ── Upsert subscription in Supabase ──────────────────────────────────────
  const upsertData = {
    email,
    ls_customer_id: lsCustomerId,
    ls_subscription_id: String(lsSubId || ''),
    status,
    current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    updated_at: new Date().toISOString()
  }
  if (userId) upsertData.user_id = userId

  const { error } = await supabase
    .from('subscriptions')
    .upsert(upsertData, { onConflict: 'email' })

  if (error) {
    console.error('[Webhook] Supabase upsert error:', error.message)
    return res.status(500).json({ error: 'Database error' })
  }

  console.log(`[Webhook] ✅ Subscription ${status} for ${email} (user_id: ${userId || 'pending signup'})`)
  return res.status(200).json({ received: true })
}
