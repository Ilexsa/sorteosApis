import React from 'react'

/**
 * Mantén este componente FUERA de App.
 * Si lo defines dentro de App, su referencia cambia en cada render y React puede
 * desmontar/montar el subtree => el <canvas> se recrea y se borra la ruleta.
 */
const Wheel = React.memo(function Wheel({
  canvasId,
  className = '',
  wheelReady,
  targetPrizeName,
  participantName
}) {
  return (
    <div className="wheel-wrapper">
      <div className="wheel-arrow" aria-hidden="true" />
      <div className={`wheel-container ${className}`}>
        <canvas id={canvasId} className="wheel-canvas" aria-label="Ruleta de premios" />
        <div className="wheel-center">
          <p className="eyebrow small">Premio</p>
          <strong>{targetPrizeName || 'Listo para girar'}</strong>
          {participantName ? <p className="helper tiny">Para: {participantName}</p> : null}
        </div>
        {!wheelReady && <div className="wheel-overlay">Cargando WinWheel.js</div>}
      </div>
    </div>
  )
})

export default Wheel
