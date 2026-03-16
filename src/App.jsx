import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import AuthPage from './AuthPage.jsx'
import LandingPage from './LandingPage.jsx'
import StackForge from './StackForge.jsx'

export default function App() {
  const [session, setSession]       = useState(null)
  const [sub, setSub]               = useState(null)  // subscription row
  const [loading, setLoading]       = useState(true)
  const [subLoading, setSubLoading] = useState(false)

  // ── Listen for auth changes ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchSub(session)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchSub(session)
      else { setSub(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch subscription status from Supabase ──────────────────────────────
  const fetchSub = async (session) => {
    setSubLoading(true)
    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end, email, api_calls_today, api_calls_reset_at')
      .eq('user_id', session.user.id)
      .single()
    setSub(data)
    setLoading(false)
    setSubLoading(false)
  }

  // ── Sign out ─────────────────────────────────────────────────────────────
  const signOut = async () => {
    await supabase.auth.signOut()
    setSub(null)
  }

  // ── Loading splash ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:'100vh',background:'#050b14',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',color:'#F59E0B',fontSize:13,letterSpacing:2}}>
      LOADING…
    </div>
  )

  // ── Not logged in ────────────────────────────────────────────────────────
  if (!session) return showAuth ? <AuthPage /> : <LandingPage onSignIn={() => setShowAuth(true)} />

  // ── Logged in but no active subscription ────────────────────────────────
  const isActive = sub?.status === 'active'

  if (!isActive) return (
    <div style={{minHeight:'100vh',background:'#050b14',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20,fontFamily:'monospace',padding:24}}>
      <div style={{fontSize:32}}>⚡</div>
      <div style={{color:'#F59E0B',fontSize:16,fontWeight:700,letterSpacing:2}}>STACKFORGE AI</div>
      <div style={{color:'#64748B',fontSize:13,textAlign:'center',maxWidth:400,lineHeight:1.7}}>
        {subLoading
          ? 'Checking subscription…'
          : sub
            ? `Your subscription is ${sub.status}. Reactivate to continue.`
            : 'Subscribe to access StackForge AI.'}
      </div>
      <div style={{color:'#1e3a5f',fontSize:11,fontFamily:'monospace',marginBottom:8,textAlign:'center',lineHeight:1.7}}>
        Includes: AI generation credits · All 8 output sections · ZIP download · GitHub push
      </div>
      <a href={import.meta.env.VITE_LS_CHECKOUT_URL + '?checkout[email]=' + encodeURIComponent(session.user.email)}
        style={{background:'#F59E0B',color:'#000',padding:'12px 28px',borderRadius:8,fontWeight:700,fontSize:13,textDecoration:'none',letterSpacing:'.04em'}}>
        ⚡ SUBSCRIBE — $20/MONTH
      </a>
      <button onClick={signOut} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:12}}>
        Sign out ({session.user.email})
      </button>
      <div style={{color:'#334155',fontSize:11,marginTop:8}}>
        Just subscribed? Wait 30 seconds then{' '}
        <span style={{color:'#38bdf8',cursor:'pointer'}} onClick={() => fetchSub(session)}>
          click here to refresh
        </span>
      </div>
    </div>
  )

  // ── Logged in + active subscription → show StackForge ──────────────────
  return (
    <div>
      {/* Slim top bar showing account + usage status */}
      <div style={{
        background:'#050b14', borderBottom:'1px solid #1a2d4a',
        padding:'6px 16px', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:16, fontFamily:'monospace', fontSize:11,
        flexWrap:'wrap'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <span style={{fontWeight:700,color:'#F59E0B',letterSpacing:2}}>⚡ STACKFORGE AI</span>
          <span style={{color:'#10B981',fontSize:10}}>● ACTIVE</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          {sub?.api_calls_today !== undefined && (
            <span style={{color:'#334155',fontSize:10}}>
              <span style={{color:'#38bdf8'}}>{sub.api_calls_today || 0}</span>
              <span style={{color:'#1e3a5f'}}>/50</span>
              <span style={{color:'#334155'}}> generations today</span>
            </span>
          )}
          <span style={{color:'#334155'}}>{session.user.email}</span>
          <button onClick={signOut} style={{background:'none',border:'1px solid #1a2d4a',color:'#475569',cursor:'pointer',borderRadius:4,padding:'2px 8px',fontSize:10}}>
            Sign out
          </button>
        </div>
      </div>
      <StackForge />
    </div>
  )
}
