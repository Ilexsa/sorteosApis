import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://10.1.0.6:8080'
const TWEENMAX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/1.20.4/TweenMax.min.js'
const WINWHEEL_URL = 'https://cdn.jsdelivr.net/npm/winwheel@2.9.0/Winwheel.min.js'

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
  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [showWheelModal, setShowWheelModal] = useState(false)
  const [selectedParticipantId, setSelectedParticipantId] = useState(null)
  const [wheelReady, setWheelReady] = useState(false)

  const stateRef = useRef(EMPTY_STATE)
  const pendingSpinRef = useRef(null)
  const eventSourceRef = useRef(null)
  const reconnectTimer = useRef(null)
  const canvasIdRef = useRef('fundasen-wheel-canvas')
  const winwheelRef = useRef(null)
  const winwheelReady = useRef(false)

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])
  const waitingPeople = raffleState.waitingPeople || []
  const upcomingPrizes = raffleState.upcomingPrizes || []
  const remainingPeople = waitingPeople.length
  const remainingPrizes = upcomingPrizes.length
  const selectedParticipant = waitingPeople.find((p) => p.id === selectedParticipantId)
  const participantsToShow = showAllParticipants
    ? waitingPeople
    : waitingPeople.slice(0, COLLAPSE_COUNT)
  const prizesToShow = showAllPrizes
    ? upcomingPrizes
    : upcomingPrizes.slice(0, COLLAPSE_COUNT)

  useEffect(() => {
    stateRef.current = raffleState
  }, [raffleState])

  useEffect(() => {
    if (!spinning) {
      const list = upcomingPrizes.length ? upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(list)
    }
  }, [spinning, upcomingPrizes])

  useEffect(() => {
    const available = waitingPeople
    if (!available.length) {
      setSelectedParticipantId(null)
      return
    }
    if (!available.some((person) => person.id === selectedParticipantId)) {
      setSelectedParticipantId(available[0].id)
    }
  }, [raffleState.waitingPeople, selectedParticipantId])

  useEffect(() => {
    if (winwheelReady.current) {
      rebuildWheel(wheelSegments)
    }
  }, [rebuildWheel, wheelSegments])

  useEffect(() => {
    if (winwheelReady.current && spinning && pendingSpinRef.current) {
      spinToPrize(pendingSpinRef.current)
    }
  }, [spinning, spinToPrize])

  const ensureScript = useCallback(
    (src) =>
      new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`)
        if (existing?.dataset.loaded === 'true') {
          resolve()
          return
        }
        const script = existing || document.createElement('script')
        script.src = src
        script.async = true
        script.onload = () => {
          script.dataset.loaded = 'true'
          resolve()
        }
        script.onerror = () => reject(new Error(`No se pudo cargar el script ${src}`))
        if (!existing) document.body.appendChild(script)
      }),
    []
  )

  const rebuildWheel = useCallback((segments) => {
    if (!winwheelReady.current || !window.Winwheel) return
    const mapped = (segments.length ? segments : FALLBACK_PRIZES).map((prize, idx) => ({
      fillStyle: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
      text: prize.name,
      prizeId: prize.id
    }))

    if (winwheelRef.current) {
      winwheelRef.current.stopAnimation(false)
      winwheelRef.current = null
    }

    winwheelRef.current = new window.Winwheel({
      canvasId: canvasIdRef.current,
      numSegments: mapped.length || 1,
      outerRadius: 320,
      textFontSize: mapped.length > 96 ? 10 : mapped.length > 64 ? 12 : 14,
      textAlignment: 'outer',
      textMargin: 18,
      responsive: true,
      segments: mapped,
      animation: {
        type: 'spinToStop',
        duration: 5.6,
        spins: 7,
        callbackFinished: () => setSpinning(false)
      }
    })
  }, [])

  const spinToPrize = useCallback((target) => {
    if (!target || !winwheelRef.current || !winwheelReady.current) return
    const wheel = winwheelRef.current
    let segmentNumber = 1
    for (let i = 1; i <= wheel.numSegments; i += 1) {
      if (wheel.segments[i]?.prizeId === target.id) {
        segmentNumber = i
        break
      }
    }
    pendingSpinRef.current = target
    wheel.stopAnimation(false)
    wheel.rotationAngle = 0
    wheel.draw()
    wheel.animation.stopAngle = wheel.getRandomForSegment(segmentNumber)
    setSpinning(true)
    wheel.startAnimation()
  }, [])

  const loadWinwheel = useCallback(async () => {
    try {
      await ensureScript(TWEENMAX_URL)
      await ensureScript(WINWHEEL_URL)
      winwheelReady.current = true
      setWheelReady(true)
      rebuildWheel(stateRef.current.upcomingPrizes || FALLBACK_PRIZES)
    } catch (err) {
      setError(err.message || 'No se pudo cargar la librería de la ruleta')
    }
  }, [ensureScript, rebuildWheel])

  const handleStateEvent = useCallback(
    (event) => {
      const payload = { ...EMPTY_STATE, ...(JSON.parse(event.data || '{}') || {}) }
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
      pendingSpinRef.current = target
      setTargetPrize(target)
      setSpinning(true)
      if (winwheelReady.current) {
        spinToPrize(target)
      }
    },
    [spinToPrize]
  )

  const handleSpinComplete = useCallback((event) => {
    const payload = JSON.parse(event.data || '{}')
    setWinner(payload)
    setTargetPrize(payload?.prize || pendingSpinRef.current)
    pendingSpinRef.current = null
    setSpinning(false)
    launchConfetti()
  }, [])

  const setupEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }
    const es = new EventSource(`${API_BASE}/events`)
    eventSourceRef.current = es
    es.addEventListener('state', handleStateEvent)
    es.addEventListener('spin-start', handleSpinStart)
    es.addEventListener('spin-complete', handleSpinComplete)
    es.onerror = () => {
      setConnectionLost(true)
      es.close()
      if (!reconnectTimer.current) {
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null
          setupEventStream()
        }, 1500)
      }
    }
    es.onopen = () => setConnectionLost(false)
  }, [handleSpinComplete, handleSpinStart, handleStateEvent])

  useEffect(() => {
    setupEventStream()
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [setupEventStream])

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`)
      if (!res.ok) throw new Error('No se pudo cargar el estado inicial')
      const data = await res.json()
      stateRef.current = data
      setRaffleState(data)
      const prizes = data.upcomingPrizes?.length ? data.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(prizes)
      rebuildWheel(prizes)
    } catch (err) {
      setError(err.message)
    }
  }, [rebuildWheel])

  useEffect(() => {
    loadWinwheel()
    fetchInitialState()
  }, [fetchInitialState, loadWinwheel])

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
    const segments = upcomingPrizes.length ? upcomingPrizes : FALLBACK_PRIZES
    if (!segments.length) return null
    const idx = Math.floor(Math.random() * segments.length)
    return segments[idx]
  }, [upcomingPrizes])

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
      fetchInitialState()
    } catch (err) {
      setError(err.message)
      setShowWheelModal(false)
      setSpinning(false)
    } finally {
      setLoadingSpin(false)
    }
  }

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
      <div className={`wheel-container ${className}`}>
        <canvas
          id={canvasIdRef.current}
          className="wheel-canvas"
          width="720"
          height="720"
          aria-label="Ruleta de premios"
        />
        <div className="wheel-center">
          <p className="eyebrow small">Premio</p>
          <strong>{targetPrize?.name || 'Listo para girar'}</strong>
          {selectedParticipant && <p className="helper tiny">Para: {selectedParticipant.name}</p>}
        </div>
        {!wheelReady && <div className="wheel-overlay">Cargando WinWheel.js</div>}
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
                  {waitingPeople.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    if (!waitingPeople.length) return
                    const idx = Math.floor(Math.random() * waitingPeople.length)
                    setSelectedParticipantId(waitingPeople[idx].id)
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
                {participantsToShow.map((person) => (
                  <span key={person.id} className="chip">{person.name}</span>
                ))}
              {waitingPeople.length === 0 && <p className="muted">Todos los asistentes ya recibieron premio.</p>}
              </div>
            {waitingPeople.length > COLLAPSE_COUNT && (
              <div className="see-more-row">
                <button type="button" className="ghost small" onClick={() => setShowAllParticipants((v) => !v)}>
                  {showAllParticipants ? 'Ver menos' : 'Ver más'}
                </button>
              </div>
            )}
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
                {prizesToShow.map((prize) => (
                  <span key={prize.id} className="chip prize">{prize.name}</span>
                ))}
              {upcomingPrizes.length === 0 && <p className="muted">No quedan premios por asignar.</p>}
              </div>
            {upcomingPrizes.length > COLLAPSE_COUNT && (
              <div className="see-more-row">
                <button type="button" className="ghost small" onClick={() => setShowAllPrizes((v) => !v)}>
                  {showAllPrizes ? 'Ver menos' : 'Ver más'}
                </button>
              </div>
            )}
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
