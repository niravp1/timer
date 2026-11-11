export const sounds = {
  chime: { label: 'Soft chime', notes: [659, 784, 988] },
  bell: { label: 'Double bell', notes: [880, 880] },
  silent: { label: 'Silent', notes: [] },
} as const

export type AlertSound = keyof typeof sounds
let audio: AudioContext | undefined

export async function prepareSound() {
  if (!window.AudioContext) return
  audio ??= new AudioContext()
  if (audio.state === 'suspended') await audio.resume()
  return audio
}

export async function playSound(sound: AlertSound) {
  const notes = sounds[sound].notes
  if (!notes.length) return
  const context = await prepareSound()
  if (!context) return
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.19
    const tone = context.createOscillator()
    const volume = context.createGain()
    tone.type = 'sine'
    tone.frequency.value = frequency
    volume.gain.setValueAtTime(0.001, start)
    volume.gain.exponentialRampToValueAtTime(0.19, start + 0.025)
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.36)
    tone.connect(volume).connect(context.destination)
    tone.start(start)
    tone.stop(start + 0.37)
    tone.onended = () => { tone.disconnect(); volume.disconnect() }
  })
}

export function notifyFocusComplete() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification('Focus time is up', { body: 'Your break has started.', tag: 'focus-complete' }) }
    catch { /* Some mobile browsers require a service worker for notifications. */ }
  }
}
