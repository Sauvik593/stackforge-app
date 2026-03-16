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
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // ── Verify signature ──────────────────────────────────────────────────────
  const rawBody = await getRawBody(req)
  const signature = req.headers['x-signature']

  if (!signature) return res.status(401).json({ error: 'Missing signature' })

  const isValid = verifySignature(rawBody, signature, process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('[Webhook] Invalid signature')
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const event = JSON.parse(rawBody.toString())
  const eventName = event.meta?.event_name
  const attrs = event.data?.attributes

  // Customer email is the link between Lemon Squeezy and Supabase Auth
  const email = attrs?.user_email
  const lsSubId = event.data?.id
  const lsCustomerId = String(attrs?.customer_id || '')

  console.log(`[Webhook] ${eventName} — ${email}`)

  // ── Determine new subscription status ─────────────────────────────────────
  let status = null
  let periodEnd = null

  if (eventName === 'subscription_created' || eventName === 'subscription_resumed') {
    status = 'active'
    periodEnd = attrs?.renews_at || attrs?.ends_at
  } else if (eventName === 'subscription_updated') {
    // Could be upgrade, downgrade, or payment method change — keep active
    status = attrs?.status === 'active' ? 'active' : attrs?.status
    periodEnd = attrs?.renews_at || attrs?.ends_at
  } else if (eventName === 'subscription_cancelled') {
    // Cancelled = they'll have access until period end, then it expires
    status = 'cancelled'
    periodEnd = attrs?.ends_at
  } else if (eventName === 'subscription_expired') {
    status = 'inactive'
  } else if (eventName === 'subscription_paused') {
    status = 'paused'
  } else if (eventName === 'subscription_payment_failed') {
    // Grace period — don't cut off immediately, Lemon Squeezy will retry
    console.warn(`[Webhook] Payment failed for ${email}`)
    return res.status(200).json({ received: true })
  } else {
    // Unhandled event — log and acknowledge
    console.log(`[Webhook] Unhandled event: ${eventName}`)
    return res.status(200).json({ received: true })
  }

  // ── Upsert subscription in Supabase ──────────────────────────────────────
  // Look up user_id from Supabase Auth by email
  let userId = null

  // First check if they already have a subscription row (faster)
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('email', email)
    .single()

  if (existing?.user_id) {
    userId = existing.user_id
  } else {
    // Try to find in Supabase Auth
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users?.find(u => u.email === email)
    if (authUser) userId = authUser.id
    // Note: if user hasn't signed up yet, userId will be null.
    // That's fine — they'll sign up later and we match by email.
  }

  const upsertData = {
    email,
    ls_customer_id: lsCustomerId,
    ls_subscription_id: lsSubId,
    status,
    current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    updated_at: new Date().toISOString()
  }
  if (userId) upsertData.user_id = userId

  const { error } = await supabase
    .from('subscriptions')
    .upsert(upsertData, { onConflict: 'email' })

  if (error) {
    console.error('[Webhook] Supabase upsert error:', error)
    return res.status(500).json({ error: 'Database error' })
  }

  console.log(`[Webhook] ✅ Subscription ${status} for ${email}`)
  return res.status(200).json({ received: true })
}
