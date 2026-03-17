import { useState, useEffect } from 'react'

function SEOMeta() {
  useEffect(() => {
    document.title = 'StackForge AI — Generate Terraform, Helm & Ansible in 90 Seconds'
    const setMeta = (name, content, prop) => {
      let el = document.querySelector(prop ? `meta[property="${name}"]` : `meta[name="${name}"]`)
      if (!el) { el = document.createElement('meta'); if (prop) el.setAttribute('property', name); else el.setAttribute('name', name); document.head.appendChild(el) }
      el.setAttribute('content', content)
    }
    setMeta('description', 'StackForge AI generates production-ready Terraform modules, Helm charts, GitHub Actions pipelines, Ansible playbooks, security baseline and SRE runbooks for AWS, Azure and GCP. Subscribe and download as ZIP instantly.')
    setMeta('keywords', 'terraform generator, helm chart generator, ansible playbook generator, devops automation, infrastructure as code generator, kubernetes yaml generator, github actions pipeline generator, aws terraform modules, eks helm chart, terraform module generator, iac automation, devops stack generator')
    setMeta('og:title', 'StackForge AI — Generate Your Entire DevOps Stack in 90 Seconds', true)
    setMeta('og:description', 'Terraform modules, Helm charts, CI/CD pipelines, Ansible playbooks, security baseline + runbook. Real folder structure, downloadable ZIP. $20/month.', true)
    setMeta('og:type', 'website', true)
    let sd = document.getElementById('sf-sd')
    if (!sd) { sd = document.createElement('script'); sd.id = 'sf-sd'; sd.type = 'application/ld+json'; document.head.appendChild(sd) }
    sd.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "SoftwareApplication",
      "name": "StackForge AI",
      "description": "AI-powered DevOps stack generator for Terraform, Helm, Ansible, CI/CD pipelines and security baselines",
      "applicationCategory": "DeveloperApplication",
      "offers": { "@type": "Offer", "price": "20", "priceCurrency": "USD" },
      "featureList": ["Terraform module generator","Helm chart generator","Ansible playbook generator","Kubernetes YAML generator","GitHub Actions pipeline generator"]
    })
  }, [])
  return null
}

function TermLine({ delay, children }) {
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t) }, [delay])
  return <span style={{ display:'block', opacity: show ? 1 : 0, transition:'opacity .2s' }}>{children}</span>
}

