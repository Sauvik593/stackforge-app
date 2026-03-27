// api/admin-templates.js — Admin CRUD for the RAG template database
// All routes require X-Admin-Key: <ADMIN_SECRET> header.
// Actions: list | get | create | update | delete | seed | reembed_all
//
// The "seed" action inserts the built-in templates from templateLibrary.js
// so they can be retrieved via pgvector similarity search.

import { createClient } from '@supabase/supabase-js'
import { getEmbedding } from './embed.js'
import {
  filesToText,
  buildContext,
  generateAwsTerraform,
  generatePipeline,
  generateConfig
} from './templateLibrary.js'

function getAllowedOrigin() {
  if (process.env.ALLOWED_ORIGIN) return process.env.ALLOWED_ORIGIN
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return '*'
}

function adminAuth(req) {
  const key = req.headers['x-admin-key']
  return key && key === process.env.ADMIN_SECRET
}

function supabaseClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

// ── Seed definitions ────────────────────────────────────────────────────────
// Each entry calls templateLibrary generators to get the content string.
function buildSeedEntries() {
  const entries = []

  // ── AWS Terraform: EC2 + ALB + ASG ──────────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'web-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: 'github', configTool: 'ansible',
      resources: [
        { serviceId: 'ec2_asg', names: ['web'], props: { instance_type: 't3.medium', volume_size: 30, min_size: 2, max_size: 6 } },
        { serviceId: 'alb',     names: ['web-alb'], props: {} },
        { serviceId: 'vpc',     names: ['main'], props: {} },
      ]
    })
    entries.push({
      name: 'AWS EC2 Auto Scaling Group with ALB',
      description: 'Terraform modules for AWS EC2 Auto Scaling Group behind an Application Load Balancer with VPC, subnets, security groups, IAM roles, and user data bootstrap script',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: 'ec2',
      pipeline: null, config_tool: null,
      category: 'iac',
      tags: ['aws', 'ec2', 'asg', 'alb', 'terraform', 'networking', 'iam'],
      content: generateAwsTerraform(ctx)
    })
  } catch (e) { console.error('[Seed] EC2 ASG:', e.message) }

  // ── AWS Terraform: EKS Cluster ───────────────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'k8s-platform',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'eks',
      pipeline: 'github', configTool: '',
      resources: [
        { serviceId: 'eks_cluster', names: ['prod'], props: { k8s_version: '1.29', node_instance_type: 't3.large', node_min: 2, node_max: 8 } },
        { serviceId: 'vpc',         names: ['main'], props: {} },
      ]
    })
    entries.push({
      name: 'AWS EKS Kubernetes Cluster',
      description: 'Terraform modules for AWS EKS cluster with managed node groups, VPC with private subnets, OIDC provider, IAM roles for service accounts, and production-grade security groups',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: 'eks',
      pipeline: null, config_tool: null,
      category: 'iac',
      tags: ['aws', 'eks', 'kubernetes', 'terraform', 'iam', 'oidc', 'networking'],
      content: generateAwsTerraform(ctx)
    })
  } catch (e) { console.error('[Seed] EKS:', e.message) }

  // ── AWS Terraform: RDS PostgreSQL ────────────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'postgres-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: '', configTool: '',
      resources: [
        { serviceId: 'rds_postgres', names: ['app-db'], props: { db_class: 'db.t3.medium', allocated_storage: 100, multi_az: true } },
        { serviceId: 'vpc',          names: ['main'], props: {} },
      ]
    })
    entries.push({
      name: 'AWS RDS PostgreSQL with Secrets Manager',
      description: 'Terraform module for AWS RDS PostgreSQL with automatic password rotation via Secrets Manager, SSM Parameter Store integration, subnet groups, and security groups allowing only app-tier access',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: null,
      pipeline: null, config_tool: null,
      category: 'iac',
      tags: ['aws', 'rds', 'postgres', 'terraform', 'secrets-manager', 'ssm'],
      content: generateAwsTerraform(ctx)
    })
  } catch (e) { console.error('[Seed] RDS:', e.message) }

  // ── AWS Terraform: ElastiCache Redis ────────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'cache-layer',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: '', configTool: '',
      resources: [
        { serviceId: 'elasticache_r', names: ['session-cache'], props: { node_type: 'cache.t3.micro', num_cache_nodes: 2 } },
        { serviceId: 'vpc',           names: ['main'], props: {} },
      ]
    })
    entries.push({
      name: 'AWS ElastiCache Redis Cluster',
      description: 'Terraform module for AWS ElastiCache Redis cluster with subnet group, security group, and SSM Parameter Store for connection string',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: null,
      pipeline: null, config_tool: null,
      category: 'iac',
      tags: ['aws', 'elasticache', 'redis', 'terraform', 'caching'],
      content: generateAwsTerraform(ctx)
    })
  } catch (e) { console.error('[Seed] Redis:', e.message) }

  // ── GitHub Actions: EC2 Rolling Deploy ───────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'web-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: 'github', configTool: '',
      resources: [
        { serviceId: 'ec2_asg', names: ['web'], props: {} }
      ]
    })
    entries.push({
      name: 'GitHub Actions CI/CD Pipeline for EC2 ASG',
      description: 'GitHub Actions workflow for building, testing, and deploying to AWS EC2 Auto Scaling Group with rolling instance refresh, Terraform plan/apply, and environment-based approvals',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: 'ec2',
      pipeline: 'github', config_tool: null,
      category: 'pipeline',
      tags: ['github-actions', 'ci-cd', 'aws', 'ec2', 'asg', 'terraform', 'rolling-deploy'],
      content: generatePipeline(ctx)
    })
  } catch (e) { console.error('[Seed] GitHub EC2 pipeline:', e.message) }

  // ── GitHub Actions: EKS Helm Deploy ─────────────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'k8s-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'eks',
      pipeline: 'github', configTool: '',
      resources: [
        { serviceId: 'eks_cluster', names: ['prod'], props: {} }
      ]
    })
    entries.push({
      name: 'GitHub Actions CI/CD Pipeline for EKS Helm',
      description: 'GitHub Actions workflow for building Docker images, pushing to ECR, and deploying to EKS via Helm upgrade with rollback on failure',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: 'eks',
      pipeline: 'github', config_tool: null,
      category: 'pipeline',
      tags: ['github-actions', 'ci-cd', 'aws', 'eks', 'helm', 'docker', 'ecr'],
      content: generatePipeline(ctx)
    })
  } catch (e) { console.error('[Seed] GitHub EKS pipeline:', e.message) }

  // ── Ansible: Server Bootstrap + Nginx + PM2 ──────────────────────────────
  try {
    const ctx = buildContext({
      appDescription: 'node-web-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: 'github', configTool: 'ansible',
      configPresets: ['nginx', 'pm2', 'certbot', 'fail2ban'],
      resources: [
        { serviceId: 'ec2_asg', names: ['web'], props: { instance_type: 't3.medium' } }
      ]
    })
    entries.push({
      name: 'Ansible Playbook: Node.js Web Server (nginx + PM2 + certbot)',
      description: 'Ansible roles for bootstrapping EC2 instances with Node.js, nginx reverse proxy, PM2 process manager, Certbot SSL certificate, and fail2ban intrusion prevention',
      cloud: 'aws', iac_tool: null, deploy_target: 'ec2',
      pipeline: null, config_tool: 'ansible',
      category: 'config',
      tags: ['ansible', 'nginx', 'pm2', 'nodejs', 'certbot', 'ssl', 'fail2ban', 'ec2'],
      content: generateConfig(ctx)
    })
  } catch (e) { console.error('[Seed] Ansible:', e.message) }

  // ── AWS Terraform: Full Stack (EC2 + RDS + Redis + S3) ──────────────────
  try {
    const ctx = buildContext({
      appDescription: 'full-stack-app',
      cloud: 'aws', region: 'us-east-1',
      iacTool: 'terraform', deployTarget: 'ec2',
      pipeline: 'github', configTool: 'ansible',
      resources: [
        { serviceId: 'ec2_asg',       names: ['web'],         props: { instance_type: 't3.medium', min_size: 2, max_size: 6 } },
        { serviceId: 'alb',           names: ['web-alb'],     props: {} },
        { serviceId: 'rds_postgres',  names: ['app-db'],      props: { db_class: 'db.t3.medium', multi_az: true } },
        { serviceId: 'elasticache_r', names: ['cache'],       props: { node_type: 'cache.t3.micro' } },
        { serviceId: 's3',            names: ['assets'],      props: {} },
        { serviceId: 'vpc',           names: ['main'],        props: {} },
      ]
    })
    entries.push({
      name: 'AWS Full Stack: EC2 + RDS + Redis + S3',
      description: 'Complete AWS infrastructure with EC2 Auto Scaling Group, Application Load Balancer, RDS PostgreSQL, ElastiCache Redis, S3 bucket, VPC networking, IAM roles, and Secrets Manager',
      cloud: 'aws', iac_tool: 'terraform', deploy_target: 'ec2',
      pipeline: 'github', config_tool: 'ansible',
      category: 'iac',
      tags: ['aws', 'terraform', 'ec2', 'rds', 'postgres', 'redis', 'elasticache', 's3', 'alb', 'full-stack'],
      content: generateAwsTerraform(ctx)
    })
  } catch (e) { console.error('[Seed] Full stack:', e.message) }

  return entries
}

