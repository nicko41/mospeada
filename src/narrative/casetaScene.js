export const LETTER_TEXT = `12 de julio

No sé para quién escribo esto.
Capaz para el próximo que quede varado por acá.

Si salís a la ruta y los kilómetros empiezan a aumentar, volvé.

Al principio pensé que habían cambiado los carteles. Después pensé que estaba cansado.

Caminé durante horas.

No importa cuánto avances.
La ruta no te lleva a ningún lado cuando empieza la niebla.

Detrás de esta caseta sale un camino de mantenimiento. Seguilo hasta la instalación vieja, junto a la laguna.

La última vez todavía había luz.

Y si escuchás a alguien llamándote desde el campo…

no le contestes.

— R.`

// audioId/audioSrc can be filled when recorded dialogue is available.
export const PHONE_DIALOGUE = [
  { text: '...', duration: 1600, speaker: null, audioId: null },
  { text: '', duration: 700, speaker: null, audioId: null },
  { text: 'La encontraste.', duration: 2100, speaker: null, audioId: null },
  { text: 'La carta.', duration: 1800, speaker: null, audioId: null },
  { text: '', duration: 850, speaker: null, audioId: null },
  { text: 'No vuelvas a la ruta.', duration: 2500, speaker: null, audioId: null },
  { text: 'Seguí el camino de servicio.', duration: 2600, speaker: null, audioId: null },
  { text: 'Hay una instalación junto al agua.', duration: 2800, speaker: null, audioId: null },
  { text: '', duration: 850, speaker: null, audioId: null },
  { text: 'Él también fue.', duration: 2200, speaker: null, audioId: null },
  { text: 'No llegó.', duration: 2600, speaker: null, audioId: null },
  { text: '', duration: 1100, speaker: null, audioId: null },
]

let state = {
  highwaySignsSeen: 0,
  highwayAnomalySeen: false,
  highwayLoopCompleted: false,
  letterOpen: false,
  letterRead: false,
  phoneRinging: false,
  phoneAnswered: false,
  phoneCallFinished: false,
  phoneTestInProgress: false,
  gamePhase: 'explore',
  apparitionIntensity: 'normal',
  focus: null,
  subtitle: null,
}
const listeners = new Set()
let audioContext = null
let ringNodes = null

export const getCasetaScene = () => state
export const subscribeCasetaScene = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function update(patch) {
  if (Object.entries(patch).every(([key, value]) => state[key] === value)) return
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

const CASETA_UNLOCK_SIGN_COUNT = 2

export function recordHighwaySigns(count) {
  const highwaySignsSeen = Math.max(state.highwaySignsSeen, count)
  // The second distance sign establishes the anomaly; finishing the entire loop is optional.
  const highwayAnomalySeen = state.highwayAnomalySeen || highwaySignsSeen >= CASETA_UNLOCK_SIGN_COUNT
  if (highwaySignsSeen === state.highwaySignsSeen && highwayAnomalySeen === state.highwayAnomalySeen) return
  update({ highwaySignsSeen, highwayAnomalySeen })
}

export function completeHighwayLoop() {
  update({ highwayLoopCompleted: true, highwayAnomalySeen: true })
}

export function setCasetaFocus(focus) {
  update({ focus })
}

function prepareRingAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return
  audioContext ??= new AudioContextClass()
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
}

function startRingAudio() {
  if (!audioContext || ringNodes) return
  const gain = audioContext.createGain()
  gain.gain.value = 0
  gain.connect(audioContext.destination)
  const tones = [440, 480].map((frequency) => {
    const oscillator = audioContext.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    oscillator.connect(gain)
    oscillator.start()
    return oscillator
  })
  const pulse = () => {
    const now = audioContext.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(0, now)
    for (const offset of [0, 0.67]) {
      gain.gain.setValueAtTime(0, now + offset)
      gain.gain.linearRampToValueAtTime(0.05, now + offset + 0.025)
      gain.gain.setValueAtTime(0.05, now + offset + 0.38)
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.43)
    }
  }
  pulse()
  ringNodes = { gain, tones, interval: window.setInterval(pulse, 3400) }
}

function stopRingAudio() {
  if (!ringNodes) return
  window.clearInterval(ringNodes.interval)
  ringNodes.gain.gain.cancelScheduledValues(audioContext.currentTime)
  ringNodes.gain.gain.setValueAtTime(0, audioContext.currentTime)
  ringNodes.tones.forEach((tone) => tone.stop())
  ringNodes.gain.disconnect()
  ringNodes = null
}

function closeLetter() {
  update({ letterOpen: false, letterRead: true })
  if (state.phoneRinging || state.phoneAnswered || state.phoneCallFinished) return
  prepareRingAudio()
  update({ phoneRinging: true })
  startRingAudio()
}

function playDialogue(index = 0) {
  if (index >= PHONE_DIALOGUE.length) {
    update({ subtitle: null, phoneCallFinished: true, gamePhase: 'go_to_station', apparitionIntensity: 'clearer' })
    return
  }
  const line = PHONE_DIALOGUE[index]
  update({ subtitle: line.text ? line : null })
  if (!line.audioSrc) {
    window.setTimeout(() => playDialogue(index + 1), line.duration)
    return
  }
  // When a recording is supplied, its ending advances the subtitle; duration remains the fallback.
  const audio = new Audio(line.audioSrc)
  let advanced = false
  const advance = () => {
    if (advanced) return
    advanced = true
    playDialogue(index + 1)
  }
  audio.addEventListener('ended', advance, { once: true })
  audio.addEventListener('error', () => window.setTimeout(advance, line.duration), { once: true })
  audio.play().catch(() => window.setTimeout(advance, line.duration))
}

export function interactWithCaseta() {
  if (state.letterOpen) {
    closeLetter()
    return
  }
  if (state.phoneTestInProgress) return
  if (state.focus === 'letter' && state.highwayAnomalySeen) {
    update({ letterOpen: true, focus: null })
  } else if (state.focus === 'phone' && !state.letterRead && !state.phoneRinging) {
    update({ phoneTestInProgress: true, focus: null })
    window.setTimeout(() => update({ subtitle: { text: 'Nada... muerto.', speaker: null } }), 750)
    window.setTimeout(() => update({ phoneTestInProgress: false, subtitle: null }), 2800)
  } else if (state.focus === 'phone' && state.phoneRinging && !state.phoneAnswered) {
    stopRingAudio()
    update({ phoneRinging: false, phoneAnswered: true, focus: null })
    window.setTimeout(() => playDialogue(), 1000)
  }
}
