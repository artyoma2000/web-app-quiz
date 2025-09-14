import React, {useState} from 'react'
import axios from 'axios'
import { t } from './i18n'

export default function AdminLogin({onLogin, defaultLang}){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  function handleLogin(){
    const lang = defaultLang || localStorage.getItem('default_language') || 'en'
    if(!username) { setStatus(t('enter_username', lang)); return }
    if(!password) { setStatus(t('enter_password', lang)); return }
    // attempt to authenticate against backend by calling a protected admin endpoint
    axios.get('/api/admin/game', { auth: { username, password } }).then(()=>{
      localStorage.setItem('is_admin','1')
      localStorage.setItem('admin_username', username)
      localStorage.setItem('admin_password', password)
      // set axios default auth so Admin component requests authenticate automatically
      axios.defaults.auth = { username, password }
      setStatus(t('login_successful', lang))
      if(onLogin) onLogin()
    }).catch(()=>{
      setStatus(t('invalid_username_or_password', lang))
    })
  }

  const lang = defaultLang || localStorage.getItem('default_language') || 'en'

  return (
    <div className="panel" style={{maxWidth:520}}>
      <h2>{t('admin_login', lang)}</h2>
      <div className="onboard">
        <input placeholder={t('username', lang)} value={username} onChange={e=>setUsername(e.target.value)} />
        <input placeholder={t('password', lang)} type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="btn" onClick={handleLogin}>{t('login', lang)}</button>
      </div>
      {status && <div style={{marginTop:8}} className="msg">{status}</div>}
      <div style={{marginTop:18,color:'var(--muted)'}}>{t('for_demo_use', lang)}</div>
    </div>
  )
}
