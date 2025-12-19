import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://10.1.0.6:8080'

const EMPTY_STATE = {
  remainingPeople: 0,
  remainingPrizes: 0,
  recentWinners: [],
  upcomingPrizes: [],
  waitingPeople: []
}

const FALLBACK_PRIZES = [
  { id: -1, name: 'Ruleta lista', description: '' },
  { id: -2, name: 'En espera', description: '' },
  { id: -3, name: 'Cargando premios', description: '' },
  { id: -4, name: 'Fundasen', description: '' }
]

const SEGMENT_COLORS = ['#f87171', '#fb923c', '#facc15', '#22d3ee', '#34d399', '#60a5fa', '#c084fc', '#f472b6']

const SnowOverlay = () => {
  const flakes = useMemo(
    () =>
      Array.from({ length: 64 }, (_, idx) => ({
        id: idx,
        left: `${Math.random() * 100}%`,
        animationDelay: `${Math.random() * 3}s`,
        animationDuration: `${6 + Math.random() * 4}s`,
        opacity: 0.35 + Math.random() * 0.4,
        fontSize: `${12 + Math.random() * 10}px`
      })),
    []
  )

  return (
    <div className="snow-overlay" aria-hidden="true">
      {flakes.map((flake) => (
        <span
          key={flake.id}
          className="snowflake"
          style={{
            left: flake.left,
            animationDelay: flake.animationDelay,
            animationDuration: flake.animationDuration,
            opacity: flake.opacity,
            fontSize: flake.fontSize
          }}
        >
          ❄
        </span>
      ))}
    </div>
  )
}

