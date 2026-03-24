// api/templates.js — Template lookup endpoint
// Returns pre-built infrastructure code from templateLibrary.js
// Frontend tries this first; falls back to AI for missing sections.

import { createClient } from '@supabase/supabase-js'
import { buildContext, generateAwsTerraform, generatePipeline, generateConfig } from './templateLibrary.js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getAllowedOrigin() {
  if (process.env.ALLOWED_ORIGIN) return process.env.ALLOWED_ORIGIN
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return '*'
}

export default async function handler(req, res) {
  const allowedOrigin = getAllowedOrigin()
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No auth token' })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Session expired. Please sign in again.' })

  // ── Subscription check ────────────────────────────────────────────────────
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', user.id)
    .single()

  if (!sub || sub.status !== 'active') {
    return res.status(403).json({ error: 'Active subscription required.' })
  }

  // ── Build context + generate ──────────────────────────────────────────────
  const form = req.body
  if (!form || !form.cloud) {
    return res.status(400).json({ error: 'Missing form data' })
  }

  const ctx = buildContext(form)

  const result = {
    source: 'template',
    iac: null,
    pipeline: null,
    config: null,
    supported: false,
  }

  // Only AWS Terraform is fully templated right now
  if (form.cloud === 'aws' && (form.iacTool === 'terraform' || form.iacTool === 'terragrunt')) {
    try {
      result.iac = generateAwsTerraform(ctx)
      result.supported = true
    } catch (err) {
      console.error('[Templates] iac error:', err.message)
    }
  }

  // GitHub Actions pipeline
  if (form.pipeline === 'github') {
    try {
      result.pipeline = generatePipeline(ctx)
    } catch (err) {
      console.error('[Templates] pipeline error:', err.message)
    }
  }

  // Ansible config
  if (form.configTool === 'ansible' && (form.configPresets?.length > 0 || form.configTool)) {
    try {
      result.config = generateConfig(ctx)
    } catch (err) {
      console.error('[Templates] config error:', err.message)
    }
  }

  console.log(`[Templates] user=${user.id} cloud=${form.cloud} iac=${form.iacTool} supported=${result.supported}`)

  return res.status(200).json(result)
}
