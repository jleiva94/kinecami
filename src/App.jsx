import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import AgendarCita from './pages/AgendarCita'
import PanelKine from './pages/PanelKine'
import LoginKine from './pages/LoginKine'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AgendarCita />} />
        <Route path="/login" element={
          session ? <Navigate to="/panel" /> : <LoginKine />
        } />
        <Route path="/panel" element={
          session ? <PanelKine session={session} /> : <Navigate to="/login" />
        } />
      </Routes>
    </BrowserRouter>
  )
}
