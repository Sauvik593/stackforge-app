// api/embed.js — Gemini text-embedding-004 wrapper
// getEmbedding(text): returns float[] (768-dim) for semantic similarity search.
// Default export: admin trigger to re-embed all un-embedded templates.

const EMBED_MODEL = 'text-embedding-004'
const EMBED_DIM = 768

/**
 * Embed a single text string using Gemini text-embedding-004.
 * Returns a 768-dimensional float array.
 */
export async function getEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set — cannot generate embeddings')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },  // truncate to avoid 400
      taskType: 'RETRIEVAL_DOCUMENT'
    })
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data)
    throw new Error(`Embedding API error: ${msg}`)
  }

  const values = data?.embedding?.values
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error(`Unexpected embedding dimensions: got ${values?.length}, expected ${EMBED_DIM}`)
  }

  return values
}

/**
 * Embed a query string for retrieval (different task type = better recall).
 */
export async function getQueryEmbedding(text) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set — cannot generate embeddings')
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 2000) }] },
      taskType: 'RETRIEVAL_QUERY'
    })
  })

  const data = await res.json()

  if (!res.ok) {
    const msg = data?.error?.message || JSON.stringify(data)
    throw new Error(`Embedding API error: ${msg}`)
  }

  const values = data?.embedding?.values
  if (!Array.isArray(values) || values.length !== EMBED_DIM) {
    throw new Error(`Unexpected embedding dimensions: got ${values?.length}, expected ${EMBED_DIM}`)
  }

  return values
}

// ── Default handler: re-embed all templates missing embeddings ─────────────
// POST /api/embed  { "action": "reembed_all" | "reembed_one", "id": "uuid" }
// Auth: service role key via X-Admin-Key header
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Admin-only via secret header
  const adminKey = req.headers['x-admin-key']
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { action, id } = req.body || {}

  // ── Re-embed a single template by ID ──────────────────────────────────────
  if (action === 'reembed_one') {
    if (!id) return res.status(400).json({ error: 'Missing id' })

    const { data: tpl, error } = await supabase
      .from('stack_templates')
      .select('id, name, description, content')
      .eq('id', id)
      .single()

    if (error || !tpl) return res.status(404).json({ error: 'Template not found' })

    try {
      const text = `${tpl.name}. ${tpl.description}\n\n${tpl.content.slice(0, 4000)}`
      const embedding = await getEmbedding(text)

      await supabase
        .from('stack_templates')
        .update({ embedding })
        .eq('id', id)

      return res.status(200).json({ ok: true, id })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // ── Re-embed all templates with null embeddings ────────────────────────────
  if (action === 'reembed_all') {
    const { data: templates, error } = await supabase
      .from('stack_templates')
      .select('id, name, description, content')
      .is('embedding', null)
      .order('created_at', { ascending: true })

    if (error) return res.status(500).json({ error: error.message })
    if (!templates?.length) return res.status(200).json({ ok: true, embedded: 0, message: 'Nothing to embed' })

    let embedded = 0
    const errors = []

    for (const tpl of templates) {
      try {
        const text = `${tpl.name}. ${tpl.description}\n\n${tpl.content.slice(0, 4000)}`
        const embedding = await getEmbedding(text)

        await supabase
          .from('stack_templates')
          .update({ embedding })
          .eq('id', tpl.id)

        embedded++
        // Brief pause to stay within Gemini free tier (1500 RPD, 1 RPM for embeddings)
        await new Promise(r => setTimeout(r, 1200))
      } catch (err) {
        errors.push({ id: tpl.id, name: tpl.name, error: err.message })
        console.error(`[Embed] Failed ${tpl.id}:`, err.message)
      }
    }

    return res.status(200).json({ ok: true, embedded, errors })
  }

  return res.status(400).json({ error: 'Invalid action. Use: reembed_all | reembed_one' })
}
