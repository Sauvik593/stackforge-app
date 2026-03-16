import { useState } from 'react'
import { supabase } from './supabase.js'

const S = {
  page: {minHeight:'100vh',background:'#050b14',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',padding:20},
  card: {background:'#080f1c',border:'1px solid #1a2d4a',borderRadius:14,padding:36,width:'100%',maxWidth:400},
  logo: {textAlign:'center',marginBottom:28},
  logoIcon: {width:44,height:44,background:'linear-gradient(135deg,#F59E0B,#E07B00)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,margin:'0 auto 10px'},
  logoText: {fontFamily:"'Helvetica Neue',sans-serif",fontWeight:800,fontSize:22,letterSpacing:3,color:'#E2E8F0'},
  logoSub: {fontSize:10,color:'#475569',letterSpacing:3,marginTop:3},
  tabs: {display:'flex',background:'#050b14',borderRadius:8,padding:3,marginBottom:24,border:'1px solid #1a2d4a'},
  tab: (active) => ({flex:1,padding:'7px 0',textAlign:'center',borderRadius:6,fontSize:11,fontWeight:700,letterSpacing:'.08em',cursor:'pointer',border:'none',background:active?'#1a2d4a':'transparent',color:active?'#F59E0B':'#475569',transition:'all .15s'}),
  label: {display:'block',fontSize:10,color:'#475569',letterSpacing:'.1em',marginBottom:5},
  input: {width:'100%',background:'#050b14',border:'1px solid #1a2d4a',color:'#E2E8F0',borderRadius:7,padding:'10px 12px',fontSize:13,outline:'none',fontFamily:'monospace',boxSizing:'border-box',marginBottom:14},
  btn: {width:'100%',background:'#F59E0B',border:'none',color:'#000',padding:'12px',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer',letterSpacing:'.04em',fontFamily:'monospace'},
  err: {background:'#2d0f0f',border:'1px solid #EF4444',borderRadius:7,padding:'9px 12px',color:'#EF4444',fontSize:12,marginBottom:14,textAlign:'center'},
  ok:  {background:'#0f2a1a',border:'1px solid #10B981',borderRadius:7,padding:'9px 12px',color:'#10B981',fontSize:12,marginBottom:14,textAlign:'center'},
  footer: {textAlign:'center',marginTop:20,fontSize:11,color:'#334155'},
  link: {color:'#F59E0B',textDecoration:'none'},
}

export default function AuthPage() {
  const [mode, setMode]     = useState('login')  // login | signup | reset
  const [email, setEmail]   = useState('')
  const [pass,  setPass]    = useState('')
  const [busy,  setBusy]    = useState(false)
  const [err,   setErr]     = useState('')
  const [ok,    setOk]      = useState('')

  const handle = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(''); setOk('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (error) setErr(error.message)

    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password: pass,
        options: { emailRedirectTo: window.location.origin }
      })
      if (error) setErr(error.message)
      else setOk('Check your email to confirm your account, then come back to sign in.')

    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '?reset=1'
      })
      if (error) setErr(error.message)
      else setOk('Password reset link sent — check your email.')
    }
    setBusy(false)
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.logoIcon}>⚡</div>
          <div style={S.logoText}>STACKFORGE <span style={{color:'#F59E0B'}}>AI</span></div>
          <div style={S.logoSub}>DEVOPS STACK GENERATOR</div>
        </div>

        {mode !== 'reset' && (
          <div style={S.tabs}>
            <button style={S.tab(mode==='login')}  onClick={()=>{setMode('login');setErr('');setOk('')}}>SIGN IN</button>
            <button style={S.tab(mode==='signup')} onClick={()=>{setMode('signup');setErr('');setOk('')}}>CREATE ACCOUNT</button>
          </div>
        )}

        {err && <div style={S.err}>{err}</div>}
        {ok  && <div style={S.ok}>{ok}</div>}

        {!ok && (
          <form onSubmit={handle}>
            <label style={S.label}>EMAIL</label>
            <input style={S.input} type="email" value={email}
              onChange={e=>setEmail(e.target.value)} required placeholder="you@company.com"/>

            {mode !== 'reset' && <>
              <label style={S.label}>PASSWORD</label>
              <input style={S.input} type="password" value={pass}
                onChange={e=>setPass(e.target.value)} required
                placeholder={mode==='signup'?'min. 8 characters':'your password'}
                minLength={mode==='signup'?8:1}/>
            </>}

            <button style={S.btn} disabled={busy}>
              {busy ? '…' : mode==='login' ? 'SIGN IN →' : mode==='signup' ? 'CREATE ACCOUNT →' : 'SEND RESET LINK →'}
            </button>
          </form>
        )}

        <div style={S.footer}>
          {mode === 'login' && <>
            <span style={{cursor:'pointer',color:'#475569'}} onClick={()=>{setMode('reset');setErr('');setOk('')}}>Forgot password?</span>
            {' · '}
            <a href={import.meta.env.VITE_LS_CHECKOUT_URL} style={S.link} target="_blank" rel="noopener">
              Subscribe — $20/mo
            </a>
          </>}
          {mode === 'signup' && <span>Already have an account? <span style={{color:'#F59E0B',cursor:'pointer'}} onClick={()=>setMode('login')}>Sign in</span></span>}
          {mode === 'reset' && <span style={{color:'#F59E0B',cursor:'pointer'}} onClick={()=>setMode('login')}>← Back to sign in</span>}
        </div>
      </div>
    </div>
  )
}