export default function LandingPage({ onSignIn }) {
  const [activeTab, setActiveTab] = useState('tf')
  const [openFaq, setOpenFaq] = useState(null)
  const CHECKOUT = import.meta.env.VITE_LS_CHECKOUT_URL

  const A = '#f0a500'   // amber
  const C = '#00c2d4'   // cyan
  const G = '#00e5a0'   // green
  const M = '#5a7394'   // muted
  const B = '#1c2e46'   // border
  const S = '#111927'   // surface
  const BG = '#080c12'  // background

  const CODE = {
    tf: `<span style="color:#374a5a"># terraform/modules/compute/main.tf — eks-prod, eks-staging</span>
<span style="color:#c792ea">resource</span> <span style="color:#00e5a0">"aws_eks_cluster"</span> <span style="color:#00e5a0">"this"</span> {
  <span style="color:#f48fb1">for_each</span> = <span style="color:#00c2d4">toset</span>([<span style="color:#00e5a0">"eks-prod"</span>, <span style="color:#00e5a0">"eks-staging"</span>])
  <span style="color:#f48fb1">name</span>     = each.key
  <span style="color:#f48fb1">version</span>  = <span style="color:#00e5a0">"1.30"</span>
  vpc_config {
    <span style="color:#f48fb1">endpoint_private_access</span> = <span style="color:#c792ea">true</span>
    <span style="color:#f48fb1">endpoint_public_access</span>  = <span style="color:#c792ea">false</span>
  }
  enabled_cluster_log_types = [<span style="color:#00e5a0">"api"</span>, <span style="color:#00e5a0">"audit"</span>]
  tags = <span style="color:#00c2d4">merge</span>(var.common_tags, { Name = each.key })
}
<span style="color:#c792ea">resource</span> <span style="color:#00e5a0">"aws_eks_node_group"</span> <span style="color:#00e5a0">"app"</span> {
  <span style="color:#f48fb1">cluster_name</span>    = each.value.name
  <span style="color:#f48fb1">instance_types</span>  = each.key == <span style="color:#00e5a0">"eks-prod"</span> ? [<span style="color:#00e5a0">"m6i.xlarge"</span>] : [<span style="color:#00e5a0">"t3.medium"</span>]
  scaling_config { desired_size = <span style="color:#f0a500">3</span>  min_size = <span style="color:#f0a500">2</span>  max_size = <span style="color:#f0a500">10</span> }
}`,
    helm: `<span style="color:#374a5a"># helm/app/values-prod.yaml — production overrides</span>
<span style="color:#f48fb1">replicaCount</span>: { frontend: <span style="color:#f0a500">3</span>, backend: <span style="color:#f0a500">4</span> }
<span style="color:#f48fb1">resources</span>:
  backend:
    requests: { cpu: <span style="color:#00e5a0">"500m"</span>, memory: <span style="color:#00e5a0">"512Mi"</span> }
    limits:   { cpu: <span style="color:#00e5a0">"1"</span>,     memory: <span style="color:#00e5a0">"1Gi"</span>   }
<span style="color:#f48fb1">autoscaling</span>:
  enabled: <span style="color:#c792ea">true</span>
  minReplicas: <span style="color:#f0a500">2</span>  maxReplicas: <span style="color:#f0a500">10</span>
  targetCPUUtilizationPercentage: <span style="color:#f0a500">70</span>
<span style="color:#f48fb1">podDisruptionBudget</span>: { enabled: <span style="color:#c792ea">true</span>, minAvailable: <span style="color:#f0a500">2</span> }
<span style="color:#f48fb1">ingress</span>:
  annotations:
    cert-manager.io/cluster-issuer: <span style="color:#00e5a0">"letsencrypt-prod"</span>
    nginx.ingress.kubernetes.io/ssl-redirect: <span style="color:#00e5a0">"true"</span>`,
    ansible: `<span style="color:#374a5a"># ansible/roles/nginx/tasks/main.yml — idempotent, Debian+RHEL</span>
- <span style="color:#f48fb1">name</span>: <span style="color:#00e5a0">Install nginx</span>
  <span style="color:#f48fb1">package</span>: { name: nginx, state: present, update_cache: <span style="color:#c792ea">true</span> }

- <span style="color:#f48fb1">name</span>: <span style="color:#00e5a0">Deploy config from Jinja2 template</span>
  <span style="color:#f48fb1">template</span>:
    <span style="color:#f48fb1">src</span>: nginx.conf.j2
    <span style="color:#f48fb1">dest</span>: /etc/nginx/nginx.conf
    <span style="color:#f48fb1">validate</span>: <span style="color:#00e5a0">"nginx -t -c %s"</span>
  <span style="color:#f48fb1">notify</span>: reload nginx

- <span style="color:#f48fb1">name</span>: <span style="color:#00e5a0">Ensure enabled + running</span>
  <span style="color:#f48fb1">service</span>: { name: nginx, state: started, enabled: <span style="color:#c792ea">true</span> }

- <span style="color:#f48fb1">name</span>: <span style="color:#00e5a0">Open ports via UFW</span>
  <span style="color:#f48fb1">ufw</span>: { rule: allow, name: <span style="color:#00e5a0">"{{ item }}"</span> }
  loop: [<span style="color:#00e5a0">"Nginx HTTP"</span>, <span style="color:#00e5a0">"Nginx HTTPS"</span>]`,
    gha: `<span style="color:#374a5a"># pipelines/backend/.github/workflows/deploy.yml</span>
<span style="color:#f48fb1">name</span>: Backend Deploy
<span style="color:#f48fb1">on</span>: { push: { branches: [main, develop] } }
<span style="color:#f48fb1">jobs</span>:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <span style="color:#f48fb1">name</span>: Trivy scan — fail on CRITICAL
        uses: aquasecurity/trivy-action@master
        with: { scan-type: fs, exit-code: <span style="color:#00e5a0">'1'</span>, severity: CRITICAL }
      - <span style="color:#f48fb1">name</span>: <span style="color:#00e5a0">DB migration BEFORE deploy</span>
        run: kubectl run migration -- npm run migrate
      - <span style="color:#f48fb1">name</span>: Helm upgrade --atomic (auto-rollback)
        run: |
          helm upgrade --install backend ./helm/app \\
            --atomic --wait -f values-prod.yaml \\
            --set image.tag=<span style="color:#00e5a0">\${{ github.sha }}</span>`,
  }

  const mono = { fontFamily:"'JetBrains Mono',monospace" }
  const display = { fontFamily:"'Clash Display',sans-serif" }

  return (
    <div style={{ background:BG, color:'#eef2f8', fontFamily:"'Sora',sans-serif", overflowX:'hidden', lineHeight:1.6, minHeight:'100vh' }}>
      <SEOMeta/>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Clash+Display:wght@500;600;700&family=Sora:wght@300;400;500&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box}
        .lp::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
          background-image:linear-gradient(rgba(28,46,70,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(28,46,70,.14) 1px,transparent 1px);
          background-size:60px 60px;}
        .lp::after{content:'';position:fixed;top:-160px;left:50%;transform:translateX(-50%);
          width:700px;height:380px;
          background:radial-gradient(ellipse,rgba(240,165,0,.09) 0%,transparent 68%);
          pointer-events:none;z-index:0;}
        .lp-nav{position:fixed;top:0;left:0;right:0;z-index:200;height:60px;padding:0 6vw;
          display:flex;align-items:center;justify-content:space-between;
          background:rgba(8,12,18,.9);backdrop-filter:blur(14px);border-bottom:1px solid #1c2e46}
        .lp-nav a,.lp-nav-link{color:#5a7394;text-decoration:none;font-size:13px;font-weight:500;transition:color .15s;background:none;border:none;cursor:pointer;font-family:'Sora',sans-serif}
        .lp-nav a:hover,.lp-nav-link:hover{color:#eef2f8}
        .lp-btn{display:inline-flex;align-items:center;gap:8px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:12px;padding:11px 22px;border-radius:6px;text-decoration:none;letter-spacing:.05em;cursor:pointer;transition:all .2s;border:none}
        .lp-btn-amber{background:#f0a500;color:#000}
        .lp-btn-amber:hover{background:#ffc83d;transform:translateY(-2px);box-shadow:0 10px 30px rgba(240,165,0,.22)}
        .lp-btn-outline{background:transparent;color:#eef2f8;border:1px solid #1c2e46!important}
        .lp-btn-outline:hover{border-color:#00c2d4!important;color:#00c2d4}
        .lp-section{position:relative;z-index:1;padding:96px 6vw;max-width:1280px;margin:0 auto}
        .lp-band{position:relative;z-index:1;padding:96px 6vw;background:#0d1420;border-top:1px solid #1c2e46;border-bottom:1px solid #1c2e46}
        .lp-band-inner{max-width:1280px;margin:0 auto}
        .eyebrow{font-family:'JetBrains Mono',monospace;font-size:10px;color:#f0a500;letter-spacing:.2em;display:block;margin-bottom:12px}
        .lp-h2{font-family:'Clash Display',sans-serif;font-size:clamp(34px,4.5vw,60px);letter-spacing:-.01em;line-height:1;margin-bottom:14px}
        .lp-lead{font-size:15px;color:#5a7394;max-width:500px;font-weight:300;line-height:1.8}
        .feat-grid{display:grid;grid-template-columns:1.25fr 1fr 1fr;grid-template-rows:auto auto;gap:2px;border:1px solid #1c2e46;border-radius:12px;overflow:hidden;margin-top:52px}
        .feat{background:#111927;padding:26px;transition:background .2s;position:relative}
        .feat::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#f0a500,transparent);opacity:0;transition:opacity .2s}
        .feat:hover{background:#141e2e}.feat:hover::after{opacity:1}
        .feat-big{grid-row:span 2;display:flex;flex-direction:column;justify-content:space-between}
        .feat-title{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:11px;color:#eef2f8;margin-bottom:8px;letter-spacing:.05em}
        .chip-row{display:flex;flex-wrap:wrap;gap:5px;margin-top:14px}
        .chip{font-family:'JetBrains Mono',monospace;font-size:9px;background:rgba(0,194,212,.07);border:1px solid rgba(0,194,212,.18);color:#00c2d4;padding:2px 8px;border-radius:3px}
        .steps-row{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:52px;position:relative}
        .steps-row::before{content:'';position:absolute;top:26px;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(240,165,0,.4),rgba(240,165,0,.4),transparent)}
        .step-n{width:52px;height:52px;border-radius:50%;border:1px solid #243d5f;background:#111927;font-family:'Clash Display',sans-serif;font-size:22px;color:#f0a500;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative;z-index:1}
        .showcase{margin-top:52px;background:#0d1420;border:1px solid #1c2e46;border-radius:12px;overflow:hidden}
        .stab{padding:11px 18px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#5a7394;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;background:none;border-left:none;border-right:none;border-top:none;transition:color .15s}
        .stab.on{color:#f0a500;border-bottom-color:#f0a500}.stab:hover:not(.on){color:#eef2f8}
        .price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;border:1px solid #1c2e46;border-radius:12px;overflow:hidden;max-width:880px;margin:52px auto 0}
        .price-card{background:#111927;padding:30px;position:relative}
        .price-featured{background:linear-gradient(155deg,rgba(240,165,0,.07),#111927)}
        .price-badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#f0a500;color:#000;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:9px;letter-spacing:.1em;padding:3px 13px;border-radius:4px;white-space:nowrap}
        .testi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;border:1px solid #1c2e46;border-radius:12px;overflow:hidden;margin-top:52px}
        .testi{background:#111927;padding:24px}
        .seo-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:52px}
        .seo-col h3{font-family:'Clash Display',sans-serif;font-size:22px;margin-bottom:12px}
        .seo-col p{font-size:14px;color:#5a7394;line-height:1.8;margin-bottom:14px}
        .seo-col li{font-size:13px;color:#5a7394;margin-bottom:6px;line-height:1.65;list-style:none;padding-left:16px;position:relative}
        .seo-col li::before{content:'→';position:absolute;left:0;color:#f0a500;font-size:11px}
        .seo-col strong{color:#eef2f8}
        .faq-item{border-bottom:1px solid #1c2e46;padding:18px 0}
        .faq-q{font-family:'JetBrains Mono',monospace;font-size:13px;color:#eef2f8;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:16px;font-weight:600;background:none;border:none;width:100%;text-align:left}
        .faq-a{font-size:14px;color:#5a7394;line-height:1.75;overflow:hidden;max-height:0;transition:max-height .3s,padding .3s}
        .faq-open .faq-a{max-height:220px;padding-top:12px}
        @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        .lp-cursor{display:inline-block;width:7px;height:13px;background:#f0a500;animation:blink .9s infinite;vertical-align:middle;margin-left:2px}
        @media(max-width:860px){
          .feat-grid{grid-template-columns:1fr 1fr}.feat-big{grid-row:span 1}
          .steps-row{grid-template-columns:1fr 1fr;gap:28px}.steps-row::before{display:none}
          .price-grid{grid-template-columns:1fr;max-width:420px}
          .testi-grid{grid-template-columns:1fr}.seo-grid{grid-template-columns:1fr}
          .hero-grid{grid-template-columns:1fr!important}.hero-term{display:none!important}
        }
        @media(max-width:560px){.feat-grid{grid-template-columns:1fr}.lp-nav .lp-nav-links{display:none}}
      `}</style>

      {/* NAV */}
      <nav className="lp-nav">
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div style={{width:30,height:30,background:A,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:900,color:'#000'}}>⚡</div>
          <span style={{...display,fontSize:17,fontWeight:700,letterSpacing:'.08em'}}>STACK<span style={{color:A}}>FORGE</span></span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:24}} className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <button onClick={onSignIn} className="lp-nav-link" style={{padding:'6px 14px',border:`1px solid ${B}`,borderRadius:6,...mono,fontSize:11}}>SIGN IN</button>
          <a href={CHECKOUT} className="lp-btn lp-btn-amber" style={{padding:'8px 18px',fontSize:11}}>SUBSCRIBE — $20/MO</a>
        </div>
      </nav>

      {/* HERO */}
      <div className="lp" style={{position:'relative',zIndex:1}}>
      <div className="hero-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:52,alignItems:'center',padding:'118px 6vw 80px',maxWidth:1280,margin:'0 auto'}}>
        <div style={{animation:'fadeUp .6s ease both'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:7,background:'rgba(240,165,0,.08)',border:'1px solid rgba(240,165,0,.24)',borderRadius:4,padding:'5px 12px',...mono,fontSize:10,color:A,letterSpacing:'.12em',marginBottom:20}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:A,animation:'pulse 2s infinite'}}/>
            AI-POWERED · NO API KEY NEEDED · INSTANT DOWNLOAD
          </span>
          <h1 style={{...display,fontSize:'clamp(44px,5.5vw,74px)',lineHeight:.95,letterSpacing:'-.01em',marginBottom:18}}>
            STOP WRITING<br/><span style={{color:A}}>TERRAFORM</span><br/>BOILERPLATE
          </h1>
          <p style={{fontSize:16,color:M,maxWidth:480,fontWeight:300,lineHeight:1.8,marginBottom:32}}>
            Describe your app. Pick your cloud. Get <strong style={{color:'#eef2f8',fontWeight:500}}>complete Terraform modules, Helm charts, CI/CD pipelines, Ansible playbooks, security baseline + runbook</strong> — real folder structure, downloadable ZIP.
          </p>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:36}}>
            <a href={CHECKOUT} className="lp-btn lp-btn-amber">⚡ SUBSCRIBE — $20/MONTH</a>
            <button onClick={onSignIn} className="lp-btn lp-btn-outline">SIGN IN →</button>
          </div>
          <div style={{display:'flex',gap:28,flexWrap:'wrap'}}>
            {[['279','CLOUD SERVICES'],['8','OUTPUT SECTIONS'],['90s','TO GENERATE'],['3','CLOUDS']].map(([n,l])=>(
              <div key={l}>
                <div style={{...display,fontSize:28,fontWeight:700,color:A,lineHeight:1}}>{n}</div>
                <div style={{...mono,fontSize:9,color:M,letterSpacing:'.12em',marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div className="hero-term" style={{background:'#0d1420',border:`1px solid #243d5f`,borderRadius:12,overflow:'hidden',boxShadow:'0 40px 100px rgba(0,0,0,.6)',animation:'fadeUp .7s .1s ease both'}}>
          <div style={{background:'#111927',padding:'10px 16px',display:'flex',alignItems:'center',gap:7,borderBottom:`1px solid ${B}`}}>
            {['#ff5f57','#ffbd2e','#28ca41'].map(c=><div key={c} style={{width:11,height:11,borderRadius:'50%',background:c}}/>)}
            <span style={{marginLeft:8,...mono,fontSize:10,color:M}}>stackforge — aws / eks / terraform</span>
          </div>
          <div style={{padding:'18px 20px',...mono,fontSize:11.5,lineHeight:1.85}}>
            <span style={{display:'block'}}><span style={{color:A}}>$</span> <span style={{color:C}}>stackforge</span> <span style={{color:M}}>generate --cloud aws --deploy eks</span></span>
            {[
              [400,  <><span style={{color:M}}>⠸ Generating IaC modules...</span></>],
              [700,  <><span style={{color:G}}>✓</span> <span style={{color:G}}>terraform/modules/networking/main.tf</span></>],
              [950,  <><span style={{color:G}}>✓</span> <span style={{color:G}}>terraform/modules/compute/main.tf</span> <span style={{color:M}}>(eks-prod, eks-staging)</span></>],
              [1200, <><span style={{color:G}}>✓</span> <span style={{color:G}}>terraform/Makefile</span> <span style={{color:M}}>← validate before every plan</span></>],
              [1500, <><span style={{color:M}}>⠸ Helm chart...</span></>],
              [1800, <><span style={{color:G}}>✓</span> <span style={{color:G}}>helm/app/values-prod.yaml</span> <span style={{color:M}}>(HA, PDB, HPA)</span></>],
              [2100, <><span style={{color:G}}>✓</span> <span style={{color:G}}>pipelines/backend/.github/workflows/deploy.yml</span></>],
              [2400, <><span style={{color:M}}>⠸ Ansible + observability + security...</span></>],
              [2750, <><span style={{color:G}}>✓</span> <span style={{color:G}}>ansible/roles/nginx/tasks/main.yml</span></>],
              [3050, <><span style={{color:G}}>✓</span> <span style={{color:G}}>observability/grafana/dashboards/slo-dashboard.json</span></>],
              [3350, <><span style={{color:G}}>✓</span> <span style={{color:G}}>security/cis-checklist.md</span> <span style={{color:M}}>(20 CIS controls)</span></>],
              [3700, <><br/><span style={{color:G}}>✅ Done.</span> <span style={{color:A}}>71 files</span> → <span style={{color:C}}>stackforge-myapp.zip</span><span className="lp-cursor"/></>],
            ].map(([delay, content], i) => (
              <TermLine key={i} delay={delay}>{content}</TermLine>
            ))}
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="lp-section" id="features">
        <span className="eyebrow">WHAT YOU GET</span>
        <h2 className="lp-h2">One click. Eight outputs.</h2>
        <p className="lp-lead">Every file uses your exact resource names. Real folder structure, syntactically valid, ready to run.</p>
        <div className="feat-grid">
          <div className="feat feat-big">
            <div>
              <div style={{fontSize:22,marginBottom:12}}>🏗️</div>
              <div className="feat-title">TERRAFORM MODULE GENERATOR</div>
              <p style={{fontSize:13,color:M,lineHeight:1.65}}>Full modular Terraform — networking, compute, database, storage, IAM. Makefile runs <code style={{color:C,fontSize:10}}>terraform validate</code> before every plan. Also: Terragrunt, CloudFormation, Bicep, ARM, Pulumi.</p>
            </div>
            <div className="chip-row"><span className="chip">modules/networking/</span><span className="chip">modules/compute/</span><span className="chip">backend.tf</span><span className="chip">Makefile</span><span className="chip">smoke_test.sh</span></div>
          </div>
          {[
            {icon:'🔁',t:'CI/CD PIPELINE GENERATOR',d:'Separate frontend + backend pipelines. Trivy scans, auto-rollback, DB migration before deploy. GitHub Actions, GitLab, Jenkins, CodePipeline.',chips:['frontend-deploy.yml','backend-deploy.yml']},
            {icon:'⎈',t:'HELM CHART GENERATOR',d:'18-file Helm chart for EKS/AKS/GKE — values-dev, values-prod, HPA, PDB, RBAC, ExternalSecrets, helmfile. Or plain K8s manifests.',chips:['values-prod.yaml','helmfile.yaml']},
            {icon:'🔧',t:'ANSIBLE PLAYBOOK GENERATOR',d:'Full Ansible roles for 60+ software presets — nginx, PM2, Docker, Redis, PostgreSQL, Certbot, Fail2ban, SSH hardening. Idempotent, multi-distro.',chips:['roles/nginx/','site.yml']},
            {icon:'📊',t:'OBSERVABILITY STACK',d:'Prometheus + Grafana + Loki + Jaeger + OTel Collector. Pre-built dashboards, SLO burn-rate alerts, Helm values for K8s.',chips:['alert_rules.yml','slo-dashboard.json']},
            {icon:'🔐',t:'SECURITY BASELINE',d:'Least-privilege IAM, CIS Benchmark 20-point checklist, SOC2 / PCI-DSS / HIPAA / ISO 27001 control mappings, KMS setup.',chips:['iam-policy.json','cis-checklist.md']},
            {icon:'🔑',t:'SECRETS MANAGEMENT',d:'HashiCorp Vault config, ExternalSecrets CRDs, SealedSecrets for GitOps, DB credential rotation scripts.',chips:['.env.example','vault-policy.hcl']},
            {icon:'📋',t:'SRE RUNBOOK',d:'ASCII architecture diagram, Day-2 ops commands, incident playbook for 7 failure scenarios, monthly cost estimate, DR plan.',chips:['runbook.md','cost-estimate']},
          ].map(f=>(
            <div key={f.t} className="feat">
              <div style={{fontSize:20,marginBottom:10}}>{f.icon}</div>
              <div className="feat-title">{f.t}</div>
              <p style={{fontSize:13,color:M,lineHeight:1.65}}>{f.d}</p>
              <div className="chip-row">{f.chips.map(c=><span key={c} className="chip">{c}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div className="lp-band" id="how-it-works">
        <div className="lp-band-inner">
          <div style={{textAlign:'center'}}>
            <span className="eyebrow">HOW IT WORKS</span>
            <h2 className="lp-h2">Four steps. Zero boilerplate.</h2>
          </div>
          <div className="steps-row">
            {[
              {n:'1',t:'DESCRIBE YOUR APP',d:'Write one sentence. Pick cloud, IaC tool, CI/CD pipeline and compliance profile (SOC2, PCI-DSS, HIPAA).'},
              {n:'2',t:'NAME YOUR RESOURCES',d:'Search 279 services. Type real names — eks-prod, alb-frontend. Names appear in every generated file.'},
              {n:'3',t:'REVIEW & GENERATE',d:'See a live architecture diagram and cost estimate. Click Generate — all 8 sections built in parallel.'},
              {n:'4',t:'DOWNLOAD OR PUSH',d:'ZIP with real folder structure, or push directly to a private GitHub repo in one click.'},
            ].map(s=>(
              <div key={s.n} style={{padding:'0 12px',textAlign:'center'}}>
                <div className="step-n">{s.n}</div>
                <div style={{...mono,fontWeight:700,fontSize:11,color:'#eef2f8',marginBottom:7,letterSpacing:'.04em'}}>{s.t}</div>
                <p style={{fontSize:13,color:M,lineHeight:1.6}}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CODE SHOWCASE */}
      <section className="lp-section">
        <span className="eyebrow">REAL OUTPUT</span>
        <h2 className="lp-h2">Production-grade. Not pseudocode.</h2>
        <p className="lp-lead">Syntactically valid, commented, using your exact resource names throughout every file.</p>
        <div className="showcase">
          <div style={{display:'flex',borderBottom:`1px solid ${B}`,overflowX:'auto'}}>
            {[['tf','🟣 Terraform'],['helm','⎈ Helm values'],['ansible','🔴 Ansible'],['gha','⚙️ GitHub Actions']].map(([id,label])=>(
              <button key={id} className={`stab${activeTab===id?' on':''}`} onClick={()=>setActiveTab(id)}>{label}</button>
            ))}
          </div>
          <pre style={{padding:'20px 22px',...mono,fontSize:11.5,lineHeight:1.75,color:'#7ea3c4',overflowX:'auto',maxHeight:320}}
            dangerouslySetInnerHTML={{__html:CODE[activeTab]}}/>
        </div>
      </section>

      {/* PRICING */}
      <div className="lp-band" id="pricing">
        <div className="lp-band-inner">
          <div style={{textAlign:'center'}}>
            <span className="eyebrow">PRICING</span>
            <h2 className="lp-h2">Simple. Flat. Monthly.</h2>
            <p className="lp-lead" style={{margin:'0 auto'}}>All AI costs included. No API key. Cancel any time.</p>
          </div>
          <div className="price-grid">
            {[
              {tier:'INDIVIDUAL',price:20,note:'per month',featured:false,badge:null,
               feats:[[G,'✓','All 8 output sections'],[G,'✓','279 cloud services'],[G,'✓','AWS + Azure + GCP'],[G,'✓','Download as ZIP'],[G,'✓','GitHub push'],[G,'✓','50 generations/day'],['#2a3f5a','✕','Team features']],
               cta:'SUBSCRIBE →',primary:false},
              {tier:'TEAM',price:49,note:'per month · 5 seats',featured:true,badge:'MOST POPULAR',
               feats:[[G,'✓','Everything in Individual'],[G,'✓','5 team members'],[G,'✓','Shared stack history'],[G,'✓','Stack diff viewer'],[G,'✓','All compliance profiles'],[G,'✓','200 generations/day'],[G,'✓','Priority support']],
               cta:'SUBSCRIBE — $49/MO',primary:true},
              {tier:'AGENCY',price:149,note:'per month · unlimited',featured:false,badge:null,
               feats:[[G,'✓','Everything in Team'],[G,'✓','Unlimited seats'],[G,'✓','White-label branding'],[G,'✓','Custom service catalog'],[G,'✓','Unlimited generations'],[G,'✓','Invoice billing'],[G,'✓','Private Slack channel']],
               cta:'SUBSCRIBE →',primary:false},
            ].map(p=>(
              <div key={p.tier} className={`price-card${p.featured?' price-featured':''}`}>
                {p.badge&&<div className="price-badge">{p.badge}</div>}
                <div style={{...mono,fontSize:10,color:M,letterSpacing:'.15em',marginBottom:10}}>{p.tier}</div>
                <div style={{...display,fontSize:54,lineHeight:1,marginBottom:4}}><span style={{fontSize:24,color:M}}>$</span>{p.price}</div>
                <div style={{fontSize:12,color:M,marginBottom:20}}>{p.note} · AI included</div>
                <hr style={{border:'none',borderTop:`1px solid ${B}`,marginBottom:16}}/>
                {p.feats.map(([col,sym,text])=>(
                  <div key={text} style={{display:'flex',gap:9,fontSize:13,color:M,marginBottom:8}}>
                    <span style={{color:col,flexShrink:0}}>{sym}</span>{text}
                  </div>
                ))}
                <a href={CHECKOUT} style={{
                  display:'block',textAlign:'center',marginTop:20,padding:'11px',borderRadius:6,
                  ...mono,fontWeight:700,fontSize:12,textDecoration:'none',letterSpacing:'.04em',
                  background:p.primary?A:'transparent',color:p.primary?'#000':'#eef2f8',
                  border:p.primary?'none':`1px solid ${B}`,transition:'all .2s'
                }}>{p.cta}</a>
              </div>
            ))}
          </div>
          <p style={{textAlign:'center',...mono,fontSize:11,color:M,marginTop:20}}>30-day money-back guarantee · No API key needed · Cancel any time</p>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <section className="lp-section">
        <span className="eyebrow">EARLY USERS</span>
        <h2 className="lp-h2">What engineers say.</h2>
        <div className="testi-grid">
          {[
            {q:'I spent 3 days on the last EKS cluster. StackForge did the same in 4 minutes and the Terraform was actually better than what I would have written.',init:'MK',bg:'#0ea5e9',name:'Marcus K.',role:'Platform Engineer · Series B startup'},
            {q:'The Ansible roles are legitimately production-ready. Idempotent, multi-distro, systemd handlers. The kind of thing I\'d write after 2 coffees — except it took 90 seconds.',init:'RP',bg:G,name:'Riya P.',role:'DevOps Lead · consulting agency'},
            {q:'I use it for every new client\'s initial stack. Then I spend the time I saved thinking about architecture instead of typing Terraform resource blocks.',init:'TL',bg:'#8b5cf6',name:'Tom L.',role:'Independent DevOps consultant'},
          ].map(t=>(
            <div key={t.init} className="testi">
              <div style={{...display,fontSize:36,color:A,opacity:.5,lineHeight:.6,marginBottom:10}}>"</div>
              <p style={{fontSize:14,color:'#eef2f8',lineHeight:1.75,fontWeight:300,fontStyle:'italic',marginBottom:16}}>{t.q}</p>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',...mono,fontWeight:700,fontSize:12,color:'#000'}}>{t.init}</div>
                <div>
                  <div style={{...mono,fontSize:12,color:'#eef2f8',fontWeight:600}}>{t.name}</div>
                  <div style={{fontSize:11,color:M}}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SEO CONTENT */}
      <div className="lp-band">
        <div className="lp-band-inner">
          <span className="eyebrow">WHY STACKFORGE AI</span>
          <h2 className="lp-h2">The fastest path to<br/>production infrastructure.</h2>
          <div className="seo-grid">
            <div className="seo-col">
              <h3>Terraform module generator for AWS, Azure & GCP</h3>
              <p>StackForge AI generates complete, modular Terraform projects with remote state, DynamoDB locking, and a full module hierarchy for networking, compute, database, storage and IAM — following HashiCorp best practices out of the box.</p>
              <p>Every resource identifier uses the exact names you specify. Type <code style={{color:C,fontSize:12}}>eks-prod</code> and that name appears in every module, output, tag and security group rule.</p>
              <ul>
                <li><strong>AWS Terraform modules</strong> — VPC, EKS, ECS, RDS, Aurora, S3, WAF</li>
                <li><strong>Azure Bicep / ARM templates</strong> — AKS, App Service, PostgreSQL, Key Vault</li>
                <li><strong>GCP Terraform modules</strong> — GKE, Cloud SQL, Cloud Run, Cloud Armor</li>
                <li><strong>Terragrunt multi-environment</strong> — DRY dev/prod live config</li>
                <li><strong>Terraform validate built-in</strong> — validates before every plan</li>
              </ul>
            </div>
            <div className="seo-col">
              <h3>Helm chart generator & Kubernetes YAML generator</h3>
              <p>For EKS, AKS and GKE, StackForge generates an 18-file Helm chart with separate values for dev and prod, HPA, PodDisruptionBudget, RBAC, ExternalSecrets operator integration, and helmfile for multi-release deployments.</p>
              <p>Also generates GitHub Actions and GitLab CI pipelines with Trivy security scanning, auto-rollback on failure, and automatic DB migration steps before every deploy.</p>
              <ul>
                <li><strong>GitHub Actions pipeline generator</strong> — Trivy scans, auto-rollback</li>
                <li><strong>GitLab CI pipeline generator</strong> — manual prod approval stage</li>
                <li><strong>Ansible playbook generator</strong> — 60+ software roles, idempotent</li>
                <li><strong>Prometheus alert rules</strong> — CPU, error rate, p99, SLO burn rate</li>
                <li><strong>CIS Benchmark + SOC2 / PCI-DSS / HIPAA</strong> — compliance-ready</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="lp-section" id="faq">
        <span className="eyebrow">FAQ</span>
        <h2 className="lp-h2">Common questions.</h2>
        <div style={{maxWidth:740,marginTop:48}}>
          {[
            ['Does the generated Terraform actually work?','Yes. Every IaC output includes a Makefile that runs terraform validate and terraform fmt -check before any plan. Ready to terraform init && make plan after filling in your provider credentials.'],
            ['Do I need an Anthropic API key?','No. Your $20/month subscription covers all AI generation costs. We use our own API key on the server — you never see or manage one. Just log in and generate.'],
            ['What happens after I subscribe?','Create an account at stackforge-app.vercel.app using the same email you used at checkout. Your subscription activates automatically within 30 seconds via webhook.'],
            ['Which clouds and IaC tools are supported?','Clouds: AWS, Azure, GCP. IaC: Terraform, Terragrunt, CloudFormation, Bicep, ARM, Pulumi. Deploy targets: ECS, EKS + Helm, Azure Container Apps, AKS + Helm, Cloud Run, GKE + Helm.'],
            ['Can I cancel any time?','Yes. Cancel from your Lemon Squeezy customer portal. Access continues until the end of the billing period. 30-day money-back guarantee on first payment — no questions asked.'],
          ].map(([q,a],i)=>(
            <div key={i} className={`faq-item${openFaq===i?' faq-open':''}`}>
              <button className="faq-q" onClick={()=>setOpenFaq(openFaq===i?null:i)}>
                {q}
                <span style={{color:A,fontSize:18,transition:'transform .2s',transform:openFaq===i?'rotate(45deg)':'none',display:'inline-block'}}>+</span>
              </button>
              <div className="faq-a">{a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <div style={{position:'relative',zIndex:1,padding:'110px 6vw',textAlign:'center',borderTop:`1px solid ${B}`,overflow:'hidden'}}>
        <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:600,height:300,background:'radial-gradient(ellipse,rgba(240,165,0,.09) 0%,transparent 68%)',pointerEvents:'none'}}/>
        <span className="eyebrow">GET STARTED TODAY</span>
        <h2 style={{...display,fontSize:'clamp(42px,7vw,86px)',letterSpacing:'-.01em',lineHeight:.95,marginBottom:16}}>
          Your next stack<br/><span style={{color:A}}>starts here.</span>
        </h2>
        <p style={{fontSize:17,color:M,marginBottom:32,fontWeight:300}}>Stop writing boilerplate. Start shipping infrastructure.</p>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center',marginBottom:14}}>
          <a href={CHECKOUT} className="lp-btn lp-btn-amber">⚡ SUBSCRIBE — $20/MONTH</a>
          <button onClick={onSignIn} className="lp-btn lp-btn-outline">ALREADY SUBSCRIBED? SIGN IN →</button>
        </div>
        <p style={{...mono,fontSize:11,color:M}}>30-day money-back · No API key · Cancel any time</p>
      </div>

      {/* FOOTER */}
      <footer style={{borderTop:`1px solid ${B}`,padding:'22px 6vw',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
        <span style={{...mono,fontSize:11,color:M}}>© 2025 StackForge AI — AI-powered DevOps stack generator</span>
        <div style={{display:'flex',gap:22,flexWrap:'wrap'}}>
          {[['#features','Features'],['#pricing','Pricing'],['#faq','FAQ'],['mailto:sauvikpaul593@gmail.com','Support']].map(([href,label])=>(
            <a key={label} href={href} style={{...mono,fontSize:11,color:M,textDecoration:'none'}}>{label}</a>
          ))}
          <button onClick={onSignIn} style={{...mono,fontSize:11,color:M,background:'none',border:'none',cursor:'pointer'}}>Sign In</button>
        </div>
      </footer>

      </div>
    </div>
  )
}
