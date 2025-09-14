import React, {useState, useEffect} from 'react'
import axios from 'axios'
import AdminLogin from './AdminLogin'
import { t } from './i18n'

export default function Admin({onLogout, defaultLang}){
  const [status, setStatus] = useState('')
  const [winners, setWinners] = useState([])
  const [statusText, setStatusText] = useState('')
  const [showRaffleModal, setShowRaffleModal] = useState(false)
  const [raffleCount, setRaffleCount] = useState(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [showCountdown, setShowCountdown] = useState(false)
  const [countdownNumber, setCountdownNumber] = useState(3)
  const [showWinnerReveal, setShowWinnerReveal] = useState(false)
  const [currentWinnerIndex, setCurrentWinnerIndex] = useState(0)
  const [showAddQuestion, setShowAddQuestion] = useState(false)
  const [questions, setQuestions] = useState([])
  const [newQ, setNewQ] = useState({question_text:'', options:['','','',''], correct_index:3})
  const [codeWords, setCodeWords] = useState([])
  const [newWord, setNewWord] = useState('')
  const [boxes, setBoxes] = useState([])
  const [showBoxesModal, setShowBoxesModal] = useState(false)
  const [boxesCountInput, setBoxesCountInput] = useState(1)
  const [uploadingBoxIndex, setUploadingBoxIndex] = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 640 : false)

  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth < 640) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  }, [])

  const [gameActive, setGameActive] = useState(false)
  // load stored admin credentials (set by AdminLogin on successful auth)
  useEffect(()=>{
    try{
      const username = localStorage.getItem('admin_username')
      const password = localStorage.getItem('admin_password')
      if(username && password){
        // ensure axios uses these credentials for admin API calls
        axios.defaults.auth = { username, password }
      }
    }catch(e){}
  }, [])

  function doAction(path){
  axios.post(path, {}, {}).then(()=>{
      // avoid showing raw OK/Err in the UI; update gameActive based on path
      if(path === '/api/admin/start') setGameActive(true)
      if(path === '/api/admin/end') setGameActive(false)
      // refresh game status after start/end
      loadGameStatus()
    }).catch((e)=>{ /* ignore raw error display; statusText will show active state */ })
  }

  function draw(){
    // show modal to choose count
    setShowRaffleModal(true)
  }

  function performRaffle(){
    const n = Math.max(1, parseInt(raffleCount) || 1)
  axios.post('/api/admin/raffle', {winners:n}).then(r=>{
      const w = r.data.winners || []
      setWinners(w)
      setStatusText('')
      setShowRaffleModal(false)
      if(w.length>0){
        // start reveal sequence
        setIsDrawing(true)
        setCurrentWinnerIndex(0)
        startCountdown(() => {
          // after countdown show first winner
          setShowWinnerReveal(true)
        })
      }
    }).catch(e=> setStatusText('Err raffle'))
  }

  function startCountdown(onComplete){
    setCountdownNumber(3)
    setShowCountdown(true)
    setShowWinnerReveal(false)
    let n = 3
    const tick = ()=>{
      if(n<=0){
        setShowCountdown(false)
        onComplete && onComplete()
        return
      }
      setCountdownNumber(n)
      n -= 1
      setTimeout(tick, 800)
    }
    setTimeout(tick, 200)
  }

  function handleNextWinner(){
    const next = currentWinnerIndex + 1
    if(next < (winners.length || 0)){
      setCurrentWinnerIndex(next)
      // show countdown again before revealing next
      startCountdown(()=> setShowWinnerReveal(true))
    } else {
      // finished
      setShowWinnerReveal(false)
      setIsDrawing(false)
      setWinners([])
      setCurrentWinnerIndex(0)
    }
  }

  // load questions
  function loadQuestions(){
  axios.get('/api/admin/questions').then(r=>{
      setQuestions(r.data || [])
    }).catch(()=>setQuestions([]))
  }

  function loadCodeWords(){
  axios.get('/api/admin/codewords').then(r=>{
      setCodeWords(r.data || [])
    }).catch(()=>setCodeWords([]))
  }

  function loadBoxes(){
    axios.get('/api/admin/boxes').then(r=>{
      setBoxes(r.data || [])
    }).catch(()=>setBoxes([]))
  }

  function openSetBoxes(){
    setBoxesCountInput(boxes.length || 1)
    setShowBoxesModal(true)
  }

  function setBoxesCount(){
    const cnt = Math.max(0, parseInt(boxesCountInput) || 0)
    axios.post('/api/admin/boxes/count', { count: cnt }).then(r=>{
      setBoxes(r.data.boxes || [])
      setShowBoxesModal(false)
    }).catch(e=>alert(t('failed', defaultLang)))
  }

  function handleBoxHintUpload(index, file){
    if(!file) return
    const fd = new FormData()
    fd.append('file', file, file.name)
    setUploadingBoxIndex(index)
    axios.post(`/api/admin/boxes/${index}/hint`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r=>{
      const updated = boxes.map(b => b.box_index === index ? { ...b, hint_filename: r.data.hint_filename } : b)
      setBoxes(updated)
      setUploadingBoxIndex(null)
    }).catch(e=>{ setUploadingBoxIndex(null); alert(t('failed', defaultLang)) })
  }

  function createCodeWord(){
    if(!newWord) return
  axios.post('/api/admin/codeword', {word:newWord}).then(()=>{
      setNewWord('')
      loadCodeWords()
  }).catch(e=>alert(t('failed_add_word', defaultLang)))
  }

  function deleteWord(id){
  if(!confirm(t('confirm_delete_word', defaultLang))) return
  axios.delete(`/api/admin/codeword/${id}`).then(()=>loadCodeWords()).catch(()=>alert(t('failed_delete', defaultLang)))
  }

  function deleteQuestion(id){
    if(!confirm(t('confirm_delete', defaultLang))) return
  axios.delete(`/api/admin/question/${id}`).then(()=>{
      loadQuestions()
      alert(t('deleted_success', defaultLang))
    }).catch(()=>alert(t('failed_delete', defaultLang)))
  }

  function deleteTask(id){
    if(!confirm(t('confirm_delete', defaultLang))) return
  // backend exposes deletion via /api/admin/question/{id}
  axios.delete(`/api/admin/question/${id}`).then(()=>{
      loadTasks()
      alert(t('deleted_success', defaultLang))
    }).catch(()=>alert(t('failed_delete', defaultLang)))
  }

  function deleteMember(id){
    if(!confirm(t('confirm_delete', defaultLang))) return
  axios.delete(`/api/admin/participant/${id}`).then(()=>{
      loadMembers()
      alert(t('deleted_success', defaultLang))
    }).catch(()=>alert(t('failed_delete', defaultLang)))
  }

  // mass delete modal state
  const [showMassDeleteModal, setShowMassDeleteModal] = useState(false)
  const [massDeleteTarget, setMassDeleteTarget] = useState(null) // 'tasks'|'members'|'questions'

  function confirmMassDelete(){
    if(!massDeleteTarget) return
    let path = ''
    if(massDeleteTarget === 'tasks') path = '/api/admin/tasks/all'
    else if(massDeleteTarget === 'members') path = '/api/admin/participants/all'
    else if(massDeleteTarget === 'questions') path = '/api/admin/questions/all'
    else if(massDeleteTarget === 'words') path = '/api/admin/codewords/all'
  axios.delete(path).then(()=>{
      setShowMassDeleteModal(false)
      const target = massDeleteTarget
      setMassDeleteTarget(null)
      // refresh
      if(target==='tasks') loadTasks()
      if(target==='members') loadMembers()
      if(target==='questions') loadQuestions()
      if(target==='words') loadCodeWords()
      alert(t('deleted_success', defaultLang))
    }).catch(()=>{
      setShowMassDeleteModal(false)
      setMassDeleteTarget(null)
      alert(t('failed_delete_all', defaultLang))
    })
  }

  useEffect(()=>{ loadQuestions() }, [])
  useEffect(()=>{ loadCodeWords() }, [])
  useEffect(()=>{ loadGameStatus() }, [])
  useEffect(()=>{ loadBoxes() }, [])
  const [settingsLang, setSettingsLang] = useState('en')
  const [questionTimeout, setQuestionTimeout] = useState(10)
  const [taskTimeout, setTaskTimeout] = useState(300)
  useEffect(()=>{
    // fetch current default language (admin)
  axios.get('/api/admin/settings/language').then(r => {
      const lang = r.data.default_language || 'en'
  setSettingsLang(lang)
  setOrigSettingsLang(lang)
    }).catch(() => {})
    // fetch timeouts
  axios.get('/api/admin/settings/timeouts').then(r => {
      setQuestionTimeout(r.data.question_timeout_seconds || 10)
      setTaskTimeout(r.data.task_timeout_seconds || 300)
    }).catch(() => {})
  }, [])

  function loadGameStatus(){
  axios.get('/api/admin/game').then(r=>{
      const g = r.data || {is_active:false, current_phase:'idle'}
  if(g.is_active) setStatusText(t('status_started', defaultLang))
  else if(g.current_phase === 'ended') setStatusText(t('status_finished', defaultLang))
  else setStatusText(t('status_not_started', defaultLang))
    }).catch(()=> setStatusText('Unknown'))
  }

  function openAdd(){ setNewQ({question_text:'', options:['','','',''], correct_index:3}); setShowAddQuestion(true); }

  function submitNewQuestion(){
    const payload = {question_text:newQ.question_text, correct_answer:newQ.options[newQ.correct_index]||'', options:newQ.options, quest_id: 1}
  axios.post('/api/admin/question', payload).then(r=>{
      setShowAddQuestion(false)
      loadQuestions()
    }).catch(e=>{
      console.error(e)
  alert(t('failed_add_question', defaultLang))
    })
  }



  function logout(){
    try{
      localStorage.removeItem('is_admin')
      localStorage.removeItem('admin_username')
      localStorage.removeItem('admin_password')
      try{ axios.defaults.auth = null }catch(e){}
    }catch(e){}
    try{ if(onLogout) onLogout() }catch(e){}
  }

  const controlStyle = isMobile ? {display:'flex',flexDirection:'column',gap:10} : {display:'flex',gap:8}
  const primaryBtnStyle = isMobile ? {width:'100%',padding:12,fontSize:16} : {}
  const [tab, setTab] = useState('game')
  const [origSettingsLang, setOrigSettingsLang] = useState(null)
  const [showChangePwdModal, setShowChangePwdModal] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpConfirm, setCpConfirm] = useState('')
  // pagination states
  const ITEMS_PER_PAGE = 10
  const [questionsPage, setQuestionsPage] = useState(1)
  const [wordsPage, setWordsPage] = useState(1)
  const [tasksPage, setTasksPage] = useState(1)
  const [membersPage, setMembersPage] = useState(1)
  const [members, setMembers] = useState([])
  const [newMember, setNewMember] = useState({username:'', password:''})
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importWordsFile, setImportWordsFile] = useState(null)
  const [importWordsResult, setImportWordsResult] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importMode, setImportMode] = useState('members') // 'members' | 'words'
  const [modalImportFile, setModalImportFile] = useState(null)
  const [showImportResultModal, setShowImportResultModal] = useState(false)
  const [importResultData, setImportResultData] = useState(null)
  const [importResultTarget, setImportResultTarget] = useState(null)

  function loadMembers(){
  axios.get('/api/admin/participants').then(r=>setMembers(r.data||[])).catch(()=>setMembers([]))
  }

  const [tasks, setTasks] = useState([])
  const [tasksSummary, setTasksSummary] = useState([])
  const [taskFilter, setTaskFilter] = useState('all') // 'all'|'assessed'|'not_rated'|'no_answer'
  const [taskSubs, setTaskSubs] = useState([])
  const [newTaskText, setNewTaskText] = useState('')
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageSrc, setImageSrc] = useState('')
  const [currentViewingSubmission, setCurrentViewingSubmission] = useState(null)
  const [showRatingPanel, setShowRatingPanel] = useState(false)
  const [showSubsModal, setShowSubsModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)

  function loadTasks(){
  axios.get('/api/admin/tasks').then(r=>setTasks(r.data||[])).catch(()=>setTasks([]))
  }

  function loadTasksSummary(){
  axios.get('/api/admin/tasks/summary').then(r=>setTasksSummary(r.data||[])).catch(()=>setTasksSummary([]))
  }

  function loadTaskSubs(qid){
  axios.get(`/api/admin/tasks/submissions/${qid}`).then(r=>setTaskSubs(r.data||[])).catch(()=>setTaskSubs([]))
  }

  function createTask(){
  if(!newTaskText) return alert(t('enter_task_text', defaultLang))
    const payload = { question_text: newTaskText, correct_answer: '', options: [], quest_id: 1, is_task: true }
  axios.post('/api/admin/question', payload).then(()=>{
      setNewTaskText('')
      loadTasks()
  }).catch(()=> alert(t('failed_create_task', defaultLang)))
  }

  function uploadImport(){
    // kept for backward compatibility (not used by modal)
    if(!importFile) return alert(t('select_file', defaultLang))
    const fd = new FormData()
    fd.append('file', importFile)
      axios.post('/api/admin/participants/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
      setImportFile(null)
      setImportResultData(r.data)
      setImportResultTarget('members')
      setShowImportResultModal(true)
      loadMembers()
    }).catch(e=>{
  alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message))
    })
  }

  function uploadWordsImport(){
    // kept for backward compatibility (not used by modal)
    if(!importWordsFile) return alert(t('select_file', defaultLang))
    const fd = new FormData()
    fd.append('file', importWordsFile)
      axios.post('/api/admin/codewords/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
      setImportWordsFile(null)
      setImportResultData(r.data)
      setImportResultTarget('words')
      setShowImportResultModal(true)
      loadCodeWords()
    }).catch(e=>{
  alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message))
    })
  }

  function performImport(){
  if(!modalImportFile) return alert(t('select_file', defaultLang))
    const fd = new FormData()
    fd.append('file', modalImportFile)
    if(importMode === 'members'){
      axios.post('/api/admin/participants/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
        setModalImportFile(null)
        setShowImportModal(false)
        setImportResultData(r.data)
        setImportResultTarget('members')
        setShowImportResultModal(true)
        loadMembers()
  }).catch(e=>alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message)))
    } else {
      if(importMode === 'words'){
        axios.post('/api/admin/codewords/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
        setModalImportFile(null)
        setShowImportModal(false)
        setImportResultData(r.data)
        setImportResultTarget('words')
        setShowImportResultModal(true)
        loadCodeWords()
  }).catch(e=>alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message)))
      } else if(importMode === 'tasks'){
        axios.post('/api/admin/tasks/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
          setModalImportFile(null)
          setShowImportModal(false)
          setImportResultData(r.data)
          setImportResultTarget('tasks')
          setShowImportResultModal(true)
          loadTasks()
        }).catch(e=>alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message)))
      } else if(importMode === 'surveys'){
        axios.post('/api/admin/surveys/import', fd, { headers: {'Content-Type': 'multipart/form-data'} }).then(r=>{
          setModalImportFile(null)
          setShowImportModal(false)
          setImportResultData(r.data)
          setImportResultTarget('surveys')
          setShowImportResultModal(true)
          loadQuestions()
        }).catch(e=>alert(t('import_failed', defaultLang) + ': ' + (e.response?.data?.detail||e.message)))
      }
    }
  }

  function createMember(){
  if(!newMember.username || !newMember.password) return alert(t('enter_username_password', defaultLang))
  axios.post('/api/admin/participant', newMember).then(r=>{
      setNewMember({username:'', password:''})
      loadMembers()
  }).catch(e=>alert(t('failed_create_member', defaultLang) + ': ' + (e.response?.data?.detail||e.message)))
  }

  return (
    <div style={{maxWidth:820,padding:12}}>
      <style>{`
        @keyframes fall-0 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-1 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-2 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-3 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-4 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-5 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-6 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-7 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-8 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-9 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-10 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-11 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-12 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-13 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-14 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-15 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-16 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-17 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-18 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-19 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-20 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-21 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-22 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-23 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-24 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-25 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-26 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-27 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-28 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
        @keyframes fall-29 { to { transform: translateY(120vh) rotate(360deg); opacity: 0.9 } }
      `}</style>
  <h2 style={{marginBottom:8}}>{t('admin_panel', defaultLang)}</h2>

      {/* Tabs */}
  <div style={{display:'flex',gap:8,marginBottom:12}}>
  <button className={"tab btn " + (tab==='game' ? 'active' : '')} onClick={()=>setTab('game')}>{t('game', defaultLang)}</button>
  <button className={"tab btn " + (tab==='questions' ? 'active' : '')} onClick={()=>setTab('questions')}>{t('questions', defaultLang)}</button>
  <button className={"tab btn " + (tab==='words' ? 'active' : '')} onClick={()=>setTab('words')}>{t('words', defaultLang)}</button>
      <button className={"tab btn " + (tab==='tasks' ? 'active' : '')} onClick={()=>{ setTab('tasks'); loadTasks(); loadTasksSummary() }}>{t('tasks', defaultLang)}</button>
      
      <button className={"tab btn " + (tab==='members' ? 'active' : '')} onClick={()=>{ setTab('members'); loadMembers() }}>{t('members', defaultLang)}</button>
      <button className={"tab btn " + (tab==='settings' ? 'active' : '')} onClick={()=>setTab('settings')}>{t('settings', defaultLang)}</button>
      <button className={"tab btn " + (tab==='boxes' ? 'active' : '')} onClick={()=>{ setTab('boxes'); loadBoxes() }}>{t('boxes', defaultLang)}</button>
      <button className={"tab btn " + (tab==='profile' ? 'active' : '')} onClick={()=>setTab('profile')}>{t('profile', defaultLang)}</button>
      </div>

      <div>
          {tab === 'game' && (
          <section style={{marginBottom:12}}>
            <h3>{t('game', defaultLang)}</h3>
            <div style={controlStyle}>
              <button className="btn" style={{...primaryBtnStyle, opacity: gameActive ? 0.6 : 1}} onClick={()=>{ if(!gameActive) doAction('/api/admin/start') }}>{t('start_game', defaultLang)}</button>
              <button className="btn" style={{...primaryBtnStyle, opacity: gameActive ? 1 : 0.6}} onClick={()=>{ if(gameActive) doAction('/api/admin/end') }}>{t('end_game', defaultLang)}</button>
                <button className="btn" style={{...primaryBtnStyle, background: (isDrawing || showRaffleModal || statusText !== t('status_finished', defaultLang)) ? '#22313f' : undefined}} onClick={draw} disabled={isDrawing || showRaffleModal || statusText !== t('status_finished', defaultLang)}>{t('draw_winner', defaultLang)}</button>
              {/* logout moved to Settings tab */}
            </div>
            <div style={{marginTop:10}}>{t('game', defaultLang)} status: <strong>{statusText}</strong></div>
          </section>
        )}

        {showBoxesModal && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:320}}>
              <h3 style={{marginTop:0}}>Set number of boxes</h3>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <input type="number" min={0} value={boxesCountInput} onChange={e=>setBoxesCountInput(e.target.value)} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
                  <button className="btn" onClick={()=>setBoxesCount()}>{t('save', defaultLang)}</button>
                  <button className="btn ghost" onClick={()=>{ setShowBoxesModal(false) }}>{t('close', defaultLang)}</button>
                </div>
              </div>
            </div>
          </div>
        )}

          {showCreateMemberModal && (
            <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
              <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:320}}>
                <h3 style={{marginTop:0}}>{t('create_member', defaultLang)}</h3>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <input className="input" placeholder={t('username', defaultLang)} value={newMember.username} onChange={e=>setNewMember({...newMember, username:e.target.value})} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                  <input className="input" placeholder={t('password', defaultLang)} type="password" value={newMember.password} onChange={e=>setNewMember({...newMember, password:e.target.value})} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                  <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
                    <button className="btn" onClick={()=>{ createMember(); setShowCreateMemberModal(false); setNewMember({username:'', password:''}) }}>{t('save_participant', defaultLang)}</button>
                    <button className="btn ghost" onClick={()=>{ setShowCreateMemberModal(false); setNewMember({username:'', password:''}) }}>{t('close', defaultLang)}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        {tab === 'settings' && (
          <section style={{marginBottom:12}}>
            <h3>{t('settings', defaultLang)}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <div style={{marginBottom:6,fontWeight:700}}>{t('interface_language', defaultLang)}</div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  <label style={{display:'flex',alignItems:'center',gap:8}}><input type="radio" name="lang" value="en" checked={settingsLang==='en'} onChange={()=>setSettingsLang('en')} /> {t('language_en', defaultLang)}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}><input type="radio" name="lang" value="ru" checked={settingsLang==='ru'} onChange={()=>setSettingsLang('ru')} /> {t('language_ru', defaultLang)}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}><input type="radio" name="lang" value="zh" checked={settingsLang==='zh'} onChange={()=>setSettingsLang('zh')} /> {t('language_zh', defaultLang)}</label>
                  <label style={{display:'flex',alignItems:'center',gap:8}}><input type="radio" name="lang" value="uk" checked={settingsLang==='uk'} onChange={()=>setSettingsLang('uk')} /> {t('language_uk', defaultLang)}</label>
                </div>
              </div>
              <div style={{display:'flex',gap:8}}>
                {origSettingsLang !== null && settingsLang !== origSettingsLang ? (
                  <button className="btn" onClick={()=>{
                    axios.post('/api/admin/settings/language', {default_language: settingsLang}).then(r=>{
                      const lang = r.data.default_language || settingsLang
                      try{ localStorage.setItem('default_language', lang) }catch(e){}
                      try{ window.dispatchEvent(new CustomEvent('language-changed', { detail: lang })) }catch(e){}
                      setOrigSettingsLang(lang)
                      alert(t('default_language_saved') + ': ' + lang)
                    }).catch(e=>alert(t('failed_save_language')))
                  }}>{t('save')}</button>
                ) : (
                  <button className="btn" disabled style={{opacity:0.6}}>{origSettingsLang ? t('language_' + origSettingsLang, defaultLang) : t('saved')}</button>
                )}
              </div>
              <div style={{marginTop:8}}>
                <div style={{marginBottom:6,fontWeight:700}}>{t('settings_timeouts_title', defaultLang)}</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    <label style={{fontSize:12,color:'var(--muted)'}}>{t('settings_question_timeout_label', defaultLang)}</label>
                    <input type="number" value={questionTimeout} onChange={e=>setQuestionTimeout(parseInt(e.target.value||0))} style={{width:120,padding:6,borderRadius:6,border:'1px solid #243142',background:'#071124',color:'#e6eef8'}} />
                  </div>
                  <div style={{display:'flex',flexDirection:'column'}}>
                    <label style={{fontSize:12,color:'var(--muted)'}}>{t('settings_task_timeout_label', defaultLang)}</label>
                    <input type="number" value={taskTimeout} onChange={e=>setTaskTimeout(parseInt(e.target.value||0))} style={{width:140,padding:6,borderRadius:6,border:'1px solid #243142',background:'#071124',color:'#e6eef8'}} />
                  </div>
                  <div>
                    <button className="btn" onClick={()=>{
                      axios.post('/api/admin/settings/timeouts', {question_timeout_seconds: questionTimeout, task_timeout_seconds: taskTimeout}).then(r=>{
                        alert(t('settings_save_timeouts', defaultLang))
                      }).catch(e=>alert(t('import_failed', defaultLang)))
                    }}>{t('settings_save_timeouts', defaultLang)}</button>
                  </div>
                </div>
              </div>
              {/* moved change-password and logout to Profile tab */}
            </div>
          </section>
        )}

        {tab === 'profile' && (
          <section style={{marginBottom:12}}>
            <h3>{t('profile', defaultLang)}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <button className="btn" onClick={()=>setShowChangePwdModal(true)}>{t('change_password_button', defaultLang)}</button>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn ghost" onClick={logout}>{t('logout', defaultLang)}</button>
              </div>
            </div>
          </section>
        )}

        {tab === 'boxes' && (
          <section style={{marginBottom:12}}>
            <h3>{t('boxes', defaultLang)}</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <button className="btn" onClick={openSetBoxes}>{t('boxes_set_button', defaultLang)}</button>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:12}}>
                {boxes && boxes.length>0 ? boxes.map(b => (
                  <div key={b.box_index} style={{width:140,display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                    <div style={{width:120,height:120,background:'#061221',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',border:'1px solid #243142'}}>
                      {b.hint_filename ? (
                        <img src={b.hint_filename.startsWith('/uploads') ? b.hint_filename : ('/uploads/' + b.hint_filename)} style={{width:'100%',height:'100%',objectFit:'cover'}} alt={`box-${b.box_index}`} />
                      ) : (
                        <div style={{color:'#94a3b8',fontSize:12}}>{t('boxes_box_label', defaultLang)} {b.box_index}</div>
                      )}
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <label className="btn small" style={{cursor:'pointer'}}>
                        {b.hint_filename ? t('boxes_change_hint', defaultLang) : t('boxes_add_hint', defaultLang)}
                        <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ const f = e.target.files && e.target.files[0]; if(f) handleBoxHintUpload(b.box_index, f) }} />
                      </label>
                    </div>
                  </div>
                )) : (
                  <div style={{color:'#94a3b8'}}>{t('boxes_no_configured', defaultLang)}</div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Change Password Modal */}
        {showChangePwdModal && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:320}}>
              <h3 style={{marginTop:0}}>{t('change_admin_password', defaultLang)}</h3>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <input placeholder={t('current_password', defaultLang)} type="password" value={cpCurrent} onChange={e=>setCpCurrent(e.target.value)} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                <input placeholder={t('new_password', defaultLang)} type="password" value={cpNew} onChange={e=>setCpNew(e.target.value)} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                <input placeholder={t('confirm_password', defaultLang)} type="password" value={cpConfirm} onChange={e=>setCpConfirm(e.target.value)} style={{background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
                  <button className="btn" onClick={()=>{
                    const current = cpCurrent.trim()
                    const np = cpNew.trim()
                    const cpv = cpConfirm.trim()
                    if(!current || !np) return alert(t('enter_username_password', defaultLang))
                    if(np !== cpv) return alert(t('password_mismatch', defaultLang))
                    const username = localStorage.getItem('admin_username') || 'admin'
                    axios.post('/api/admin/settings/change_password', {username: username, new_password: np}, { auth: { username: username, password: current } }).then(r=>{
                      try{ localStorage.setItem('admin_password', np) }catch(e){}
                      try{ axios.defaults.auth = { username: username, password: np } }catch(e){}
                      alert(t('password_changed', defaultLang))
                      setCpCurrent('')
                      setCpNew('')
                      setCpConfirm('')
                      setShowChangePwdModal(false)
                    }).catch(e=>{
                      alert((e.response && e.response.data && e.response.data.detail) || t('failed_update_password', defaultLang))
                    })
                  }}>{t('save', defaultLang)}</button>
                  <button className="btn ghost" onClick={()=>{ setShowChangePwdModal(false); setCpCurrent(''); setCpNew(''); setCpConfirm('') }}>{t('close', defaultLang)}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        {showCountdown && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{fontSize:120,fontWeight:800,color:'#fff',textShadow:'0 8px 20px rgba(0,0,0,0.6)',transform:'scale(1)',transition:'transform 0.2s'}}>{countdownNumber}</div>
          </div>
        )}

        {/* Winner reveal modal */}
        {showWinnerReveal && winners && winners.length>0 && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{background:'#071124',padding:22,borderRadius:10,position:'relative',minWidth:320,maxWidth:520,width:'90%',textAlign:'center',color:'#fff'}}>
              {/* simple confetti effect */}
              <div style={{position:'absolute',left:0,top:0,right:0,bottom:0,pointerEvents:'none'}}>
                {[...Array(30)].map((_,i)=> (
                  <div key={i} style={{position:'absolute',left:`${Math.random()*100}%`,top:`${Math.random()*-20}%`,width:8,height:14,background:["#f97316","#f43f5e","#60a5fa","#34d399"][i%4],opacity:0.9,transform:`rotate(${Math.random()*360}deg)`,animation:`fall-${i} 1500ms ${Math.random()*500}ms linear forwards`}} />
                ))}
              </div>
              <div style={{position:'relative',zIndex:2}}>
          <h2 style={{marginTop:6}}>{t('winner', defaultLang)}</h2>
                <div style={{fontSize:28,fontWeight:700,marginTop:8}}>{winners[currentWinnerIndex]}</div>
                <div style={{marginTop:14,display:'flex',justifyContent:'center',gap:8}}>
                  {currentWinnerIndex < winners.length-1 ? (
            <button className="btn" onClick={handleNextWinner}>{t('next', defaultLang)}</button>
                  ) : (
            <button className="btn" onClick={handleNextWinner}>{t('finish', defaultLang)}</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'questions' && (
          <section style={{marginBottom:12}}>
            <h3>{t('questions', defaultLang)}</h3>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
              <button className="btn" style={isMobile?{width:'100%'}:{}} onClick={openAdd}>{t('add_question', defaultLang)}</button>
              <button className="btn" onClick={loadQuestions}>{t('refresh_questions', defaultLang)}</button>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="btn" onClick={()=>{ setImportMode('surveys'); setShowImportModal(true) }}>{t('import_from_txt', defaultLang)}</button>
              </div>
              <button className="btn ghost" onClick={()=>{ setMassDeleteTarget('questions'); setShowMassDeleteModal(true) }}>{t('mass_delete', defaultLang)}</button>
            </div>

            {!isMobile ? (
              (()=>{
                const total = questions.length
                const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))
                const start = (questionsPage-1)*ITEMS_PER_PAGE
                const pageSlice = questions.slice(start, start+ITEMS_PER_PAGE)
                return (
                  <div>
                    <table className="results" style={{width:'100%'}}>
                      <thead><tr><th>{t('id', defaultLang)}</th><th>{t('text', defaultLang)}</th><th>{t('options', defaultLang)}</th><th>{t('answer', defaultLang)}</th><th>{t('quest', defaultLang)}</th><th>{t('actions', defaultLang)}</th></tr></thead>
                      <tbody>
                        {pageSlice.map(q=> (
                          <tr key={q.id}><td>{q.id}</td><td style={{maxWidth:200}}>{q.question_text}</td><td>{q.options.join(' | ')}</td><td>{q.correct_answer}</td><td>{q.quest_id}</td><td style={{textAlign:'right'}}><button className="btn small ghost" onClick={()=>deleteQuestion(q.id)}>{t('delete', defaultLang)}</button></td></tr>
                        ))}
                      </tbody>
                    </table>
                      <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:8}}>
                      <button className="btn small" disabled={questionsPage<=1} onClick={()=>setQuestionsPage(p=>Math.max(1,p-1))}>{t('prev', defaultLang)}</button>
                      <div style={{alignSelf:'center'}}>{t('page_label', defaultLang)} {questionsPage} / {pages}</div>
                      <button className="btn small" disabled={questionsPage>=pages} onClick={()=>setQuestionsPage(p=>Math.min(pages,p+1))}>{t('next', defaultLang)}</button>
                    </div>
                  </div>
                )
              })()
            ) : (
              (()=>{
                const total = questions.length
                const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))
                const start = (questionsPage-1)*ITEMS_PER_PAGE
                const pageSlice = questions.slice(start, start+ITEMS_PER_PAGE)
                return (
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                        {pageSlice.map(q=> (
                      <div key={q.id} style={{background:'#081126',padding:12,borderRadius:8}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{fontSize:14,fontWeight:700}}>#{q.id}</div>
                          <div style={{fontSize:12,color:'#94a3b8'}}>Quest {q.quest_id}</div>
                        </div>
                        <div style={{marginTop:8,fontSize:16}}>{q.question_text}</div>
                        <div style={{marginTop:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div style={{color:'#9fb2c9'}}>{q.options.join(' • ')}</div>
                          <div><button className="btn small ghost" onClick={()=>deleteQuestion(q.id)}>{t('delete', defaultLang)}</button></div>
                        </div>
                        <div style={{marginTop:8,fontSize:13,color:'#cbd5e1'}}>Answer: {q.correct_answer}</div>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'center',gap:8}}>
                      <button className="btn small" disabled={questionsPage<=1} onClick={()=>setQuestionsPage(p=>Math.max(1,p-1))}>{t('prev', defaultLang)}</button>
                      <div style={{alignSelf:'center'}}>{t('page_label', defaultLang)} {questionsPage} / {pages}</div>
                      <button className="btn small" disabled={questionsPage>=pages} onClick={()=>setQuestionsPage(p=>Math.min(pages,p+1))}>{t('next', defaultLang)}</button>
                    </div>
                  </div>
                )
              })()
            )}
          </section>
        )}

        {tab === 'tasks' && (
          <section style={{marginBottom:12}}>
            <h3>{t('tasks', defaultLang)}</h3>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
                <input className="input" placeholder={t('task_instruction_placeholder', defaultLang)} value={newTaskText} onChange={e=>setNewTaskText(e.target.value)} style={isMobile?{flex:'1 1 100%',background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}:{flex:1,background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
                <button className="btn" onClick={createTask}>{t('create_task', defaultLang)}</button>
                <button className="btn" onClick={loadTasks}>{t('refresh_tasks', defaultLang)}</button>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <button className="btn" onClick={()=>{ setImportMode('tasks'); setShowImportModal(true) }}>{t('import_from_txt', defaultLang)}</button>
                </div>
                <button className="btn ghost" onClick={()=>{ setMassDeleteTarget('tasks'); setShowMassDeleteModal(true) }}>{t('mass_delete', defaultLang)}</button>
            </div>
            <div style={{display:'flex',gap:12}}>
              <div style={{flex:1}}>
                <h4>{t('task_questions', defaultLang)}</h4>
                {(()=>{
                  // compute status per task from tasksSummary
                  const summaryMap = {};
                  (tasksSummary || []).forEach(s => { summaryMap[s.question_id] = s })
                  const tasksWithStatus = (tasks || []).map(t => {
                    const s = summaryMap[t.id] || { total: 0, rated: 0 }
                    let status = 'no_answer'
                    if(s.total === 0) status = 'no_answer'
                    else if(s.total > 0 && s.rated >= s.total) status = 'assessed'
                    else status = 'not_rated'
                    return { ...t, _status: status, _totalSubs: s.total, _rated: s.rated }
                  })
                  // apply filter
                  const filtered = tasksWithStatus.filter(t => {
                    if(taskFilter === 'all') return true
                    if(taskFilter === 'assessed') return t._status === 'assessed'
                    if(taskFilter === 'not_rated') return t._status === 'not_rated'
                    if(taskFilter === 'no_answer') return t._status === 'no_answer'
                    return true
                  })
                  const total = filtered.length
                  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))
                  const start = (tasksPage-1)*ITEMS_PER_PAGE
                  const pageSlice = filtered.slice(start, start+ITEMS_PER_PAGE)
                  return (
                    <div>
                      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:700}}>{t('filter_by_status', defaultLang)}</div>
                        <button className={"btn small " + (taskFilter==='all' ? '' : 'ghost')} onClick={()=>{ setTaskFilter('all'); setTasksPage(1); }}>{t('filter_all', defaultLang)}</button>
                        <button className={"btn small " + (taskFilter==='assessed' ? '' : 'ghost')} onClick={()=>{ setTaskFilter('assessed'); setTasksPage(1); }}>{t('filter_assessed', defaultLang)}</button>
                        <button className={"btn small " + (taskFilter==='not_rated' ? '' : 'ghost')} onClick={()=>{ setTaskFilter('not_rated'); setTasksPage(1); }}>{t('filter_not_rated', defaultLang)}</button>
                        <button className={"btn small " + (taskFilter==='no_answer' ? '' : 'ghost')} onClick={()=>{ setTaskFilter('no_answer'); setTasksPage(1); }}>{t('filter_no_answer', defaultLang)}</button>
                      </div>
                      <ul>
                        {pageSlice.map(task=> <li key={task.id} style={{marginBottom:8}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                            <div>{task.question_text} <small style={{color:'#94a3b8'}}>#{task.id}</small> <small style={{color:'#94a3b8',marginLeft:8}}>{task._totalSubs ? (task._totalSubs + ' subs') : ''} {task._rated ? ('rated ' + task._rated) : ''}</small></div>
                            <div style={{display:'flex',gap:8}}><button className="btn small" onClick={()=>{ setSelectedTask(task); loadTaskSubs(task.id); setShowSubsModal(true) }}>{t('view_submissions', defaultLang)}</button><button className="btn small ghost" onClick={()=>deleteTask(task.id)}>{t('delete', defaultLang)}</button></div>
                          </div>
                        </li>)}
                      </ul>
                      <div style={{display:'flex',justifyContent:'center',gap:8}}>
                        <button className="btn small" disabled={tasksPage<=1} onClick={()=>setTasksPage(p=>Math.max(1,p-1))}>{t('prev', defaultLang)}</button>
                        <div style={{alignSelf:'center'}}>{t('page_label', defaultLang)} {tasksPage} / {pages}</div>
                        <button className="btn small" disabled={tasksPage>=pages} onClick={()=>setTasksPage(p=>Math.min(pages,p+1))}>{t('next', defaultLang)}</button>
                      </div>
                    </div>
                  )
                })()}
              </div>
              {/* Submissions are now shown in a modal when View submissions is clicked */}
            </div>
          </section>
        )}

        {showSubsModal && (
          <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
            <div style={{background:'#0f1720',padding:18,borderRadius:8,width:'92%',maxWidth:900}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontWeight:700}}>{t('submissions_for_task', defaultLang)} #{selectedTask?.id}</div>
                <div>
                  <button className="btn" onClick={()=>{ setShowSubsModal(false); setTaskSubs([]); setSelectedTask(null) }}>{t('close', defaultLang)}</button>
                </div>
              </div>
              <div style={{marginTop:12}}>
                <table className="results" style={{width:'100%'}}>
                  <thead><tr><th>{t('id', defaultLang)}</th><th>{t('username', defaultLang)}</th><th>{t('file', defaultLang)}</th><th>{t('created', defaultLang)}</th></tr></thead>
                  <tbody>
                    {taskSubs.map(s=>(
                      <tr key={s.id}><td>{s.id}</td><td>{s.username || s.session_id}</td><td><button className="btn small" onClick={()=>{ setImageSrc(`/uploads/${s.filename}`); setShowImageModal(true); setCurrentViewingSubmission(s); setShowRatingPanel(false) }}>{s.filename}</button></td><td>{s.created_at}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'members' && (
          <section style={{marginBottom:12}}>
            <h3>{t('members', defaultLang)}</h3>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
              <button className="btn" onClick={()=>setShowCreateMemberModal(true)}>{t('create_member', defaultLang)}</button>
              <button className="btn" onClick={loadMembers}>{t('refresh', defaultLang)}</button>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="btn" onClick={()=>{ setImportMode('members'); setShowImportModal(true) }}>{t('import_from_txt', defaultLang)}</button>
              </div>
              <div style={{marginLeft:8}}><button className="btn ghost" onClick={()=>{ setMassDeleteTarget('members'); setShowMassDeleteModal(true) }}>{t('mass_delete', defaultLang)}</button></div>
            </div>

            <table className="results" style={{width:'100%'}}>
              <thead><tr><th>{t('id', defaultLang)}</th><th>{t('username', defaultLang)}</th><th>{t('created', defaultLang)}</th></tr></thead>
              <tbody>
                {(() => {
                  const total = members.length
                  const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))
                  const start = (membersPage-1)*ITEMS_PER_PAGE
                  const pageSlice = members.slice(start, start+ITEMS_PER_PAGE)
      return pageSlice.map(m=> <tr key={m.id}><td>{m.id}</td><td>{m.username}</td><td>{m.created_at}</td><td style={{textAlign:'right'}}><button className="btn small ghost" onClick={()=>deleteMember(m.id)}>{t('delete', defaultLang)}</button></td></tr>)
                })()}
              </tbody>
            </table>
    <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:8}}>
              <button className="btn small" disabled={membersPage<=1} onClick={()=>setMembersPage(p=>Math.max(1,p-1))}>{t('prev', defaultLang)}</button>
              <div style={{alignSelf:'center'}}>{t('page_label', defaultLang)} {membersPage} / {Math.max(1, Math.ceil(members.length/ITEMS_PER_PAGE))}</div>
              <button className="btn small" disabled={membersPage>=Math.max(1, Math.ceil(members.length/ITEMS_PER_PAGE))} onClick={()=>setMembersPage(p=>Math.min(Math.max(1, Math.ceil(members.length/ITEMS_PER_PAGE)),p+1))}>{t('next', defaultLang)}</button>
            </div>
  {/* mass-delete button moved to the top controls */}
          </section>
        )}

        {tab === 'words' && (
          <section style={{marginBottom:12}}>
            <h3>{t('words', defaultLang)}</h3>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              <input className="input" value={newWord} onChange={e=>setNewWord(e.target.value)} placeholder={t('word', defaultLang)} style={isMobile?{flex:'1 1 100%',background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}:{minWidth:200,background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} />
              <button className="btn" onClick={createCodeWord}>{t('add_word', defaultLang)}</button>
              <button className="btn" onClick={loadCodeWords}>{t('refresh', defaultLang)}</button>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <button className="btn" onClick={()=>{ setImportMode('words'); setShowImportModal(true) }} style={{background:'#0b2440',border:'1px solid #143049'}}>{t('import_words', defaultLang)}</button>
              </div>
              <div style={{marginLeft:8}}><button className="btn ghost" onClick={()=>{ setMassDeleteTarget('words'); setShowMassDeleteModal(true) }}>{t('mass_delete', defaultLang)}</button></div>
            </div>
            <ul style={{marginTop:8}}>
              {(() => {
                const total = codeWords.length
                const pages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE))
                const start = (wordsPage-1)*ITEMS_PER_PAGE
                const pageSlice = codeWords.slice(start, start+ITEMS_PER_PAGE)
                return pageSlice.map(w=>(
                  <li key={w.id} style={{marginBottom:6}}>
                    <span style={{marginRight:8}}>{w.word}</span>
                    <button className="btn ghost" onClick={()=>deleteWord(w.id)}>Delete</button>
                  </li>
                ))
              })()}
            </ul>
              <div style={{display:'flex',justifyContent:'center',gap:8,marginTop:8}}>
              <button className="btn small" disabled={wordsPage<=1} onClick={()=>setWordsPage(p=>Math.max(1,p-1))}>{t('prev', defaultLang)}</button>
              <div style={{alignSelf:'center'}}>{t('page_label', defaultLang)} {wordsPage} / {Math.max(1, Math.ceil(codeWords.length/ITEMS_PER_PAGE))}</div>
              <button className="btn small" disabled={wordsPage>=Math.max(1, Math.ceil(codeWords.length/ITEMS_PER_PAGE))} onClick={()=>setWordsPage(p=>Math.min(Math.max(1, Math.ceil(codeWords.length/ITEMS_PER_PAGE)),p+1))}>{t('next', defaultLang)}</button>
            </div>
          </section>
        )}
      </div>

      {showAddQuestion && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:360}}>
            <h3>Add Question</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <input placeholder={t('question_text_placeholder', defaultLang)} value={newQ.question_text} onChange={e=>setNewQ({...newQ, question_text:e.target.value})} />
              {newQ.options.map((opt,i)=> (
                <div key={i} style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input className="input" style={{flex:1,background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8'}} value={newQ.options[i]} onChange={e=>{ const o=[...newQ.options]; o[i]=e.target.value; setNewQ({...newQ, options:o}) }} />
                  <label style={{color:'#94a3b8',display:'flex',alignItems:'center',gap:6}}><input type="radio" name="correct" checked={newQ.correct_index===i} onChange={()=>setNewQ({...newQ, correct_index:i})} /> {t('correct_label', defaultLang)}</label>
                </div>
              ))}
              <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
                <button className="btn" onClick={submitNewQuestion}>{t('save_question', defaultLang)}</button>
                <button className="btn ghost" onClick={()=>setShowAddQuestion(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified import modal for members and words */}
      {showImportModal && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:360,maxWidth:720,width:'90%'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0}}>{importMode === 'members' ? t('import_members', defaultLang) : (importMode === 'words' ? t('import_words', defaultLang) : (importMode === 'tasks' ? t('import_tasks', defaultLang) : (importMode === 'surveys' ? t('import_surveys', defaultLang) : t('import_from_txt', defaultLang))))}</h3>
            </div>
            <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:10}}>
              <div
                onDragOver={e=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                onDrop={e=>{ e.preventDefault(); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) setModalImportFile(f) }}
                style={{border:'2px dashed #1f2937',padding:18,borderRadius:8,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,background:'#071124'}}
              >
                <div style={{color:'#9fb2c9'}}>{t('or_click', defaultLang)}</div>
                <label style={{cursor:'pointer'}} className="btn small">
                  {t ? t('choose_file', settingsLang || defaultLang) : 'Choose file'}
                  <input type="file" accept=".txt" style={{display:'none'}} onChange={e=>setModalImportFile(e.target.files[0] || null)} />
                </label>
                {modalImportFile && <div style={{marginTop:8,color:'#cbd5e1'}}>{modalImportFile.name} ({Math.round(modalImportFile.size/1024)} KB)</div>}
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <button className="btn" onClick={performImport}>{t('upload', defaultLang)}</button>
                <button className="btn ghost" onClick={()=>{ setShowImportModal(false); setModalImportFile(null) }}>{t('close', defaultLang)}</button>
              </div>
            </div>
          </div>
        </div>
      )}
  {/* status raw string hidden to avoid showing API paths; use game statusText above */}

      {/* Mass delete confirmation modal */}
      {showMassDeleteModal && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:320}}>
            <div style={{marginBottom:12,fontWeight:700}}>{t('mass_delete', defaultLang)}</div>
            <div style={{marginBottom:12}}>{t('mass_delete_confirm', defaultLang)}</div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button className="btn" onClick={()=>confirmMassDelete()}>{t('yes', defaultLang)}</button>
              <button className="btn ghost" onClick={()=>{ setShowMassDeleteModal(false); setMassDeleteTarget(null) }}>{t('no', defaultLang)}</button>
            </div>
          </div>
        </div>
      )}
      {winners.length>0 && !isDrawing && !showWinnerReveal && (
        <div style={{marginTop:8}}>
          <h3>{t('winners', defaultLang)}</h3>
          <ul>{winners.map((w,i)=>(<li key={i}>{w}</li>))}</ul>
        </div>
      )}

      {showRaffleModal && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}}>
          <div style={{background:'#0f1720',padding:20,borderRadius:8,minWidth:320}}>
            <h3>{t('draw_winners_title', defaultLang)}</h3>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input style={{flex:1,background:'#071124',border:'1px solid #1f2937',padding:8,color:'#e6eef8',borderRadius:6}} type="number" min={1} value={raffleCount} onChange={e=>setRaffleCount(e.target.value)} />
              <button className="btn" onClick={performRaffle}>Draw</button>
              <button className="btn ghost" onClick={()=>setShowRaffleModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Import result modal */}
  {showImportResultModal && importResultData && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#0f1720',padding:18,borderRadius:8,minWidth:320,maxWidth:720,width:'90%'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h3 style={{margin:0}}>{importResultTarget === 'members' ? t('import_result_members', defaultLang) : (importResultTarget === 'words' ? t('import_result_words', defaultLang) : (importResultTarget === 'tasks' ? t('import_result_tasks', defaultLang) : t('import_result_surveys', defaultLang)))}</h3>
            </div>
            <div style={{marginTop:12}}>
              <div>Created: {importResultData.created}</div>
              <div>Skipped: {importResultData.skipped}</div>
              {importResultData.errors && importResultData.errors.length>0 && (
                <div style={{marginTop:12}}>
                  <h4>Errors</h4>
                  <ul>
                    {importResultData.errors.map((err,i)=>(<li key={i}>Line {err.line}: {err.reason}</li>))}
                  </ul>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
                <button className="btn ghost" onClick={()=>{ setShowImportResultModal(false); setImportResultData(null); setImportResultTarget(null) }}>{t('close', defaultLang)}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showImageModal && (
        <div style={{position:'fixed',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)'}}>
          <div style={{background:'#0f1720',padding:18,borderRadius:8,maxWidth:'90%',maxHeight:'90%'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontWeight:700}}>Submission</div>
              <div style={{display:'flex',gap:8}}>
                {currentViewingSubmission && (currentViewingSubmission.rating == null) && !showRatingPanel && (
                  <button className="btn" onClick={()=>setShowRatingPanel(true)}>{t('rate', defaultLang)}</button>
                )}
                <button className="btn ghost" onClick={()=>{ setShowImageModal(false); setCurrentViewingSubmission(null); setShowRatingPanel(false) }}>{t('close', defaultLang)}</button>
              </div>
            </div>
            <div style={{marginTop:12,display:'flex',justifyContent:'center'}}>
              <img src={imageSrc} style={{maxWidth:'100%',maxHeight:'80vh',borderRadius:8}} alt="submission" />
            </div>
            {showRatingPanel && currentViewingSubmission && (
              <div style={{marginTop:12,display:'flex',justifyContent:'center',gap:8}}>
                <div style={{background:'#071124',padding:10,borderRadius:8,display:'flex',gap:6}}>
                  {[0,1,2,3,4,5].map(n=> (
                    <button key={n} className="btn small" onClick={()=>{
                      // send rating
                      axios.post('/api/admin/tasks/submit_rating', { submission_id: currentViewingSubmission.id, points: n }).then(r=>{
                        // update local state: set rating on submission and hide panel
                        const updated = taskSubs.map(s => s.id === currentViewingSubmission.id ? { ...s, rating: n } : s)
                        setTaskSubs(updated)
                        setCurrentViewingSubmission(prev => prev ? { ...prev, rating: n } : prev)
                        setShowRatingPanel(false)
                        // refresh summary so filter counts update
                        try{ loadTasksSummary() }catch(e){}
                        alert(t('rated_success', defaultLang) + ' ' + (r.data.new_balance !== undefined ? ('(new balance: ' + r.data.new_balance + ')') : ''))
                      }).catch(e=>{
                        alert(t('rated_failed', defaultLang) + ': ' + (e.response?.data?.detail || e.message))
                      })
                    }}>{n}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
