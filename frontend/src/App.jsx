
import React, {useState, useEffect} from 'react'
import axios from 'axios'
import Participant from './Participant'
import Admin from './Admin'
import AdminLogin from './AdminLogin'
import { t } from './i18n'

// no default baseURL; frontend will call '/api/*' which the Vite proxy forwards to backend

// Import the image from src/assets so the bundler includes the exact file you provide.
// Please copy your PNG into `frontend/src/assets/hohlovision-logo-main.png`.
import logoImage from './assets/hohlovision-logo-main.png'

function TopNav({selectedRole, defaultLang}){
  // Use the bundler-imported image (guarantees correct content-type and path)
  const pngPath = logoImage
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='48'><rect fill='%230f1720' width='100%25' height='100%25'/><text x='8' y='34' font-family='Inter,Segoe UI,Roboto,Arial' font-size='24' fill='%2300ffff'>Hohlovision</text></svg>`
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <img src={pngPath} onError={(e)=>{ /* fallback to inline svg only if PNG fails */ e.target.onerror=null; e.target.src = dataUrl }} className="app-logo" alt="Hohlovision" style={{background:'transparent'}} />
        <div style={{display:'none'}}>{/* keep title in DOM for screen readers */}
          <h1 style={{margin:0}}>{t('birthday_quiz', defaultLang)}</h1>
        </div>
      </div>
      <div>
        {selectedRole ? <div style={{color:'var(--muted)'}}>{t('role_label', defaultLang)} <strong>{t(selectedRole === 'admin' ? 'role_admin' : 'role_participant', defaultLang)}</strong></div> : null}
      </div>
    </div>
  )
}

export default function App(){
  const [role, setRole] = useState(localStorage.getItem('role') || '')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [isAdmin, setIsAdmin] = useState(!!localStorage.getItem('is_admin'))
  const [showRoleSelector, setShowRoleSelector] = useState(!localStorage.getItem('role'))
  const [defaultLang, setDefaultLang] = useState(localStorage.getItem('default_language') || 'en')
  useEffect(()=>{
  axios.get('/api/settings/language').then(r=>{
      const lang = r.data.default_language || 'en'
      try{ localStorage.setItem('default_language', lang) }catch(e){}
      setDefaultLang(lang)
    }).catch(()=>{})

    const onLang = (e) => {
      const newLang = (e && e.detail) || localStorage.getItem('default_language') || 'en'
      setDefaultLang(newLang)
    }
    window.addEventListener('language-changed', onLang)
    return ()=> window.removeEventListener('language-changed', onLang)
  }, [])

  // set the favicon at runtime using the imported bundler-managed image
  useEffect(()=>{
    try{
      let link = document.querySelector("link[rel*='icon']")
      if(!link){ link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = logoImage
    }catch(e){ /* ignore */ }
  }, [logoImage])

  function choose(r){
    localStorage.setItem('role', r)
    setRole(r)
  setShowRoleSelector(false)
  }

  function handleAdminLoginSuccess(){
    // called after AdminLogin validates credentials
    localStorage.setItem('role', 'admin');
    setRole('admin');
  setIsAdmin(true)
  setShowAdminLogin(false)
  }

  return (
    <div className="app dark">
      <div style={{flex:1}}>
  <TopNav selectedRole={role} defaultLang={defaultLang} />

        {role === 'participant' && (
              <Participant defaultLang={defaultLang} onLogout={()=>{ localStorage.removeItem('role'); setRole(''); setShowRoleSelector(true); }} />
            )}
            {role === 'admin' && isAdmin && (
              <Admin onLogout={()=>{
                localStorage.removeItem('role');
                localStorage.removeItem('is_admin');
                setRole('');
                setIsAdmin(false)
                setShowRoleSelector(true);
              }} defaultLang={defaultLang} />
            )}
  {/* Role selection modal (shows when no role or explicitly shown) */}
        {showRoleSelector && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{background:'#0f1720',padding:28,borderRadius:12,minWidth:360,maxWidth:'90%'}}>
              <h2 style={{marginTop:0}}>{t('choose_your_role', defaultLang)}</h2>
              <p style={{color:'var(--muted)'}}>{t('select_role_description', defaultLang)}</p>
              <div style={{display:'flex',gap:12,marginTop:12}}>
                <button className="btn" onClick={()=>{ choose('participant') }}>{t('im_participant', defaultLang)}</button>
                <button className="btn ghost" onClick={()=>{ choose('admin') }}>{t('im_admin', defaultLang)}</button>
              </div>
            </div>
          </div>
  )}
        {/* Admin login view (inline like participant) */}
        {role === 'admin' && !isAdmin && (
          <div style={{maxWidth:520}}>
            <AdminLogin onLogin={handleAdminLoginSuccess} />
          </div>
        )}
      </div>
    </div>
  )
}
