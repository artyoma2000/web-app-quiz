import React, {useEffect, useRef, useState} from 'react'
import { t } from './i18n'
import { Html5Qrcode } from 'html5-qrcode'

export default function Scanner({onScan, active = true, lang=null}){
  const containerRef = useRef(null)
  const qrRef = useRef(null)
  const mountedRef = useRef(false)
  const runningRef = useRef(false)
  const [status, setStatus] = useState('starting')
  const [error, setError] = useState(null)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState(null)

  // helper to compute viewfinder size
  function viewfinderSize(){
    const w = Math.min(window.innerWidth - 100, 360)
    return {width: w, height: w}
  }

  // create the Html5Qrcode instance and prepare the React-managed container on mount
  useEffect(()=>{
    mountedRef.current = true
    const container = containerRef.current
    if(!container){ setStatus('no-container'); return }

    const id = container.dataset._qrId || ('qr-reader-' + Math.random().toString(36).slice(2))
    container.dataset._qrId = id
    container.id = id

    try{ container.innerHTML = '' }catch(e){}

    const qr = new Html5Qrcode(id)
    qrRef.current = qr
    setStatus('ready')

    return ()=>{
      mountedRef.current = false
      try{ if(qrRef.current && runningRef.current){ qrRef.current.stop().catch(()=>{}); runningRef.current = false } }catch(e){}
      qrRef.current = null
    }
  }, [onScan])

  // stop/start logic controlled by `active` prop
  useEffect(()=>{
  let qr = qrRef.current
  if(!qr){ setStatus('no-instance'); return }

    async function stopScanner(){
      try{
        if(runningRef.current){
          await qr.stop()
          runningRef.current = false
        }
        // avoid calling qr.clear() — clearing DOM nodes can race with React's reconciliation
        setStatus('stopped')
      }catch(err){
        // ignore AbortError from media play race
        if(err && err.name === 'AbortError') return
        console.warn('stopScanner error', err)
      }
    }

    async function startScanner(){
      try{
        qr = qrRef.current
        if(!qr){ setStatus('no-instance'); return }
        const cams = await Html5Qrcode.getCameras()
        if(!cams || !cams.length){ setStatus('no-camera'); setError('No cameras found'); return }
        // store camera list for UI
        setCameras(cams)
        // choose the selected camera if set, otherwise prefer environment (rear) facing camera
        let cameraId = selectedCamera || null
        if(!cameraId){
          // prefer a camera whose label contains 'back' or 'rear' or whose facingMode is 'environment'
          const prefer = cams.find(c=>/(back|rear|environment|wide)/i.test(c.label || '')) || cams[0]
          cameraId = prefer.id
        }
        setStatus('starting')
        // small delay to avoid layout race
        await new Promise(res=>setTimeout(res, 80))
        try{
          await qr.start(cameraId, {fps:10, qrbox: viewfinderSize()}, (decoded)=>{
            if(!mountedRef.current) return
            try{ onScan(decoded) }catch(e){ console.error(e) }
            // after a successful decode, stop briefly to prevent duplicate reads; defer to avoid play() races
            setTimeout(()=>{ try{ runningRef.current = false; qr.stop().catch(()=>{}); }catch(e){} }, 50)
          })
        }catch(startErr){
          // retry once on TypeError (layout race)
          if(startErr instanceof TypeError){
            await new Promise(res=>setTimeout(res, 120))
            try{ await qr.start(cameraId, {fps:10, qrbox: viewfinderSize()}, (decoded)=>{ if(!mountedRef.current) return; try{ onScan(decoded) }catch(e){ console.error(e) } }) }catch(retryErr){ setError(String(retryErr)); setStatus('error'); return }
          }else{ setError(String(startErr)); setStatus('error'); return }
        }
        runningRef.current = true
        setStatus('running')
      }catch(err){
        if(err && err.name === 'AbortError') return
        console.warn('startScanner error', err)
        setError(String(err))
        setStatus('error')
      }
    }

    if(!active){
      stopScanner()
    }else{
      // if instance exists but isn't running, start; if instance is missing recreate one
      if(!runningRef.current){
        startScanner()
      }
    }
  }, [active, onScan])

  // handle camera selection change
  useEffect(()=>{
    // when selectedCamera changes while active, restart scanner to apply new device
    if(!selectedCamera) return
    // if scanner running, restart it to apply the new cameraId
    async function restart(){
      const qr = qrRef.current
      if(!qr) return
      try{
        if(runningRef.current){
          await qr.stop()
          runningRef.current = false
        }
      }catch(e){}
      // small delay to allow device to free
      await new Promise(res=>setTimeout(res, 120))
      try{
        await qr.start(selectedCamera, {fps:10, qrbox: viewfinderSize()}, (decoded)=>{ if(!mountedRef.current) return; try{ onScan(decoded) }catch(e){ console.error(e) } })
        runningRef.current = true
        setStatus('running')
      }catch(err){ setError(String(err)); setStatus('error') }
    }
    // only restart when component is mounted and active
    if(mountedRef.current && active){ restart() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCamera])

  // render a live container for the reader; Html5Qrcode will populate this element
  return (
    <div className="scanner">
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{height:12}} />
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>Scanner status: {status}{error ? ' — '+error : ''}</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          {/* camera selector (if multiple cameras) */}
          {cameras && cameras.length > 1 ? (
              <select value={selectedCamera||''} onChange={e=>setSelectedCamera(e.target.value)} style={{flex:1,borderRadius:6,padding:6,background:'#071124',color:'#e6eef8',border:'1px solid #1f2937'}}>
                <option value="">{t('prefer_rear', lang) || t('use_preferred', lang)}</option>
                {cameras.map(c=> <option key={c.id} value={c.id}>{c.label || c.id}</option> )}
              </select>
            ) : (
              <div style={{flex:1,fontSize:12,color:'var(--muted)'}}>Camera: {cameras && cameras.length ? (cameras[0].label || cameras[0].id) : t('detecting', lang) || 'detecting...'}</div>
            )}
          {/* quick toggle to clear selection (back to preferred) */}
          <button className="btn" onClick={()=>setSelectedCamera(null)} style={{padding:'6px 10px',borderRadius:8,whiteSpace:'nowrap'}}>{t('use_preferred', lang)}</button>
        </div>
        <div ref={containerRef} style={{borderRadius:8,overflow:'hidden',background:'#000'}}>
          {/* Html5Qrcode will render camera preview inside this element */}
        </div>
      </div>
    </div>
  )
}
