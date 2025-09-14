import React, {useEffect, useRef, useState} from 'react'
import { Html5Qrcode } from 'html5-qrcode'

export default function Scanner({onScan, active = true}){
  const containerRef = useRef(null)
  const qrRef = useRef(null)
  const mountedRef = useRef(false)
  const runningRef = useRef(false)
  const [status, setStatus] = useState('starting')
  const [error, setError] = useState(null)

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
        const cameraId = cams[0].id
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

  // render a live container for the reader; Html5Qrcode will populate this element
  return (
    <div className="scanner">
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{height:12}} />
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>Scanner status: {status}{error ? ' — '+error : ''}</div>
        <div ref={containerRef} style={{borderRadius:8,overflow:'hidden',background:'#000'}}>
          {/* Html5Qrcode will render camera preview inside this element */}
        </div>
      </div>
    </div>
  )
}
