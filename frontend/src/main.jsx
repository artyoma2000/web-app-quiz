import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

function showError(err){
	console.error(err)
	const el = document.getElementById('root')
	if(el){ el.innerHTML = '<pre style="color:salmon;padding:20px;">'+(err && err.stack ? err.stack : String(err))+'</pre>' }
}

try{
	createRoot(document.getElementById('root')).render(<App />)
}catch(err){
	showError(err)
}

window.addEventListener('error', e=>{ showError(e.error || e.message) })
window.addEventListener('unhandledrejection', e=>{ showError(e.reason || e) })
