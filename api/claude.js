// api/claude.js — Vercel serverless function
// Validates JWT, checks subscription, detects credential sharing, proxies AI.
// Provider selection: Anthropic Claude (if ANTHROPIC_API_KEY set) else Google Gemini (free tier).
// OWNER's API key is used — users never need their own.

import { createClient } from '@supabase/supabase-js'
import { getQueryEmbedding } from './embed.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_WINDOW_MINUTES = 15
const DAILY_CALL_LIMIT = parseInt(process.env.DAILY_CALL_LIMIT || '100')

function getAllowedOrigin() {
  if (process.env.ALLOWED_ORIGIN) return process.env.ALLOWED_ORIGIN
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return '*'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── Gemini REST call — no SDK required, with rate-limit retry ─────────────
async function callGemini(system, messages, max_tokens) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`

  const body = {
    systemInstruction: { parts: [{ text: system || '' }] },
    contents: messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig: {
      maxOutputTokens: Math.min(max_tokens, 8192),
      temperature: 0.3
    }
  }

  // Retry up to 3 times on rate limit (RESOURCE_EXHAUSTED) with backoff
  const RETRY_DELAYS = [10000, 20000, 30000] // 10s, 20s, 30s
  let lastErr

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await geminiRes.json()

    if (!geminiRes.ok) {
      const status = data?.error?.status || 'UNKNOWN'
      const msg = data?.error?.message || JSON.stringify(data)

      if (status === 'RESOURCE_EXHAUSTED') {
        lastErr = { status: 429, msg: 'AI rate limit reached. Please wait a moment and retry.' }
        if (attempt < RETRY_DELAYS.length) {
          console.warn(`[Gemini] RESOURCE_EXHAUSTED, retrying in ${RETRY_DELAYS[attempt] / 1000}s (attempt ${attempt + 1})`)
          await sleep(RETRY_DELAYS[attempt])
          continue
        }
        throw lastErr
      }
      if (status === 'INVALID_ARGUMENT') throw { status: 400, msg: 'Invalid request to AI.' }
      throw { status: 502, msg: `Gemini error (${status}): ${msg.slice(0, 200)}` }
    }

    const candidate = data.candidates?.[0]
    if (!candidate) throw { status: 502, msg: 'AI returned no response. Please retry.' }

    const finishReason = candidate.finishReason
    if (finishReason === 'SAFETY') throw { status: 400, msg: 'Request blocked by safety filter. Rephrase your description.' }

    const text = candidate.content?.parts?.map(p => p.text || '').join('') || ''

    return {
      content: [{ type: 'text', text }],
      stop_reason: finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn',
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0
      }
    }
  }

  throw lastErr
}

// ── Anthropic REST call ────────────────────────────────────────────────────
async function callAnthropic(system, messages, max_tokens) {
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: Math.min(max_tokens, 8000),
      system,
      messages
    })
  })

  const data = await anthropicRes.json()

  if (!anthropicRes.ok) {
    const errType = data?.error?.type || 'unknown'
    const errMsg = data?.error?.message || JSON.stringify(data)
    if (errType === 'overloaded_error') throw { status: 503, msg: 'AI is overloaded. Please wait 30 seconds and retry.' }
    if (errType === 'rate_limit_error') throw { status: 429, msg: 'Rate limit hit. Please wait 1 minute and retry.' }
    if (errType === 'authentication_error' || errMsg.includes('credit balance')) throw { status: 500, msg: 'API key error. Contact support.' }
    if (errMsg.includes('max_tokens')) throw { status: 400, msg: 'Response too long. Try selecting fewer resources.' }
    throw { status: 502, msg: `AI error (${errType}): ${errMsg.slice(0, 200)}` }
  }

  return data
}

export default async function handler(req, res) {
  const allowedOrigin = getAllowedOrigin()

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Validate AI provider config ────────────────────────────────────────────
  // Gemini takes priority when set (free tier). Anthropic only used if no Gemini key.
  const useGemini = !!process.env.GEMINI_API_KEY
  const useAnthropic = !useGemini && !!process.env.ANTHROPIC_API_KEY
  if (!useAnthropic && !useGemini) {
    console.error('[Config] Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set')
    return res.status(500).json({ error: 'Config error: GEMINI_API_KEY not set in Vercel environment variables.' })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Config] SUPABASE_SERVICE_ROLE_KEY is not set')
    return res.status(500).json({ error: 'Config error: SUPABASE_SERVICE_ROLE_KEY not set in Vercel environment variables.' })
  }

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

  // ── 4. Daily rate limit — reset at midnight UTC ────────────────────────────
  const resetAt = sub.api_calls_reset_at ? new Date(sub.api_calls_reset_at) : new Date(0)
  const nowUTC = new Date(now.toISOString())
  const resetDayUTC = new Date(Date.UTC(
    resetAt.getUTCFullYear(), resetAt.getUTCMonth(), resetAt.getUTCDate()
  ))
  const todayUTC = new Date(Date.UTC(
    nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()
  ))
  const isNewDay = todayUTC > resetDayUTC
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

  // ── 6. Parse + validate request body ──────────────────────────────────────
  const { system, messages, max_tokens = 8000, section = 'unknown' } = req.body || {}
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request: expected { system, messages[] }' })
  }
  for (const m of messages) {
    if (!m.role || !m.content) {
      return res.status(400).json({ error: 'Invalid message format: each message needs role and content' })
    }
  }

  const provider = useAnthropic ? 'anthropic' : 'gemini'
  console.log(`[Generate] user=${user.id} section=${section} provider=${provider} calls_today=${callsToday + 1}/${DAILY_CALL_LIMIT}`)

  // ── 7. RAG: retrieve similar templates and inject as context ──────────────
  // Only runs when GEMINI_API_KEY is set (used for embeddings too).
  // Skips silently on any error — RAG is best-effort, not critical path.
  let augmentedSystem = system

  if (process.env.GEMINI_API_KEY) {
    try {
      // Build a concise query from the user message content
      const userText = messages.find(m => m.role === 'user')?.content || ''
      const queryText = userText.slice(0, 1500)

      const queryEmbedding = await getQueryEmbedding(queryText)

      // Determine filters from section name hint
      const filterCloud = queryText.match(/\b(aws|azure|gcp)\b/i)?.[1]?.toLowerCase() || null
      const categoryMap = { iac: 'iac', pipeline: 'pipeline', config: 'config', security: 'security', observability: 'observability' }
      const filterCategory = categoryMap[section] || null

      const { data: matches, error: ragErr } = await supabase.rpc('match_stack_templates', {
        query_embedding: queryEmbedding,
        match_count: 3,
        filter_cloud: filterCloud,
        filter_category: filterCategory,
        min_similarity: 0.45
      })

      if (!ragErr && matches?.length > 0) {
        const contextBlock = matches
          .map(m => `### ${m.name} (similarity: ${m.similarity.toFixed(2)})\n${m.description}\n\n${m.content.slice(0, 3000)}`)
          .join('\n\n---\n\n')

        augmentedSystem = `${system || ''}

══════════════════════════════════════════════════════
REFERENCE TEMPLATES (retrieved via semantic similarity)
Use these as style and structure guides. Follow the same
module patterns, variable naming, and file organization.
══════════════════════════════════════════════════════

${contextBlock}

══════════════════════════════════════════════════════
END REFERENCE TEMPLATES — now generate for this request:
══════════════════════════════════════════════════════`

        // Bump usage counts (fire-and-forget)
        for (const m of matches) {
          supabase.rpc('increment_template_usage', { template_id: m.id }).catch(() => {})
        }

        console.log(`[RAG] section=${section} matches=${matches.length} cloud=${filterCloud || 'any'} cat=${filterCategory || 'any'}`)
      }
    } catch (ragErr) {
      // Non-fatal — log and continue with original system prompt
      console.warn('[RAG] Skipped:', ragErr.message)
    }
  }

  // ── 8. Call AI provider ────────────────────────────────────────────────────
  let result
  try {
    result = useAnthropic
      ? await callAnthropic(augmentedSystem, messages, max_tokens)
      : await callGemini(augmentedSystem, messages, max_tokens)
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.msg })
    }
    console.error(`[${provider} fetch error]`, err.message)
    return res.status(502).json({ error: `Connection to AI failed: ${err.message}. Please retry.` })
  }

  console.log(`[Generate] done provider=${provider} stop_reason=${result.stop_reason} input=${result.usage?.input_tokens} output=${result.usage?.output_tokens}`)

  return res.status(200).json(result)
}
