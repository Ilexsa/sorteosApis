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
  for (let i = 0; i < 96; i += 1) {
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
  const [loadingSpin, setLoadingSpin] = useState(false)
  const [wheelSegments, setWheelSegments] = useState(FALLBACK_PRIZES)
  const [targetPrize, setTargetPrize] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [showWheelModal, setShowWheelModal] = useState(false)
  const [selectedParticipantId, setSelectedParticipantId] = useState(null)

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

  useEffect(() => {
    const available = raffleState.waitingPeople || []
    if (!available.length) {
      setSelectedParticipantId(null)
      return
    }
    if (!available.some((person) => person.id === selectedParticipantId)) {
      setSelectedParticipantId(available[0].id)
    }
  }, [raffleState.waitingPeople, selectedParticipantId])

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

  const handleStateEvent = useCallback(
    (event) => {
      const payload = JSON.parse(event.data || '{}')
      stateRef.current = payload
      setRaffleState(payload)
      setConnectionLost(false)
      if (!spinning) {
        const prizes = payload.upcomingPrizes?.length ? payload.upcomingPrizes : FALLBACK_PRIZES
        setWheelSegments(prizes)
      }
      if (payload.waitingPeople?.length && !payload.waitingPeople.some((p) => p.id === selectedParticipantId)) {
        setSelectedParticipantId(payload.waitingPeople[0].id)
      }
    },
    [selectedParticipantId, spinning]
  )

  const handleSpinStart = useCallback(
    (event) => {
      const payload = JSON.parse(event.data || '{}')
      const segments = payload?.segments?.length
        ? payload.segments
        : stateRef.current.upcomingPrizes?.length
          ? stateRef.current.upcomingPrizes
          : FALLBACK_PRIZES
      const target = payload?.selectedPrize || segments[0]
      if (payload?.selectedPerson?.id) {
        setSelectedParticipantId(payload.selectedPerson.id)
      }
      setWheelSegments(segments)
      setWinner(null)
      setShowWheelModal(true)
      triggerSpin(segments, target)
    },
    [triggerSpin]
  )

  const handleSpinComplete = useCallback((event) => {
    const payload = JSON.parse(event.data || '{}')
    setWinner(payload)
    setTargetPrize(payload?.prize || pendingSpinRef.current)
    launchConfetti()
  }, [])

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

  const choosePrizeForWheel = useCallback(() => {
    const segments = raffleState.upcomingPrizes?.length ? raffleState.upcomingPrizes : FALLBACK_PRIZES
    if (!segments.length) return null
    const idx = Math.floor(Math.random() * segments.length)
    return segments[idx]
  }, [raffleState.upcomingPrizes])

  const handleSpinRequest = async () => {
    if (!token) {
      setError('Solo el anfitrión puede lanzar la ruleta')
      return
    }
    if (!selectedParticipantId) {
      setError('Selecciona un participante antes de girar')
      return
    }
    const chosenPrize = choosePrizeForWheel()
    if (!chosenPrize || chosenPrize.id <= 0) {
      setError('No hay premios disponibles para asignar')
      return
    }

    setLoadingSpin(true)
    setShowWheelModal(true)
    setWinner(null)
    setError('')
    pendingSpinRef.current = chosenPrize
    try {
      const res = await fetch(`${API_BASE}/api/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ participantId: selectedParticipantId, prizeId: chosenPrize.id })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo registrar el giro')
      }
    } catch (err) {
      setError(err.message)
      setShowWheelModal(false)
      setSpinning(false)
    } finally {
      setLoadingSpin(false)
    }
  }

  const wheelStep = wheelSegments.length ? 360 / wheelSegments.length : 0
  const labelSize = useMemo(() => {
    const count = wheelSegments.length || 1
    if (count > 96) return 9
    if (count > 72) return 10
    if (count > 48) return 12
    if (count > 32) return 14
    return 16
  }, [wheelSegments.length])
  const wheelDensityClass = useMemo(() => {
    if (wheelSegments.length > 96) return 'wheel-packed'
    if (wheelSegments.length > 64) return 'wheel-dense'
    if (wheelSegments.length > 32) return 'wheel-roomy'
    return ''
  }, [wheelSegments.length])

  const remainingPeople = raffleState.waitingPeople?.length || 0
  const remainingPrizes = raffleState.upcomingPrizes?.length || 0
  const selectedParticipant = raffleState.waitingPeople?.find((p) => p.id === selectedParticipantId)

  const closeWinner = () => {
    setWinner(null)
    setShowWheelModal(false)
  }

  const Wheel = ({ className = '' }) => (
    <div className="wheel-wrapper">
      <div className="wheel-arrow" aria-hidden="true" />
      <div
        className={`wheel-container ${wheelDensityClass} ${spinning ? 'spinning' : ''} ${className}`}
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
                <span style={{ transform: `rotate(${-angle}deg)`, fontSize: `${labelSize}px` }}>{prize.name}</span>
              </div>
            )
          })}
        </div>
        <div className="wheel-center">
          <p className="eyebrow small">Premio</p>
          <strong>{targetPrize?.name || 'Listo para girar'}</strong>
          {selectedParticipant && <p className="helper tiny">Para: {selectedParticipant.name}</p>}
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
            Visualiza los participantes que aún esperan su premio, los premios disponibles y comparte el giro de la ruleta en todas las
            pantallas. La ruleta elige el premio y la API registra al instante la asignación con el participante seleccionado.
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
          <div className="panel-heading wheel-heading">
            <div>
              <p className="eyebrow small">Ruleta sincronizada</p>
              <h2>Premios disponibles</h2>
            </div>
            <div className="pill muted">{wheelSegments.length} sectores</div>
          </div>
          <div className="control-row">
            <div className="control-stack">
              <label className="label" htmlFor="participant">Participante</label>
              <div className="select-row">
                <select
                  id="participant"
                  value={selectedParticipantId || ''}
                  onChange={(e) => setSelectedParticipantId(Number(e.target.value))}
                >
                  {raffleState.waitingPeople.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    if (!raffleState.waitingPeople.length) return
                    const idx = Math.floor(Math.random() * raffleState.waitingPeople.length)
                    setSelectedParticipantId(raffleState.waitingPeople[idx].id)
                  }}
                >
                  Aleatorio
                </button>
              </div>
              <p className="helper tiny">Selecciona quién recibirá el premio en este giro.</p>
            </div>
            <div className="control-stack compact">
              <p className="eyebrow small">Resumen</p>
              <div className="pill muted strong">Premios: {remainingPrizes}</div>
              <div className="pill muted strong">Concursantes: {remainingPeople}</div>
            </div>
          </div>
          <Wheel />
          <div className="cta-row">
            <button className="cta" onClick={handleSpinRequest} disabled={!token || loadingSpin || spinning || !remainingPrizes}>
              {loadingSpin ? 'Registrando giro...' : 'Girar y asignar premio'}
            </button>
            <p className="helper">
              La ruleta elige el premio de forma visual y el backend guarda el resultado en cuanto se publica el giro.
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
                  El premio lo decide la ruleta y la API valida la asignación antes de mostrarla en pantalla.
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
