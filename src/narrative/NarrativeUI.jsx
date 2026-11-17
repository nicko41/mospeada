import { useEffect, useSyncExternalStore } from 'react'
import { subscribeTouchAction } from '../player/touchInput'
import useTouchDevice from '../player/useTouchDevice'
import {
  LETTER_TEXT, getCasetaScene, interactWithCaseta, subscribeCasetaScene,
} from './casetaScene'

export default function NarrativeUI() {
  const touchDevice = useTouchDevice()
  const scene = useSyncExternalStore(subscribeCasetaScene, getCasetaScene)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat) return
      if (event.code === 'KeyE') interactWithCaseta()
    }
    window.addEventListener('keydown', onKeyDown)
    const unsubscribe = subscribeTouchAction('interact', interactWithCaseta)
    return () => { window.removeEventListener('keydown', onKeyDown); unsubscribe() }
  }, [])

  const prompt = scene.focus === 'letter' ? 'E — Leer'
    : scene.focus === 'phone' ? (scene.phoneRinging ? 'E — Atender' : 'E — Probar teléfono') : null
  const dialogue = scene.subtitle

  return <>
    {(dialogue || prompt) && <div className="subtitle-panel" aria-live={dialogue ? 'polite' : 'off'}>
      {dialogue?.speaker && <div className="subtitle-speaker">{dialogue.speaker}</div>}
      <div>{dialogue?.text || (touchDevice ? prompt?.replace('E — ', '') : prompt)}</div>
    </div>}
    {scene.letterOpen && <div className="letter-overlay" role="dialog" aria-modal="true" aria-label="Carta encontrada">
      <div className="letter-content">
        {LETTER_TEXT.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {touchDevice ? <button className="letter-close" onClick={interactWithCaseta}>Cerrar carta</button>
          : <span className="letter-close">E para cerrar</span>}
      </div>
    </div>}
  </>
}