function formatDate(value) {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

function launchConfetti() {
  const wrapper = document.createElement('div')
  wrapper.className = 'confetti-wrapper'
  for (let i = 0; i < 140; i += 1) {
    const piece = document.createElement('span')
    piece.className = 'confetti-piece'
    piece.style.left = `${Math.random() * 100}%`
    piece.style.animationDelay = `${Math.random() * 0.5}s`
    piece.style.setProperty('--fall-duration', `${2.2 + Math.random() * 2}s`)
    piece.style.backgroundColor = SEGMENT_COLORS[i % SEGMENT_COLORS.length]
    piece.style.transform = `rotate(${Math.random() * 45}deg)`
    wrapper.appendChild(piece)
  }
  document.body.appendChild(wrapper)
  setTimeout(() => wrapper.remove(), 4200)
}

function App() {
  const [raffleState, setRaffleState] = useState(EMPTY_STATE)
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loadingDraw, setLoadingDraw] = useState(false)
  const [wheelSegments, setWheelSegments] = useState(FALLBACK_PRIZES)
  const [targetPrize, setTargetPrize] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [showWheelModal, setShowWheelModal] = useState(false)
  const [activeSpinId, setActiveSpinId] = useState(null)

  const stateRef = useRef(EMPTY_STATE)
  const rotationRef = useRef(0)
  const pendingSpinRef = useRef(null)

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  useEffect(() => {
    stateRef.current = raffleState
  }, [raffleState])

  useEffect(() => {
    if (!spinning) {
      const list = raffleState.upcomingPrizes?.length ? raffleState.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(list)
    }
  }, [raffleState.upcomingPrizes, spinning])

  const computeTargetRotation = useCallback((segments, target) => {
    if (!segments.length) return rotationRef.current
    const step = 360 / segments.length
    const idx = Math.max(
      segments.findIndex((item) => item.id === target?.id),
      0
    )
    const center = idx * step + step / 2
    const baseTurns = 6 * 360
    const wobble = step * 0.15
    const stopAngle = baseTurns + (360 - center) + (Math.random() * wobble - wobble / 2)
    return rotationRef.current + stopAngle
  }, [])

  const triggerSpin = useCallback(
    (segments, target) => {
      if (!segments.length) return
      const resolvedTarget = target?.id
        ? segments.find((item) => item.id === target.id) || segments[0]
        : segments[0]

      pendingSpinRef.current = resolvedTarget
      setTargetPrize(resolvedTarget)
      const nextRotation = computeTargetRotation(segments, resolvedTarget)
      rotationRef.current = nextRotation
      setRotation(nextRotation)
      setSpinning(true)
      setShowWheelModal(true)
    },
    [computeTargetRotation]
  )

  const handleStateEvent = useCallback((event) => {
    const payload = JSON.parse(event.data || '{}')
    stateRef.current = payload
    setRaffleState(payload)
    setConnectionLost(false)
    if (!spinning) {
      const prizes = payload.upcomingPrizes?.length ? payload.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(prizes)
    }
  }, [spinning])

  const handleSpinStart = useCallback(
    (event) => {
      const payload = JSON.parse(event.data || '{}')
      const segments = payload?.segments?.length
        ? payload.segments
        : stateRef.current.upcomingPrizes?.length
          ? stateRef.current.upcomingPrizes
          : FALLBACK_PRIZES
      const target = payload?.targetPrize || segments[0]
      setActiveSpinId(payload?.startedAt || Date.now().toString())
      setWheelSegments(segments)
      setWinner(null)
      setShowWheelModal(true)
      triggerSpin(segments, target)
    },
    [triggerSpin]
  )

  const handleSpinComplete = useCallback(
    (event) => {
      const payload = JSON.parse(event.data || '{}')
      if (activeSpinId && payload?.startedAt && payload.startedAt !== activeSpinId) return
      setWinner(payload)
      setTargetPrize(payload?.prize || pendingSpinRef.current)
      launchConfetti()
    },
    [activeSpinId]
  )

  useEffect(() => {
    const eventSource = new EventSource(`${API_BASE}/events`)
    eventSource.addEventListener('state', handleStateEvent)
    eventSource.addEventListener('spin-start', handleSpinStart)
    eventSource.addEventListener('spin-complete', handleSpinComplete)
    eventSource.onerror = () => setConnectionLost(true)
    eventSource.onopen = () => setConnectionLost(false)
    return () => eventSource.close()
  }, [handleSpinComplete, handleSpinStart, handleStateEvent])

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`)
      if (!res.ok) throw new Error('No se pudo cargar el estado inicial')
      const data = await res.json()
      stateRef.current = data
      setRaffleState(data)
      const prizes = data.upcomingPrizes?.length ? data.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(prizes)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    fetchInitialState()
  }, [fetchInitialState])

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
    if (!token) {
      setError('Solo el anfitrión puede lanzar la ruleta')
      return
    }
    setLoadingDraw(true)
    setShowWheelModal(true)
    setWinner(null)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ prizeId: 0 })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo ejecutar el sorteo')
      }
    } catch (err) {
      setError(err.message)
      setShowWheelModal(false)
    } finally {
      setLoadingDraw(false)
    }
  }

  const wheelStep = wheelSegments.length ? 360 / wheelSegments.length : 0

  const remainingPeople = raffleState.waitingPeople?.length || 0
  const remainingPrizes = raffleState.upcomingPrizes?.length || 0

  const closeWinner = () => {
    setWinner(null)
    setShowWheelModal(false)
    setActiveSpinId(null)
  }

  const Wheel = ({ className = '' }) => (
    <div className="wheel-wrapper">
      <div className="wheel-arrow" aria-hidden="true" />
      <div
        className={`wheel-container ${spinning ? 'spinning' : ''} ${className}`}
        style={{
          transform: `rotate(${rotation}deg)`,
          transitionDuration: spinning ? '5.5s' : '0.6s'
        }}
        onTransitionEnd={() => setSpinning(false)}
      >
        <div className="wheel-slices">
          {wheelSegments.map((prize, idx) => {
            const angle = idx * wheelStep
            return (
              <div
                key={prize.id}
                className="slice"
                style={{
                  transform: `translateX(-50%) rotate(${angle}deg)`,
                  backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length]
                }}
              >
                <span style={{ transform: `rotate(${-angle}deg)` }}>{prize.name}</span>
              </div>
            )
          })}
        </div>
        <div className="wheel-center">
          <p className="eyebrow small">Premio</p>
          <strong>{targetPrize?.name || 'Listo para girar'}</strong>
        </div>
      </div>
    </div>
  )

  return (
    <div className="page">
      <SnowOverlay />
      <header className="hero">
        <div>
          <p className="eyebrow">🎁 Sorteo en vivo · Fundasen</p>
          <h1>Ruleta de premios en tiempo real</h1>
          <p className="subtitle">
            Visualiza los participantes que aún esperan su premio, los premios disponibles y comparte el giro de la ruleta en todas las pantallas.
            Cada premio es elegido en servidor y la ruleta se alinea automáticamente al ganador.
          </p>
          <div className="badges">
            <span className="badge">Concursantes pendientes: {remainingPeople}</span>
            <span className="badge">Premios disponibles: {remainingPrizes}</span>
            <span className={`badge ${connectionLost ? 'warn' : 'ok'}`}>
              {connectionLost ? 'Reconectando tiempo real...' : 'Tiempo real activo'}
            </span>
          </div>
        </div>
        <form className="auth" onSubmit={handleLogin}>
          <div className="auth-header">
            <p className="eyebrow small">Modo anfitrión</p>
            {token ? <span className="pill ok">Sesión activa</span> : <span className="pill">Necesita clave</span>}
          </div>
          <label className="label" htmlFor="password">Contraseña</label>
          <div className="auth-row">
            <input
              id="password"
              type="password"
              placeholder="Ingresar clave"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit">Entrar</button>
          </div>
          <p className="helper">Solo el anfitrión puede lanzar la ruleta.</p>
        </form>
      </header>

      <main className="grid">
        <section className="panel wheel-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow small">Ruleta sincronizada</p>
              <h2>Premios disponibles</h2>
            </div>
            <div className="pill muted">{wheelSegments.length} sectores</div>
          </div>
          <Wheel />
          <div className="cta-row">
            <button className="cta" onClick={handleDraw} disabled={!token || loadingDraw || spinning}>
              {loadingDraw ? 'Girando...' : 'Lanzar ruleta'}
            </button>
            <p className="helper">
              El premio se selecciona en servidor y la ruleta se detiene justo en el premio asignado para el ganador.
            </p>
          </div>
        </section>

        <section className="panel winners-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow small">Historial</p>
              <h2>Últimos ganadores</h2>
            </div>
          </div>
          <div className="history">
            {raffleState.recentWinners.length === 0 && <p className="muted">Aún no hay ganadores registrados</p>}
            {raffleState.recentWinners.map((item) => (
              <div key={item.id} className="history-row">
                <div>
                  <p className="strong">{item.person.name}</p>
                  <p className="muted">{item.prize.name}</p>
                </div>
                <span className="time">{formatDate(item.awardedAt)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow small">Concursantes</p>
              <h2>En espera ({remainingPeople})</h2>
            </div>
          </div>
          <div className="chips-wrapper">
            <div className="chips">
              {raffleState.waitingPeople.map((person) => (
                <span key={person.id} className="chip">{person.name}</span>
              ))}
              {raffleState.waitingPeople.length === 0 && <p className="muted">Todos los asistentes ya recibieron premio.</p>}
            </div>
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow small">Premios</p>
              <h2>Disponibles ({remainingPrizes})</h2>
            </div>
          </div>
          <div className="chips-wrapper">
            <div className="chips prizes">
              {raffleState.upcomingPrizes.map((prize) => (
                <span key={prize.id} className="chip prize">{prize.name}</span>
              ))}
              {raffleState.upcomingPrizes.length === 0 && <p className="muted">No quedan premios por asignar.</p>}
            </div>
          </div>
        </section>
      </main>

      {showWheelModal && (
        <div className="modal-backdrop wheel-modal">
          <div className="modal-card wheel-stage">
            <div className="modal-heading">
              <div>
                <p className="eyebrow small">Ruleta en vivo</p>
                <h3>{spinning ? 'Girando premio' : 'Premio asignado'}</h3>
                <p className="helper">
                  El premio se determina en servidor y la rueda ya apunta al premio sorteado para el ganador.
                </p>
              </div>
              <span className="pill">{wheelSegments.length} sectores</span>
            </div>
            <Wheel className="giant" />
            {winner && (
              <div className="winner-inline">
                <p className="muted">Ganador</p>
                <p className="strong">{winner.person?.name}</p>
                <p className="prize-highlight">{winner.prize?.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {winner && (
        <div className="modal-backdrop">
          <div className="modal-card winner-card">
            <p className="eyebrow">¡Ganador!</p>
            <h2 className="winner-name">{winner.person?.name}</h2>
            <p className="prize-highlight">{winner.prize?.name}</p>
            <p className="helper">El siguiente giro tomará automáticamente el siguiente premio disponible.</p>
            <button className="cta" type="button" onClick={closeWinner}>Continuar</button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default App
