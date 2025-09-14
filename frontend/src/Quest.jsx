import React, {useEffect, useState} from 'react'
import axios from 'axios'
import { t } from './i18n'

// Quest supports two modes:
// - fetch mode: pass `questId` and it will GET /api/quest/{id}
// - inline mode: pass a `question` object prop {id, question_text, options}
// Optional `timeLimitSeconds` will start a countdown and call `onClose` when it hits zero.
export default function Quest({questId, question: propQuestion, timeLimitSeconds = 0, onClose}){
  const [q, setQ] = useState(propQuestion || null)
  const [sessionId, setSessionId] = useState(localStorage.getItem('session_id') || '')
  const [message, setMessage] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(timeLimitSeconds || 0)

  useEffect(()=>{
    if(propQuestion){
      setQ(propQuestion)
      setSecondsLeft(timeLimitSeconds || 0)
    }
  }, [propQuestion, timeLimitSeconds])

  useEffect(()=>{
    if(!propQuestion && questId) fetchQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questId])

  useEffect(()=>{
    if(secondsLeft > 0){
      const t = setInterval(()=>{
        setSecondsLeft(s => {
          if(s <= 1){
            clearInterval(t)
            if(onClose) onClose()
            return 0
          }
          return s-1
        })
      }, 1000)
      return ()=>clearInterval(t)
    }
  }, [secondsLeft, onClose])

  function fetchQuestion(){
    const sid = sessionId || (new URLSearchParams(window.location.search)).get('session_id') || ''
  axios.get(`/api/quest/${questId}?session_id=${sid}`).then(r=>setQ(r.data)).catch(()=>setMessage(t('error_loading_question', defaultLang)))
  }

  function answer(a){
    const sid = sessionId || (new URLSearchParams(window.location.search)).get('session_id') || ''
    if(!q || !q.id){ setMessage(t('invalid_question', defaultLang)); return }
    axios.post('/api/answer', {session_id: sid, question_id: q.id, answer: a}).then(r=>{
      setMessage(r.data.is_correct ? t('correct', defaultLang) : t('incorrect', defaultLang))
      // auto-close after short delay when inside modal/inline mode
      if(onClose) setTimeout(()=>onClose(), 1200)
  }).catch(()=>setMessage(t('error_submitting', defaultLang)))
  }

  if(!q) return <div><h3>{t('question', defaultLang)}</h3><div>{message||t('loading', defaultLang)}</div></div>
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h3 className="neon">{q.question_text}</h3>
        {secondsLeft>0 && <div style={{fontSize:12,color:'var(--muted)'}}>Time: {secondsLeft}s</div>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:8,maxWidth:480}}>
        {q.options.map((o,i)=>(<button key={i} onClick={()=>answer(o)} className="option">{o}</button>))}
      </div>
      {message && <div style={{marginTop:12}} className="msg">{message}</div>}
    </div>
  )
}
