import { useState } from 'react'

export default function LandingPage({ onSignIn }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const CHECKOUT_URL = import.meta.env.VITE_LS_CHECKOUT_URL

  return (
    <div style={{ minHeight: '100vh', background: '#050b14', color: '#E2E8F0', fontFamily: 'sans-serif', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600;700&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#050b14}
        .lp-body{font-family:'DM Sans',sans-serif}
        .lp-mono{font-family:'IBM Plex Mono',monospace}
        .lp-display{font-family:'Bebas Neue',sans-serif}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .fade1{animation:fadeUp .6s ease both}
        .fade2{animation:fadeUp .6s .1s ease both}
        .fade3{animation:fadeUp .6s .2s ease both}
        .fade4{animation:fadeUp .6s .3s ease both}
        .cursor{display:inline-block;width:7px;height:13px;background:#F59E0B;animation:blink .9s infinite;vertical-align:middle;margin-left:2px}
        .grid-bg{background-image:linear-gradient(rgba(26,45,74,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(26,45,74,.18) 1px,transparent 1px);background-size:48px 48px}
        .btn-primary{display:inline-flex;align-items:center;gap:8px;background:#F59E0B;color:#000;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:13px;padding:14px 28px;border-radius:8px;text-decoration:none;letter-spacing:.04em;border:none;cursor:pointer;transition:all .2s}
        .btn-primary:hover{background:#FCD34D;transform:translateY(-2px);box-shadow:0 8px 28px rgba(245,158,11,.3)}
        .btn-secondary{display:inline-flex;align-items:center;gap:8px;background:transparent;color:#E2E8F0;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:14px 24px;border-radius:8px;text-decoration:none;border:1px solid #243d5c;cursor:pointer;transition:all .2s}
        .btn-secondary:hover{border-color:#06B6D4;color:#06B6D4}
        .card{background:#080f1c;border:1px solid #1a2d4a;border-radius:12px;padding:22px;transition:border-color .2s,transform .2s}
        .card:hover{border-color:#243d5c;transform:translateY(-3px)}
        .price-card{background:#080f1c;border:1px solid #1a2d4a;border-radius:14px;padding:28px}
        .price-card.featured{border-color:#F59E0B;background:linear-gradient(145deg,rgba(245,158,11,.05),#080f1c)}
        .faq-item{border-bottom:1px solid #1a2d4a;padding:18px 0}
        .stab{padding:10px 18px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#64748B;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;transition:color .15s;background:none;border-left:none;border-right:none;border-top:none}
        .stab.on{color:#F59E0B;border-bottom-color:#F59E0B}
        .chip{font-family:'IBM Plex Mono',monospace;font-size:9px;background:rgba(6,182,212,.07);border:1px solid rgba(6,182,212,.15);color:#06B6D4;padding:2px 7px;border-radius:4px}
      `}</style>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,11,20,.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1a2d4a', padding: '0 5vw', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#F59E0B,#E07B00)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>⚡</div>
          <span className="lp-display" style={{ fontSize: 20, letterSpacing: '.1em' }}>STACK<span style={{ color: '#F59E0B' }}>FORGE</span> AI</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="#features" style={{ color: '#64748B', textDecoration: 'none', fontSize: 13, fontFamily: 'DM Sans' }}>Features</a>
          <a href="#pricing" style={{ color: '#64748B', textDecoration: 'none', fontSize: 13, fontFamily: 'DM Sans' }}>Pricing</a>
          <button onClick={onSignIn} style={{ background: 'none', border: '1px solid #1a2d4a', color: '#94A3B8', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontFamily: 'IBM Plex Mono', letterSpacing: '.04em' }}>SIGN IN</button>
          <a href={CHECKOUT_URL} className="btn-primary" style={{ padding: '7px 16px', fontSize: 12 }}>GET STARTED →</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="grid-bg" style={{ minHeight: '92vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 5vw 60px' }}>
        <div className="fade1" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 20, padding: '5px 14px', fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#F59E0B', letterSpacing: '.08em', marginBottom: 24 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B', animation: 'pulse 2s infinite' }}/>
          AI-POWERED · PRODUCTION-READY · INSTANT DOWNLOAD
        </div>

        <h1 className="lp-display fade2" style={{ fontSize: 'clamp(52px,10vw,110px)', lineHeight: .95, letterSpacing: '.04em', marginBottom: 8 }}>
          GENERATE YOUR<br /><span style={{ color: '#F59E0B' }}>ENTIRE</span> DEVOPS<br />STACK IN 90s
        </h1>

        <p className="fade3" style={{ fontSize: 'clamp(15px,2vw,18px)', color: '#64748B', maxWidth: 560, fontWeight: 300, lineHeight: 1.7, marginBottom: 32, marginTop: 12 }}>
          Describe your app. Pick your cloud. Get <strong style={{ color: '#E2E8F0', fontWeight: 500 }}>production-ready Terraform, Helm charts, CI/CD pipelines, Ansible playbooks, security baseline + runbook</strong> as a downloadable ZIP.
        </p>

        <div className="fade4" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 52 }}>
          <a href={CHECKOUT_URL} className="btn-primary">⚡ START FREE TRIAL — $20/MO</a>
          <button onClick={onSignIn} className="btn-secondary">SIGN IN →</button>
        </div>

        {/* Terminal */}
        <div className="fade4" style={{ width: '100%', maxWidth: 740, background: '#080f1c', border: '1px solid #243d5c', borderRadius: 12, overflow: 'hidden', textAlign: 'left', boxShadow: '0 32px 80px rgba(0,0,0,.6)' }}>
          <div style={{ background: '#0a1525', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #1a2d4a' }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FF5F57' }}/>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#FFBD2E' }}/>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28CA41' }}/>
            <span className="lp-mono" style={{ marginLeft: 8, fontSize: 11, color: '#64748B' }}>stackforge — generating eks-prod stack</span>
          </div>
          <div className="lp-mono" style={{ padding: '18px 20px', fontSize: 12, lineHeight: 1.8 }}>
            <div><span style={{ color: '#F59E0B' }}>$</span> <span style={{ color: '#06B6D4' }}>stackforge</span> generate --cloud aws --deploy eks</div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>terraform/modules/networking/main.tf</span> <span style={{ color: '#334155' }}>(VPC, 2× NAT, SGs)</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>terraform/modules/compute/main.tf</span> <span style={{ color: '#334155' }}>(eks-prod, eks-staging)</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>helm/app/templates/deployment-backend.yaml</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>pipelines/backend/.github/workflows/deploy.yml</span> <span style={{ color: '#334155' }}>(+ DB migration)</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>ansible/roles/nginx/tasks/main.yml</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>observability/grafana/dashboards/slo-dashboard.json</span></div>
            <div style={{ color: '#10B981' }}>✓ <span style={{ color: '#10B981' }}>security/cis-checklist.md</span> <span style={{ color: '#334155' }}>(20 controls)</span></div>
            <div><span style={{ color: '#10B981' }}>✅ Done.</span> <span style={{ color: '#F59E0B' }}>68 files</span> <span style={{ color: '#334155' }}>in</span> <span style={{ color: '#06B6D4' }}>stackforge-myapp.zip</span><span className="cursor"/></div>
          </div>
        </div>
      </section>

      {/* PROOF BAR */}
      <div style={{ borderTop: '1px solid #1a2d4a', borderBottom: '1px solid #1a2d4a', padding: '16px 5vw', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', background: 'rgba(8,15,28,.7)' }}>
        {[['3','CLOUDS'],['279','SERVICES'],['6','IaC TOOLS'],['5','CI/CD PIPELINES'],['8','OUTPUT SECTIONS'],['60+','ANSIBLE PRESETS']].map(([n,l]) => (
          <div key={l} className="lp-mono" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#64748B' }}>
            <span style={{ color: '#F59E0B', fontWeight: 700, fontSize: 14 }}>{n}</span> {l}
          </div>
        ))}
      </div>

      {/* FEATURES */}
      <section id="features" style={{ padding: '90px 5vw' }}>
        <div style={{ marginBottom: 48 }}>
          <div className="lp-mono" style={{ fontSize: 10, color: '#F59E0B', letterSpacing: '.2em', marginBottom: 12 }}>WHAT YOU GET</div>
          <h2 className="lp-display" style={{ fontSize: 'clamp(36px,6vw,64px)', letterSpacing: '.06em', lineHeight: 1, marginBottom: 14 }}>ONE CLICK. EIGHT OUTPUTS.</h2>
          <p style={{ fontSize: 17, color: '#64748B', maxWidth: 520, fontWeight: 300 }}>Every file uses the exact resource names you typed. Real folders, real code, ready to run.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
          {[
            { icon: '🏗️', title: 'INFRASTRUCTURE AS CODE', desc: 'Full Terraform module tree, Terragrunt, CloudFormation, Bicep, ARM, or Pulumi. Makefile with terraform validate before every plan.', chips: ['modules/networking/', 'modules/compute/', 'smoke_test.sh'] },
            { icon: '🔁', title: 'FRONTEND + BACKEND PIPELINES', desc: 'Separate pipelines for each service. Frontend gets Lighthouse CI. Backend gets DB migration before deploy. Both get Trivy scans + auto-rollback.', chips: ['frontend-deploy.yml', 'backend-deploy.yml', 'health_check.sh'] },
            { icon: '⎈', title: 'FULL HELM CHART OR K8S', desc: '18+ Helm templates with values-dev, values-prod, helmfile, HPA, PDB, RBAC. Or plain K8s manifests for non-Kubernetes deploys.', chips: ['values-prod.yaml', 'helmfile.yaml', 'rbac.yaml'] },
            { icon: '🔐', title: 'SECURITY BASELINE', desc: 'Least-privilege IAM, security group table with justifications, CIS Benchmark 20-point checklist, SOC2/PCI-DSS/HIPAA/ISO27001 mappings.', chips: ['iam-policy.json', 'cis-checklist.md', 'kms-setup.sh'] },
            { icon: '🔧', title: 'ANSIBLE / PUPPET / CHEF', desc: 'Full playbooks + roles for 60+ software presets: nginx, PM2, Docker, PostgreSQL, Redis, Certbot, Fail2ban, Datadog, SSH hardening.', chips: ['roles/nginx/', 'roles/docker/', 'site.yml'] },
            { icon: '📊', title: 'FULL OBSERVABILITY STACK', desc: 'Prometheus + Grafana + Loki + Jaeger + OTel Collector. Pre-built dashboards, alert rules for CPU/memory/error rate/p99 latency.', chips: ['alert_rules.yml', 'slo-dashboard.json', 'otel-config.yml'] },
            { icon: '🔑', title: 'SECRETS & ENV MANAGEMENT', desc: '.env.example, HashiCorp Vault config + policies, ExternalSecrets CRDs, SealedSecrets for GitOps, DB credential rotation scripts.', chips: ['.env.example', 'vault-policy.hcl', 'rotate-creds.sh'] },
            { icon: '📋', title: 'RUNBOOK & DOCS', desc: 'Architecture ASCII diagram, day-2 ops with exact CLI commands, incident playbook for 7 failure scenarios, monthly cost estimate.', chips: ['runbook.md', 'incident-playbook', 'cost-estimate'] },
          ].map(f => (
            <div key={f.title} className="card">
              <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
              <div className="lp-mono" style={{ fontWeight: 700, fontSize: 12, color: '#E2E8F0', marginBottom: 7, letterSpacing: '.03em' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.65, marginBottom: 12 }}>{f.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {f.chips.map(c => <span key={c} className="chip">{c}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '90px 5vw', background: '#080f1c', borderTop: '1px solid #1a2d4a' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div className="lp-mono" style={{ fontSize: 10, color: '#F59E0B', letterSpacing: '.2em', marginBottom: 12 }}>PRICING</div>
            <h2 className="lp-display" style={{ fontSize: 'clamp(36px,6vw,64px)', letterSpacing: '.06em', lineHeight: 1, marginBottom: 14 }}>SIMPLE. FLAT. MONTHLY.</h2>
            <p style={{ fontSize: 16, color: '#64748B', fontWeight: 300 }}>All AI generation costs included. No API key needed. Cancel any time.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 18, justifyContent: 'center', maxWidth: 860, margin: '0 auto' }}>
            {[
              { tier: 'STARTER', price: 20, note: 'per month', cta: 'GET STARTED', primary: false, features: ['All 8 output sections', '279 cloud services', 'AWS + Azure + GCP', 'Download as ZIP', 'GitHub push', '50 generations/day', 'AI credits included'] },
              { tier: 'TEAM', price: 49, note: 'per month', cta: 'GET TEAM', primary: true, badge: 'MOST POPULAR', features: ['Everything in Starter', 'Up to 5 seats', 'Shared stack history', 'Stack diff viewer', 'All compliance profiles', '200 generations/day', 'Priority support'] },
              { tier: 'AGENCY', price: 149, note: 'per month', cta: 'GET AGENCY', primary: false, features: ['Everything in Team', 'Unlimited seats', 'White-label branding', 'Custom service catalog', 'Unlimited generations', 'Invoice billing', 'Private Slack channel'] },
            ].map(p => (
              <div key={p.tier} className="price-card" style={{ position: 'relative', ...(p.primary ? { border: '1px solid #F59E0B', background: 'linear-gradient(145deg,rgba(245,158,11,.06),#080f1c)' } : {}) }}>
                {p.badge && <div className="lp-mono" style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: '#F59E0B', color: '#000', fontSize: 9, fontWeight: 700, padding: '3px 12px', borderRadius: 20, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>{p.badge}</div>}
                <div className="lp-mono" style={{ fontSize: 11, color: '#64748B', letterSpacing: '.15em', marginBottom: 10 }}>{p.tier}</div>
                <div className="lp-display" style={{ fontSize: 52, lineHeight: 1, marginBottom: 4 }}><span style={{ fontSize: 24, color: '#64748B' }}>$</span>{p.price}</div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 20 }}>{p.note} · all AI included</div>
                <hr style={{ border: 'none', borderTop: '1px solid #1a2d4a', marginBottom: 16 }}/>
                {p.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 9, fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                    <span style={{ color: '#10B981', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
                <a href={CHECKOUT_URL} className={p.primary ? 'btn-primary' : 'btn-secondary'} style={{ display: 'block', textAlign: 'center', marginTop: 20, padding: 11, borderRadius: 8, fontFamily: 'IBM Plex Mono', fontWeight: 700, fontSize: 12, textDecoration: 'none', letterSpacing: '.04em', ...(p.primary ? {} : { border: '1px solid #243d5c' }) }}>
                  {p.cta} →
                </a>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#334155', marginTop: 22 }}>30-day money-back guarantee · No API key needed · Cancel any time</p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '90px 5vw' }}>
        <div style={{ maxWidth: 700 }}>
          <div className="lp-mono" style={{ fontSize: 10, color: '#F59E0B', letterSpacing: '.2em', marginBottom: 12 }}>FAQ</div>
          <h2 className="lp-display" style={{ fontSize: 'clamp(36px,6vw,64px)', letterSpacing: '.06em', lineHeight: 1, marginBottom: 40 }}>COMMON QUESTIONS</h2>
          {[
            ['Does the generated Terraform actually work?', 'Yes — every IaC output includes a Makefile that runs terraform validate and terraform fmt -check before any plan. The code is ready to terraform init && make plan after filling in your credentials.'],
            ['Do I need an Anthropic API key?', 'No. Your $20/month subscription covers all AI generation costs. We use our own API key on the server. You never see or manage an API key.'],
            ['What happens after I pay?', 'You create an account with the same email used at checkout. Your subscription activates automatically within 30 seconds via webhook. Then you have full access.'],
            ['What is the 50 generations/day limit?', 'At roughly $0.10 per full generation, 50/day keeps costs predictable. Normal usage is 5–20 generations per month. If you need more, upgrade to the Team plan.'],
            ['Can I cancel any time?', 'Yes. Cancel from your Lemon Squeezy customer portal. You keep access until the end of the billing period.'],
          ].map(([q, a], i) => (
            <FaqItem key={i} q={q} a={a} />
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: '100px 5vw', textAlign: 'center', borderTop: '1px solid #1a2d4a', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 250, background: 'radial-gradient(ellipse,rgba(245,158,11,.07) 0%,transparent 70%)', pointerEvents: 'none' }}/>
        <div className="lp-mono" style={{ fontSize: 10, color: '#F59E0B', letterSpacing: '.2em', marginBottom: 14 }}>GET STARTED TODAY</div>
        <h2 className="lp-display" style={{ fontSize: 'clamp(44px,8vw,88px)', letterSpacing: '.06em', lineHeight: 1, marginBottom: 16 }}>
          STOP WRITING<br /><span style={{ color: '#F59E0B' }}>BOILERPLATE.</span>
        </h2>
        <p style={{ fontSize: 17, color: '#64748B', marginBottom: 32, fontWeight: 300 }}>Your next infrastructure project starts with a form, not a blank file.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          <a href={CHECKOUT_URL} className="btn-primary">⚡ GET STACKFORGE — $20/MO</a>
          <button onClick={onSignIn} className="btn-secondary">ALREADY HAVE AN ACCOUNT →</button>
        </div>
        <p className="lp-mono" style={{ fontSize: 11, color: '#334155' }}>30-day money-back · No API key · Cancel any time</p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1a2d4a', padding: '24px 5vw', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span className="lp-mono" style={{ fontSize: 11, color: '#334155' }}>© 2025 StackForge AI</span>
        <div style={{ display: 'flex', gap: 20 }}>
          {['Features', 'Pricing', 'Sign In'].map(l => (
            <span key={l} onClick={l === 'Sign In' ? onSignIn : undefined} className="lp-mono" style={{ fontSize: 11, color: '#475569', cursor: 'pointer', textDecoration: 'none' }}>{l}</span>
          ))}
        </div>
      </footer>
    </div>
  )
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item">
      <div onClick={() => setOpen(!open)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: 'IBM Plex Mono', fontSize: 13, color: '#E2E8F0', fontWeight: 600, gap: 16 }}>
        {q}
        <span style={{ color: '#F59E0B', fontSize: 18, flexShrink: 0, transition: 'transform .2s', transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
      </div>
      {open && <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7, paddingTop: 12 }}>{a}</div>}
    </div>
  )
}
