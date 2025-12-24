import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import Wheel from './components/Wheel.jsx'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://10.1.0.6:8080'
const TWEENMAX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/1.20.4/TweenMax.min.js'
const WINWHEEL_URL = 'https://cdn.jsdelivr.net/npm/winwheeljs@2.7.0/dist/Winwheel.min.js'

const COLLAPSE_COUNT = 18

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

function normalizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const normalized = { ...EMPTY_STATE, ...src }

  // Backend a veces puede mandar null en arrays => rompe .length/.map
  normalized.recentWinners = Array.isArray(src.recentWinners) ? src.recentWinners : []
  normalized.upcomingPrizes = Array.isArray(src.upcomingPrizes) ? src.upcomingPrizes : []
  normalized.waitingPeople = Array.isArray(src.waitingPeople) ? src.waitingPeople : []

  return normalized
}

function App() {
  const [raffleState, setRaffleState] = useState(EMPTY_STATE)
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loadingSpin, setLoadingSpin] = useState(false)

  const [wheelSegments, setWheelSegments] = useState(FALLBACK_PRIZES)
  const [targetPrize, setTargetPrize] = useState(null)
  const [spinPerson, setSpinPerson] = useState(null)

  // "spinning" = giro en progreso (lo maneja el backend vía SSE)
  const [spinning, setSpinning] = useState(false)

  const [winner, setWinner] = useState(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [showWheelModal, setShowWheelModal] = useState(false)
  const [selectedParticipantId, setSelectedParticipantId] = useState(null)
  const [wheelReady, setWheelReady] = useState(false)

  const [showAllParticipants, setShowAllParticipants] = useState(false)
  const [showAllPrizes, setShowAllPrizes] = useState(false)

  const stateRef = useRef(EMPTY_STATE)
  const eventSourceRef = useRef(null)
  const reconnectTimer = useRef(null)

  // Refs para que los handlers de SSE no dependan de closures (evita bugs aleatorios)
  const spinningRef = useRef(false)
  const selectedParticipantIdRef = useRef(null)

  const canvasIdRef = useRef('fundasen-wheel-canvas')
  const winwheelRef = useRef(null)
  const winwheelReady = useRef(false)

  const spinPayloadRef = useRef(null) // { segments, target, person }
  const spinTimeoutRef = useRef(null)

  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token])

  const waitingPeople = raffleState.waitingPeople || []
  const upcomingPrizes = raffleState.upcomingPrizes || []

  const remainingPeopleCount = waitingPeople.length
  const remainingPrizesCount = upcomingPrizes.length

  const selectedParticipant = waitingPeople.find((p) => p.id === selectedParticipantId) || null

  const participantsToShow = showAllParticipants ? waitingPeople : waitingPeople.slice(0, COLLAPSE_COUNT)
  const prizesToShow = showAllPrizes ? upcomingPrizes : upcomingPrizes.slice(0, COLLAPSE_COUNT)

  // Mantener refs sincronizados (para SSE handlers estables)
  useEffect(() => {
    spinningRef.current = spinning
  }, [spinning])

  useEffect(() => {
    selectedParticipantIdRef.current = selectedParticipantId
  }, [selectedParticipantId])

  // -------------------------
  // Helpers / WinWheel
  // -------------------------
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

  // IMPORTANTÍSIMO:
  // El <canvas> sin width/height internos se queda en 300x150, y Winwheel puede dibujar fuera (parece "vacío").
  // Ajustamos el tamaño interno SOLO cuando cambie el tamaño real del contenedor.
  const ensureCanvasPixelSize = useCallback(() => {
    const canvas = document.getElementById(canvasIdRef.current)
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const nextW = Math.max(1, Math.floor(rect.width * dpr))
    const nextH = Math.max(1, Math.floor(rect.height * dpr))
    if (canvas.width !== nextW) canvas.width = nextW
    if (canvas.height !== nextH) canvas.height = nextH
    return { canvas, dpr, width: nextW, height: nextH }
  }, [])

  const safeStopWheel = useCallback((wheel) => {
    if (!wheel) return
    // Evita el bug: Winwheel a veces intenta tween.kill() cuando tween es undefined.
    try {
      if (wheel?.animation?.tween) {
        wheel.stopAnimation(false)
        if (wheel.animation.tween.kill) wheel.animation.tween.kill()
      }
    } catch (_) {
      // Ignorar
    }
  }, [])

  const rebuildWheel = useCallback(
    (segments) => {
      if (!winwheelReady.current || !window.Winwheel) return

      // Si el canvas aún no existe (por ejemplo justo al abrir/cerrar el modal), salimos.
      const size = ensureCanvasPixelSize()
      if (!size) return

      const list = segments?.length ? segments : FALLBACK_PRIZES
      const mapped = list.map((prize, idx) => ({
        fillStyle: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
        text: prize.name,
        prizeId: prize.id
      }))

      if (winwheelRef.current) {
        safeStopWheel(winwheelRef.current)
        winwheelRef.current = null
      }

      const minSide = Math.min(size.width, size.height)
      const outerRadius = Math.max(120, Math.floor(minSide / 2) - 8)
      const textFontSize = mapped.length > 96 ? 10 : mapped.length > 64 ? 12 : 14

      winwheelRef.current = new window.Winwheel({
        canvasId: canvasIdRef.current,
        numSegments: mapped.length || 1,
        outerRadius,
        textFontSize,
        textAlignment: 'outer',
        textMargin: 18,
        responsive: false,
        segments: mapped,
        animation: {
          type: 'spinToStop',
          duration: 5.6,
          spins: 7
        }
      })
    },
    [ensureCanvasPixelSize, safeStopWheel]
  )

  const spinToPrize = useCallback(
    (target) => {
      if (!target || !winwheelRef.current || !winwheelReady.current) return

      const wheel = winwheelRef.current

      let segmentNumber = 1
      for (let i = 1; i <= wheel.numSegments; i += 1) {
        // Comparación tolerante (por si id viene string por alguna razón)
        if (`${wheel.segments[i]?.prizeId}` === `${target.id}`) {
          segmentNumber = i
          break
        }
      }

      safeStopWheel(wheel)
      wheel.rotationAngle = 0
      wheel.draw()
      wheel.animation.stopAngle = wheel.getRandomForSegment(segmentNumber)
      wheel.startAnimation()
    },
    [safeStopWheel]
  )

  const loadWinwheel = useCallback(async () => {
    try {
      await ensureScript(TWEENMAX_URL)
      await ensureScript(WINWHEEL_URL)

      if (!window.Winwheel) {
        throw new Error('Winwheel no se cargó (window.Winwheel undefined). Revisa el link del CDN.')
      }

      winwheelReady.current = true
      setWheelReady(true)

      // Render inicial
      rebuildWheel(stateRef.current.upcomingPrizes || FALLBACK_PRIZES)
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la librería de la ruleta')
    }
  }, [ensureScript, rebuildWheel])

  // -------------------------
  // SSE handlers
  // -------------------------
  const handleStateEvent = useCallback((event) => {
    const raw = JSON.parse(event.data || '{}') || {}
    const payload = normalizeState(raw)
    stateRef.current = payload
    setRaffleState(payload)
    setConnectionLost(false)

    // No pisar segmentos durante un giro (usar ref para evitar closures viejos)
    if (!spinningRef.current) {
      const prizes = payload.upcomingPrizes?.length ? payload.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(Array.isArray(prizes) ? prizes : FALLBACK_PRIZES)

      // Auto-selección solo cuando no está girando
      const currentId = selectedParticipantIdRef.current
      if (payload.waitingPeople?.length && !payload.waitingPeople.some((p) => `${p.id}` === `${currentId}`)) {
        selectedParticipantIdRef.current = payload.waitingPeople[0].id
        setSelectedParticipantId(payload.waitingPeople[0].id)
      }
    }
  }, [])

  const handleSpinStart = useCallback((event) => {
    const payload = JSON.parse(event.data || '{}')

    const segments =
      payload?.segments?.length
        ? payload.segments
        : stateRef.current.upcomingPrizes?.length
          ? stateRef.current.upcomingPrizes
          : FALLBACK_PRIZES

    const target = payload?.selectedPrize || segments[0] || null
    const person = payload?.selectedPerson || null

    if (person?.id) {
      selectedParticipantIdRef.current = person.id
      setSelectedParticipantId(person.id)
    }

    setWheelSegments(Array.isArray(segments) ? segments : FALLBACK_PRIZES)
    setWinner(null)
    setShowWheelModal(true)

    setSpinPerson(person)
    setTargetPrize(target)
    spinningRef.current = true
    setSpinning(true)

    spinPayloadRef.current = { segments: Array.isArray(segments) ? segments : FALLBACK_PRIZES, target, person }

    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    spinTimeoutRef.current = setTimeout(() => {
      // Si nunca llegó spin-complete
      setError('No se recibió confirmación del backend (spin-complete). Revisa conexión/SSE.')
      spinningRef.current = false
      setSpinning(false)
    }, 15000)
  }, [])

  const handleSpinComplete = useCallback((event) => {
    const payload = JSON.parse(event.data || '{}')
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current)
      spinTimeoutRef.current = null
    }
    setWinner(payload)
    setTargetPrize(payload?.prize || spinPayloadRef.current?.target || null)
    spinningRef.current = false
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

  // -------------------------
  // API
  // -------------------------
  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/state`)
      if (!res.ok) throw new Error('No se pudo cargar el estado inicial')
      const raw = await res.json()
      const data = normalizeState(raw)

      stateRef.current = data
      setRaffleState(data)

      const prizes = data.upcomingPrizes?.length ? data.upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(Array.isArray(prizes) ? prizes : FALLBACK_PRIZES)

      if (winwheelReady.current) rebuildWheel(prizes)
    } catch (err) {
      setError(err?.message || 'Error cargando estado')
    }
  }, [rebuildWheel])

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
      setError(err?.message || 'Error de login')
    }
  }

  const handleSpinRequest = async () => {
    if (!token) {
      setError('Solo el anfitrión puede lanzar la ruleta')
      return
    }
    if (!selectedParticipantId) {
      setError('Selecciona un participante antes de girar')
      return
    }
    if (!remainingPrizesCount) {
      setError('No hay premios disponibles para asignar')
      return
    }

    setLoadingSpin(true)
    setShowWheelModal(true)
    setWinner(null)
    setError('')

    try {
      // Backend decide el premio y lo emite en SSE (spin-start)
      const res = await fetch(`${API_BASE}/api/spin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ participantId: selectedParticipantId })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo registrar el giro')
      }

      // NO hacemos fetchInitialState aquí: el backend manda state por SSE
    } catch (err) {
      setError(err?.message || 'Error al girar')
      setShowWheelModal(false)
      spinningRef.current = false
      setSpinning(false)
    } finally {
      setLoadingSpin(false)
    }
  }

  const closeWinner = () => {
    setWinner(null)
    setShowWheelModal(false)
    setSpinPerson(null)
    setTargetPrize(null)
    spinningRef.current = false
    spinPayloadRef.current = null
  }

  // -------------------------
  // Effects
  // -------------------------
  useEffect(() => {
    stateRef.current = raffleState
  }, [raffleState])

  // Selección default de participante (pero no durante un giro)
  useEffect(() => {
    if (spinning) return
    if (!waitingPeople.length) {
      setSelectedParticipantId(null)
      return
    }
    if (!waitingPeople.some((p) => `${p.id}` === `${selectedParticipantId}`)) {
      setSelectedParticipantId(waitingPeople[0].id)
    }
  }, [waitingPeople, selectedParticipantId, spinning])

  // Mantener segmentos cuando no está girando
  useEffect(() => {
    if (!spinning) {
      const list = upcomingPrizes.length ? upcomingPrizes : FALLBACK_PRIZES
      setWheelSegments(list)
    }
  }, [spinning, upcomingPrizes])

  // Reconstruir ruleta cuando cambia la data y NO está girando
  useEffect(() => {
    if (!wheelReady) return
    if (spinning) return
    rebuildWheel(wheelSegments)
  }, [wheelSegments, spinning, rebuildWheel, showWheelModal, wheelReady])

  // Iniciar giro cuando llega spin-start (o cuando termina de cargar Winwheel)
  useEffect(() => {
    if (!wheelReady) return
    if (!spinning) return

    const payload = spinPayloadRef.current
    if (!payload?.target) return

    // Espera a que el canvas del modal ya exista (1 frame)
    requestAnimationFrame(() => {
      rebuildWheel(payload.segments || wheelSegments)
      requestAnimationFrame(() => {
        spinToPrize(payload.target)
      })
    })
  }, [spinning, wheelReady, rebuildWheel, spinToPrize, wheelSegments])

  // SSE
  useEffect(() => {
    setupEventStream()
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    }
  }, [setupEventStream])

  // Init
  useEffect(() => {
    loadWinwheel()
    fetchInitialState()
  }, [fetchInitialState, loadWinwheel])

  return (
    <div className="page">
      <SnowOverlay />

      <header className="hero">
        <div>
          <p className="eyebrow">🎁 Sorteo en vivo · Fundasen</p>
          <h1>Ruleta de premios en tiempo real</h1>
          <p className="subtitle">Visualiza participantes en espera, premios disponibles y comparte el giro en todas las pantallas.</p>
          <div className="badges">
            <span className="badge">Concursantes pendientes: {remainingPeopleCount}</span>
            <span className="badge">Premios disponibles: {remainingPrizesCount}</span>
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
                  disabled={spinning || loadingSpin}
                >
                  {waitingPeople.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>

                <button
                  className="ghost"
                  type="button"
                  disabled={spinning || loadingSpin}
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
              <div className="pill muted strong">Premios: {remainingPrizesCount}</div>
              <div className="pill muted strong">Concursantes: {remainingPeopleCount}</div>
            </div>
          </div>

          {/* Evita 2 canvases con el mismo id: la ruleta vive en un solo lugar a la vez */}
          {!showWheelModal && (
            <Wheel
              canvasId={canvasIdRef.current}
              wheelReady={wheelReady}
              targetPrizeName={targetPrize?.name}
              participantName={(spinning ? spinPerson : selectedParticipant)?.name}
            />
          )}

          <div className="cta-row">
            <button className="cta" onClick={handleSpinRequest} disabled={!token || loadingSpin || spinning || !remainingPrizesCount}>
              {loadingSpin ? 'Registrando giro...' : spinning ? 'Girando...' : 'Girar y asignar premio'}
            </button>

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
              <h2>En espera ({remainingPeopleCount})</h2>
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
              <h2>Disponibles ({remainingPrizesCount})</h2>
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
              </div>
              <span className="pill">{wheelSegments.length} sectores</span>
            </div>

            <Wheel
              className="giant"
              canvasId={canvasIdRef.current}
              wheelReady={wheelReady}
              targetPrizeName={targetPrize?.name}
              participantName={(spinning ? spinPerson : selectedParticipant)?.name}
            />

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
            <p className="helper">Listo para el siguiente giro.</p>
            <button className="cta" type="button" onClick={closeWinner}>Continuar</button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  )
}

export default App