// ── Main handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const allowedOrigin = getAllowedOrigin()
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key')
  res.setHeader('Vary', 'Origin')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!adminAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized. Provide X-Admin-Key header.' })
  }

  const supabase = supabaseClient()
  const { action } = req.query

  // ── LIST ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'list') {
    const { data, error } = await supabase
      .from('stack_templates')
      .select('id, name, description, cloud, iac_tool, deploy_target, pipeline, config_tool, category, tags, usage_count, quality_score, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ templates: data })
  }

  // ── GET ONE ──────────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'get') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Missing id' })

    const { data, error } = await supabase
      .from('stack_templates')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json({ template: data })
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'create') {
    const { name, description, cloud, iac_tool, deploy_target, pipeline, config_tool, category, content, tags, quality_score } = req.body || {}

    if (!name || !description || !cloud || !category || !content) {
      return res.status(400).json({ error: 'Required: name, description, cloud, category, content' })
    }

    let embedding = null
    try {
      const embedText = `${name}. ${description}\n\n${content.slice(0, 4000)}`
      embedding = await getEmbedding(embedText)
    } catch (err) {
      console.warn('[Admin] Embedding failed, inserting without vector:', err.message)
    }

    const { data, error } = await supabase
      .from('stack_templates')
      .insert({
        name, description, cloud,
        iac_tool: iac_tool || null,
        deploy_target: deploy_target || null,
        pipeline: pipeline || null,
        config_tool: config_tool || null,
        category, content,
        tags: tags || [],
        quality_score: quality_score ?? 1.0,
        embedding
      })
      .select('id, name')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ ok: true, id: data.id, name: data.name })
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (req.method === 'PUT' && action === 'update') {
    const { id, ...fields } = req.body || {}
    if (!id) return res.status(400).json({ error: 'Missing id' })

    // Re-embed if content or description changed
    if (fields.content || fields.description || fields.name) {
      const { data: existing } = await supabase
        .from('stack_templates')
        .select('name, description, content')
        .eq('id', id)
        .single()

      if (existing) {
        const name = fields.name || existing.name
        const description = fields.description || existing.description
        const content = fields.content || existing.content

        try {
          const embedText = `${name}. ${description}\n\n${content.slice(0, 4000)}`
          fields.embedding = await getEmbedding(embedText)
        } catch (err) {
          console.warn('[Admin] Re-embed failed:', err.message)
        }
      }
    }

    const { error } = await supabase
      .from('stack_templates')
      .update(fields)
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'delete') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'Missing id' })

    const { error } = await supabase
      .from('stack_templates')
      .delete()
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // ── SEED ─────────────────────────────────────────────────────────────────
  // Inserts built-in templates from templateLibrary.js, skipping duplicates by name.
  if (req.method === 'POST' && action === 'seed') {
    let entries
    try {
      entries = buildSeedEntries()
    } catch (err) {
      return res.status(500).json({ error: `Failed to build seed entries: ${err.message}` })
    }

    const results = { inserted: 0, skipped: 0, errors: [] }

    for (const entry of entries) {
      // Skip if name already exists
      const { data: existing } = await supabase
        .from('stack_templates')
        .select('id')
        .eq('name', entry.name)
        .single()

      if (existing) {
        results.skipped++
        continue
      }

      // Generate embedding
      let embedding = null
      try {
        const embedText = `${entry.name}. ${entry.description}\n\n${entry.content.slice(0, 4000)}`
        embedding = await getEmbedding(embedText)
        await new Promise(r => setTimeout(r, 1200)) // Gemini free tier rate limit
      } catch (err) {
        console.warn(`[Seed] Embedding failed for "${entry.name}":`, err.message)
      }

      const { error } = await supabase
        .from('stack_templates')
        .insert({ ...entry, embedding })

      if (error) {
        results.errors.push({ name: entry.name, error: error.message })
      } else {
        results.inserted++
      }
    }

    return res.status(200).json({ ok: true, ...results, total: entries.length })
  }

  // ── QUALITY SCORE ─────────────────────────────────────────────────────────
  // Quick endpoint to adjust quality_score for a template (0.0 – 2.0)
  if (req.method === 'POST' && action === 'quality') {
    const { id, quality_score } = req.body || {}
    if (!id || quality_score == null) return res.status(400).json({ error: 'Missing id or quality_score' })
    if (quality_score < 0 || quality_score > 2) return res.status(400).json({ error: 'quality_score must be 0.0–2.0' })

    const { error } = await supabase
      .from('stack_templates')
      .update({ quality_score })
      .eq('id', id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(404).json({ error: `Unknown action: ${action}. Valid: list | get | create | update | delete | seed | quality` })
}
