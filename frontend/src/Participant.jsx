import React, {useState, useEffect, useRef} from 'react'
import axios from 'axios'
import Scanner from './Scanner'
import Quest from './Quest'
import { t } from './i18n'

function TaskUploader({question, sessionId, onDone, lang}){
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    if(!file){ setPreview(null); return }
    const reader = new FileReader()
    reader.onload = e=> setPreview(e.target.result)
    reader.readAsDataURL(file)
    return ()=> reader.abort && reader.abort()
  }, [file])

  async function submit(){
    if(!file) return alert(t('select_file', lang))
    setLoading(true)
    try{
      const fd = new FormData()
      fd.append('file', file)
      fd.append('question_id', question.id)
      fd.append('session_id', sessionId)
      const res = await axios.post('/api/tasks/submit', fd, { headers: {'Content-Type':'multipart/form-data'} })
    onDone && onDone(t('submitted', lang))
    }catch(err){
  onDone && onDone(t('upload_failed', lang))
    }finally{ setLoading(false) }
  }

  return (
    <div style={{marginTop:12}}>
      <div style={{border:'2px dashed #1f3a57',padding:16,borderRadius:8,display:'flex',flexDirection:'column',alignItems:'center',gap:12,background:'linear-gradient(180deg, rgba(6,18,29,0.6), rgba(8,18,36,0.4))'}} onDragOver={e=>e.preventDefault()} onDrop={e=>{ e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) setFile(f) }}>
        {preview ? <img src={preview} alt="preview" style={{maxWidth:'100%',maxHeight:240,borderRadius:8}} /> : (
          <div style={{textAlign:'center',color:'#b7d0ea'}}>
            <div style={{fontSize:20,fontWeight:700}}>{t('drop_photo', lang)}</div>
            <div style={{marginTop:6,color:'#9fb2c9'}}>{t('or_click', lang)}</div>
          </div>
        )}
        <input type="file" accept="image/*" style={{display:'none'}} id="task-file-input" onChange={e=>setFile(e.target.files[0]||null)} />
        <div style={{display:'flex',gap:8}}>
          <label htmlFor="task-file-input" className="btn" style={{background:'#0a3a5a'}}>{t('choose_file', lang)}</label>
          <button className="btn" onClick={submit} disabled={loading}>{loading ? t('uploading', lang) : t('submit', lang)}</button>
        </div>
      </div>
    </div>
  )
}

