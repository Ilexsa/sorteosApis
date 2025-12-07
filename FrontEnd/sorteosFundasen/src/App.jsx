import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, '')

const CONFETTI_COLORS = ['#f95738', '#f7b733', '#38bdf8', '#a78bfa', '#34d399']

function launchConfetti() {
  const wrapper = document.createElement('div')
  wrapper.className = 'confetti-wrapper'
  for (let i = 0; i < 120; i += 1) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    piece.style.left = `${Math.random() * 100}%`
    piece.style.animationDelay = `${Math.random() * 0.5}s`
    piece.style.setProperty('--fall-duration', `${2 + Math.random() * 2}s`)
    piece.style.backgroundColor = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    piece.style.transform = `rotate(${Math.random() * 45}deg)`
    wrapper.appendChild(piece)
  }
  document.body.appendChild(wrapper)
  setTimeout(() => wrapper.remove(), 4000)
}

const SnowOverlay = () => {
  const flakes = useMemo(() => Array.from({ length: 80 }, (_, idx) => idx), [])
  return (
    <div className="snow-overlay" aria-hidden="true">
      {flakes.map((flake) => (
        <span
          key={flake}
          className="snowflake"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${6 + Math.random() * 4}s`,
            opacity: 0.4 + Math.random() * 0.4,
            fontSize: `${12 + Math.random() * 10}px`
          }}
        >
          ❄
        </span>
      ))}
    </div>
  )
}

const formatDate = (value) => new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
}).format(new Date(value))

function useAudioChime() {
  const audioCtxRef = useRef(null)
  return () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    const now = ctx.currentTime
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(740, now)
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7)

    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.7)
  }
}

function App() {
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [state, setState] = useState(null)
  const [lastWinner, setLastWinner] = useState(null)
  const [loadingDraw, setLoadingDraw] = useState(false)
  const [error, setError] = useState('')
  const spinTimeoutRef = useRef(null)
  const [spinning, setSpinning] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const playChime = useAudioChime()

  const headers = useMemo(() => token ? { Authorization: `Bearer ${token}` } : {}, [token])

  useEffect(() => {
    const loadState = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/state`)
        if (!res.ok) {
          throw new Error('No se pudo cargar el estado inicial')
        }
        const data = await res.json()
        setState(data)
      } catch (err) {
        setError(err.message)
      }
    }
    loadState()
  }, [])

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/events`)
    const onState = (event) => {
      const payload = JSON.parse(event.data)
      setState(payload)
    }
    const onWinner = (event) => {
      const payload = JSON.parse(event.data)
      setLastWinner(payload)
      playChime()
      triggerSpin()
    }
    eventSource.addEventListener('state', onState)
    eventSource.addEventListener('winner', onWinner)
    eventSource.onerror = () => setError('La conexión en tiempo real tuvo un problema')
    return () => eventSource.close()
  }, [playChime])

  const triggerSpin = () => {
    setSpinning(true)
    clearTimeout(spinTimeoutRef.current)
    spinTimeoutRef.current = setTimeout(() => setSpinning(false), 3200)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (!res.ok) throw new Error('Contraseña incorrecta')
      const data = await res.json()
      setToken(data.token)
      setPassword('')
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDraw = async () => {
    if (!token) return
    setLoadingDraw(true)
    setError('')
    triggerSpin()
    try {
      await new Promise(resolve => setTimeout(resolve, 3000))
      const res = await fetch(`${API_BASE}/api/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers }
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo ejecutar el sorteo')
      }
      setLastWinner(data)
      playChime()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingDraw(false)
    }
  }

  const recentWinners = state?.recentWinners || []
  const waitingPeople = state?.waitingPeople || []
  const upcomingPrizes = state?.upcomingPrizes || []

  useEffect(() => {
    if (!lastWinner) return
    setShowModal(true)
    launchConfetti()
    const timer = setTimeout(() => setShowModal(false), 4000)
    return () => clearTimeout(timer)
  }, [lastWinner])

  return (
    <div className="page">
      <SnowOverlay />
      <header className="hero">
        <div>
          <p className="eyebrow">🎄 Festival de Obsequios Fundasen</p>
          <h1>Ruleta Navideña</h1>
          <p className="subtitle">Comparte en vivo los sorteos de premios. Solo el anfitrión puede lanzar la ruleta con el botón "Obsequio!".</p>
        </div>
        <form className="login" onSubmit={handleLogin}>
          <label>Modo anfitrión</label>
          <div className="login-row">
            <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit">Entrar</button>
          </div>
          {token && <small className="ok">✅ Sesión de anfitrión activa</small>}
        </form>
      </header>

      <main className="grid">
        <section className="panel wheel-card">
          <div className={`wheel ${spinning ? 'spinning' : ''}`}>
            <div className="wheel-inner">
              <div className="wheel-center">🎁</div>
            </div>
          </div>
          <button className="cta" disabled={!token || loadingDraw} onClick={handleDraw}>
            {loadingDraw ? 'Girando...' : 'Obsequio!'}
          </button>
          <p className="helper">Solo el anfitrión puede lanzar la ruleta.</p>
        </section>

        <section className="panel">
          <h2>Últimos ganadores</h2>
          <div className="history">
            {recentWinners.length === 0 && <p className="muted">Aún no hay ganadores</p>}
            {recentWinners.map((winner) => (
              <div className="history-row" key={winner.id}>
                <div>
                  <p className="strong">{winner.person.name}</p>
                  <p className="muted">{winner.prize.name}</p>
                </div>
                <span className="time">{formatDate(winner.awardedAt)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Participantes en espera ({waitingPeople.length})</h2>
          <div className="chips">
            {waitingPeople.map(person => <span key={person.id} className="chip">{person.name}</span>)}
            {waitingPeople.length === 0 && <p className="muted">Todos los asistentes ya tienen obsequio</p>}
          </div>
        </section>

        <section className="panel">
          <h2>Premios restantes ({upcomingPrizes.length})</h2>
          <div className="chips prizes">
            {upcomingPrizes.map(prize => (
              <span key={prize.id} className="chip prize">{prize.name}</span>
            ))}
            {upcomingPrizes.length === 0 && <p className="muted">No quedan premios por asignar</p>}
          </div>
        </section>
      </main>

      {lastWinner && (
        <div className="toast">
          <p className="muted">Nuevo ganador</p>
          <p className="strong">{lastWinner.person.name}</p>
          <p>{lastWinner.prize.name}</p>
        </div>
      )}

      {showModal && lastWinner && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <p className="muted">¡Tenemos ganador!</p>
            <h3 className="winner-name">{lastWinner.person.name}</h3>
            <p className="prize-name">{lastWinner.prize.name}</p>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default App