export default function Participant({onLogout, defaultLang}){
  const [username, setUsername] = useState(localStorage.getItem('telegram_username') || '')
  const [password, setPassword] = useState(localStorage.getItem('participant_password') || '')
  const [sessionId, setSessionId] = useState(localStorage.getItem('session_id') || '')
  const [status, setStatus] = useState('')
  const [mode, setMode] = useState(localStorage.getItem('session_id') ? 'tabs' : 'register')
  const [tab, setTab] = useState('scanner')
  const [boxes, setBoxes] = useState([])
  const [showBoxHintModal, setShowBoxHintModal] = useState(false)
  const [currentBoxHint, setCurrentBoxHint] = useState(null)
  const [scanned, setScanned] = useState(null)
  const [scannerActive, setScannerActive] = useState(true)
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanPayload, setScanPayload] = useState('')
  const [inlineQuestion, setInlineQuestion] = useState(null)
  const [inlineTime, setInlineTime] = useState(null)
  const [inlineLoading, setInlineLoading] = useState(false)
  const [inlineMessage, setInlineMessage] = useState('')
  const [timerLeft, setTimerLeft] = useState(0)
  const timerRef = useRef(null)
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(()=>{
    if(mode === 'tabs') fetchLeaderboard()
  }, [mode])

  function saveSession(){
  if(!username) { setStatus(t('enter_username', lang)); return }
  if(!password) { setStatus(t('enter_password', lang)); return }
    const sid = sessionId || Math.random().toString(36).slice(2)
    setSessionId(sid)
    // register participant (requires admin-created account). Persist local data only on success.
    axios.post('/api/participant/register', {username, password, session_id: sid}).then(()=>{
      // persist local session only after successful server-side login
      localStorage.setItem('session_id', sid)
      localStorage.setItem('telegram_username', username)
      localStorage.setItem('participant_password', password)
  setStatus(t('registered_as', lang) + ' ' + username)
      setMode('tabs')
    }).catch(err=>{
      // If account does not exist (admin must create it), show a clearer message
      if(err?.response?.status === 403){
        setStatus(t('account_not_found', lang))
      } else if(err?.response?.status === 401){
        setStatus(t('invalid_username_or_password', lang))
      } else {
  setStatus(err?.response?.data?.detail || t('registration_failed', defaultLang))
      }
    })
  }

  function onScan(data){
  // show the decoded payload in a modal first
  const payload = (data || '').toString()
  setScanPayload(payload)
  // disable scanner while modal/question is shown; Scanner will stop after decode
  setScannerActive(false)
  setShowScanModal(true)
  // store last scanned raw value if needed
  setScanned(payload)
  }

  async function openAsLink(){
  setShowScanModal(false)
    try{
      const url = new URL(scanPayload, window.location.origin)
      window.open(url.href, '_blank')
    }catch(e){
      const code = parseInt(scanPayload)
      if(!isNaN(code)) window.location.href = `/scan?code=${code}`
    }
  // re-enable scanner after small delay to allow camera to be freed
  setTimeout(()=>setScannerActive(true), 300)
  }

  async function fetchInline(){
    setInlineLoading(true)
    setInlineQuestion(null)
    try{
      const code = parseInt(scanPayload)
      const payload = isNaN(code) ? { session_id: sessionId, code: scanPayload } : { session_id: sessionId, code }
      const res = await axios.post('/api/scan', payload)
      if(res.data && res.data.question){
        setInlineQuestion(res.data.question)
        // honor server-provided time for both questions and tasks (admin-configured)
        const serverTime = typeof res.data.time_limit_seconds === 'number' ? res.data.time_limit_seconds : null
        setInlineTime(serverTime)
      }else{
        setInlineQuestion({ question_text: res.data.message || 'No question available', options: [] })
        setInlineTime(typeof res.data.time_limit_seconds === 'number' ? res.data.time_limit_seconds : null)
      }
    }catch(err){
  setInlineQuestion({ question_text: err?.response?.data?.detail || t('error_fetching', defaultLang), options: [] })
    }finally{
      setInlineLoading(false)
    }
  }

  // automatically fetch inline if the payload is the special 'random' keyword
  useEffect(()=>{
    if(!showScanModal) return
    try{
      const p = (scanPayload||'').toString().trim()
      if(!p) return
      const lower = p.toLowerCase()
      // auto-fetch for explicit 'random'
      if(lower === 'random'){
        if(!inlineLoading && !inlineQuestion) fetchInline()
        return
      }
      // skip obvious urls
      if(p.includes('://') || p.startsWith('http')) return
      // if payload is a short alphanumeric/underscore/hyphen word and not purely numeric, auto-fetch
      if(/^[A-Za-z0-9_-]{1,64}$/.test(p) && isNaN(parseInt(p))){
        if(!inlineLoading && !inlineQuestion) fetchInline()
      }
    }catch(e){/* ignore */}
  }, [showScanModal, scanPayload])

  // helper to format seconds as MM:SS or SS
  function formatTime(s){
    if(!s && s !== 0) return ''
    const mins = Math.floor(s/60)
    const secs = s % 60
    if(mins > 0) return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
    return `${secs}s`
  }

  // close modal and clear timers
  function closeModal(){
    setInlineQuestion(null)
    setShowScanModal(false)
    setInlineMessage('')
    setTimerLeft(0)
    if(timerRef.current){ clearInterval(timerRef.current); timerRef.current = null }
  }

  // start countdown when an inline question appears; 10s for question, 300s for task
  useEffect(()=>{
    // clear existing timer
    if(timerRef.current){ clearInterval(timerRef.current); timerRef.current = null }
    if(!inlineQuestion || !showScanModal){ setTimerLeft(0); return }
  const DEFAULT_TASK_SECONDS = 300
  const DEFAULT_QUESTION_SECONDS = 10
  const defaultSeconds = inlineQuestion.is_task ? DEFAULT_TASK_SECONDS : DEFAULT_QUESTION_SECONDS
  // prefer server-provided inlineTime if it is a positive number, otherwise use defaults
  const start = (typeof inlineTime === 'number' && inlineTime > 0) ? inlineTime : defaultSeconds
    setTimerLeft(start)
    timerRef.current = setInterval(()=>{
      setTimerLeft(s => {
        if(s <= 1){
          // time's up: close modal
          if(timerRef.current){ clearInterval(timerRef.current); timerRef.current = null }
          // delay slightly to allow UI update
          setTimeout(()=>{ closeModal() }, 100)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return ()=>{ if(timerRef.current){ clearInterval(timerRef.current); timerRef.current = null } }
  }, [inlineQuestion, showScanModal, inlineTime])

  // when scanner tab selected, enable scanner by default
  useEffect(()=>{
    if(tab === 'scanner') setScannerActive(true)
  }, [tab])

  function fetchLeaderboard(){
    axios.get('/api/leaderboard').then(r=>setLeaderboard(r.data)).catch(()=>setLeaderboard([]))
  }

  function logout(){
    localStorage.removeItem('session_id')
    localStorage.removeItem('telegram_username')
    localStorage.removeItem('participant_password')
    setUsername('')
    setPassword('')
    setSessionId('')
    setMode('register')
  try{ if(onLogout) onLogout() }catch(e){}
  }

  if(mode==='quest'){
    const qid = scanned?.split('/').pop() || new URLSearchParams(window.location.search).get('id')
    return <Quest questId={qid} />
  }

  const lang = defaultLang || localStorage.getItem('default_language') || 'en'

  if(mode === 'register'){
    return (
      <div className="panel" style={{maxWidth:520}}>
        <h2>{t('login', lang)}</h2>
        <div className="onboard">
          <input placeholder={t('username', lang)} value={username} onChange={e=>setUsername(e.target.value)} />
          <input placeholder={t('password', lang)} type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button className="btn" onClick={saveSession}>{t('login', lang)}</button>
        </div>
        {status && <div style={{marginTop:8}} className="msg">{status}</div>}
        <div style={{marginTop:18,color:'var(--muted)'}}>{t('lightweight_registration_note', lang)}</div>
      </div>
    )
  }

  // tabs view
  return (
    <div className="dashboard">
      <div className="left panel">
        <div className="tabs">
          <button className={"tab btn "+(tab==='scanner'?'active':'')} onClick={()=>setTab('scanner')}>{t('scanner', lang)}</button>
          <button className={"tab btn "+(tab==='table'?'active':'')} onClick={()=>setTab('table')}>{t('table', lang)}</button>
          <button className={"tab btn "+(tab==='boxes'?'active':'')} onClick={()=>{ setTab('boxes'); axios.get('/api/boxes').then(r=>setBoxes(r.data||[])).catch(()=>setBoxes([])) }}>{t('boxes', lang)}</button>
          <button className={"tab btn "+(tab==='profile'?'active':'')} onClick={()=>setTab('profile')}>{t('profile', lang)}</button>
        </div>

        <div className="tab-content">
          {tab === 'scanner' && (
            <div>
              <h3>{t('scan_qr_open_quest', lang)}</h3>
              <div style={{marginBottom:8,display:'flex',gap:8,alignItems:'center'}}>
                <button className="btn small" onClick={()=>setScannerActive(s=>!s)}>{scannerActive ? t('turn_scanner_off', lang) : t('turn_scanner_on', lang)}</button>
                <button className="btn small ghost" onClick={()=>{ setScannerActive(false); setTimeout(()=>setScannerActive(true), 300) }}>{t('restart', lang)}</button>
                <div style={{marginLeft:8,fontSize:12,color: scannerActive ? 'green' : 'var(--muted)'}}>{scannerActive ? t('scanner_status_on', lang) : t('scanner_status_off', lang)}</div>
              </div>
              <Scanner onScan={onScan} active={scannerActive} />
            </div>
          )}

          {tab === 'table' && (
            <div>
              <h3>{t('leaderboard_results', lang)}</h3>
              <table className="results">
                <thead><tr><th>{t('rank', lang)}</th><th>{t('participant_label', lang)}</th><th>{t('correct_label', lang)}</th></tr></thead>
                <tbody>
                  {leaderboard.map((r,i)=>(
                    <tr key={r.telegram_username} className={r.telegram_username === username ? 'highlight' : ''}>
                      <td>{i+1}</td>
                      <td>{r.telegram_username}</td>
                      <td>{r.correct_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{marginTop:10}}><button className="btn small" onClick={fetchLeaderboard}>{t('refresh', lang)}</button></div>
            </div>
          )}

          {tab === 'profile' && (
            <div>
              <h3>{t('profile', lang)}</h3>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{t('logged_in_as', lang)}</div>
                  <div style={{fontWeight:700}}>{username}</div>
                </div>
                <div>
                  <button className="btn ghost" onClick={logout}>{t('logout', lang)}</button>
                </div>
              </div>

              <div style={{marginTop:18}}>
                <h4>{t('quick_stats', lang)}</h4>
                <div style={{color:'var(--muted)'}}>{t('your_session_id', lang)}</div>
                <div style={{wordBreak:'break-all',fontSize:12}}>{sessionId}</div>
              </div>

              {/* Top players removed per request */}
            </div>
          )}
          {tab === 'boxes' && (
            <div>
              <h3>{t('boxes', lang)}</h3>
              <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
                {boxes && boxes.length>0 ? boxes.map(b => (
                  <div key={b.box_index} style={{width:140,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                    <div style={{width:120,height:120,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}} onClick={()=>{ const hint = b.hint_url || (b.hint_filename ? `/uploads/${b.hint_filename}` : null); setCurrentBoxHint(hint); setShowBoxHintModal(true) }}>
                      <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <span role="img" aria-label="box-emoji" style={{fontSize:'4rem',lineHeight:1,fontFamily:'"Noto Color Emoji", "Segoe UI Emoji", "Apple Color Emoji", sans-serif'}}>
                          📦
                        </span>
                      </div>
                    </div>
                    <div style={{fontSize:12,color:'#94a3b8'}}>#{b.box_index}</div>
                  </div>
                )) : (
                  <div style={{color:'#94a3b8'}}>{t('boxes_no_configured', lang)}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

  {/* right panel moved into Profile tab */}

      {showScanModal && (
        <div className="modal-backdrop" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {/* If we have an inlineQuestion, show a minimal dark modal with only question and options */}
          {inlineQuestion ? (
            // if this is a task question, show a file upload UI
            inlineQuestion.is_task ? (
              <div style={{background:'#071124',padding:18,borderRadius:8,width:'92%',maxWidth:520,color:'#fff'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{fontSize:16,fontWeight:700}}>{t('task', lang)}</div>
                    {timerLeft > 0 && <div style={{fontSize:12,color:'#9fb2c9'}}>{t('time_left', lang)}: {formatTime(timerLeft)}</div>}
                    {timerLeft === 0 && <div style={{fontSize:12,color:'#ff7b7b'}}>{t('time_expired', lang)}</div>}
                  </div>
                  <button className="btn ghost" onClick={closeModal} style={{background:'transparent',color:'#fff',border:'none'}}>{t('close', defaultLang)}</button>
                </div>
                <div style={{marginTop:12,fontSize:18,lineHeight:1.3,color:'#fff'}}>{inlineQuestion.question_text}</div>
                {timerLeft > 0 ? (
                  <TaskUploader question={inlineQuestion} sessionId={sessionId} onDone={(msg)=>{ setInlineMessage(msg); setTimeout(()=>{ closeModal() }, 1200) }} />
                ) : (
                  <div style={{marginTop:12,color:'#ff7b7b'}}>{t('task_time_up', lang)}</div>
                )}
                {inlineMessage && <div style={{marginTop:12,color:'#fff',fontWeight:600}}>{inlineMessage}</div>}
              </div>
            ) : (
              <div style={{background:'#071124',padding:18,borderRadius:8,width:'92%',maxWidth:520,color:'#fff'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}>
                    <div style={{fontSize:16,fontWeight:700}}>{t('question', lang)}</div>
                    {timerLeft > 0 && <div style={{fontSize:12,color:'#9fb2c9'}}>{t('time_left', lang)}: {formatTime(timerLeft)}</div>}
                    {timerLeft === 0 && <div style={{fontSize:12,color:'#ff7b7b'}}>{t('time_expired', lang)}</div>}
                  </div>
                  <button className="btn ghost" onClick={closeModal} style={{background:'transparent',color:'#fff',border:'none'}}>{t('close', defaultLang)}</button>
                </div>
                <div style={{marginTop:12,fontSize:18,lineHeight:1.3,color:'#fff'}}>{inlineQuestion.question_text}</div>
                <div style={{marginTop:12,display:'grid',gap:10}}>
                  {inlineQuestion.options.map((o,i)=>(
                    <button key={i} onClick={async ()=>{
                      if(timerLeft === 0) return setInlineMessage(t('time_expired', lang))
                      try{
                        setInlineMessage('')
                        const sid = sessionId || (new URLSearchParams(window.location.search)).get('session_id') || ''
                        const res = await axios.post('/api/answer', { session_id: sid, question_id: inlineQuestion.id, answer: o })
                        setInlineMessage(res.data.is_correct ? t('correct', lang) : t('incorrect', lang))
                        // close modal after short delay
                        setTimeout(()=>{ closeModal() }, 1200)
                      }catch(err){ setInlineMessage(t('error_submitting', defaultLang)) }
                    }} className="option" style={{background:'#0b2540',color:'#fff',border:'1px solid rgba(255,255,255,0.08)',padding:12,borderRadius:8,textAlign:'left'}}>{o}</button>
                  ))}
                </div>
                {inlineMessage && <div style={{marginTop:12,color:'#fff',fontWeight:600}}>{inlineMessage}</div>}
              </div>
            )
          ) : (
            <div className="modal" style={{background:'#fff',padding:16,borderRadius:8,width:'90%',maxWidth:600}}>
              <h3>{t('scanned_payload', lang)}</h3>
              <pre style={{whiteSpace:'pre-wrap',background:'#f7f7f7',padding:8,borderRadius:4}}>{scanPayload}</pre>
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button className="btn" onClick={openAsLink}>{t('open', lang)}</button>
                <button className="btn" onClick={fetchInline} disabled={inlineLoading}>{inlineLoading ? t('loading', lang) : t('fetch_question_inline', lang)}</button>
                <button className="btn ghost" onClick={()=>{ setShowScanModal(false); setInlineQuestion(null) }}>{t('close', defaultLang)}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showBoxHintModal && (
        <div className="modal-backdrop" style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}} onClick={()=>{ setShowBoxHintModal(false); setCurrentBoxHint(null) }}>
          <div className="modal" style={{background:'#071124',padding:18,borderRadius:8,width:'92%',maxWidth:560,color:'#fff'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:16,fontWeight:700}}>{t('hint', lang)}</div>
              <button className="btn ghost" onClick={()=>{ setShowBoxHintModal(false); setCurrentBoxHint(null) }} style={{background:'transparent',color:'#fff',border:'none'}}>{t('close', defaultLang)}</button>
            </div>
            <div style={{marginTop:12,display:'flex',justifyContent:'center'}}>
              {currentBoxHint ? (
                // show uploaded hint image
                <img src={currentBoxHint} alt="hint" style={{maxWidth:'100%',maxHeight:'60vh',borderRadius:8}} />
              ) : (
                <div style={{color:'#9fb2c9'}}>{t('no_hint', lang)}</div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
