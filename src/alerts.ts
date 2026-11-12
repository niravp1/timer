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

export const soundPlayOptions = [1, 2, 3, 4, 5] as const

export function soundPlayCount(value?: number) {
  return soundPlayOptions.find(option => option === value) ?? 1
}

export async function playSound(sound: AlertSound, plays = 1) {
  const notes = sounds[sound].notes
  if (!notes.length) return
  const context = await prepareSound()
  if (!context) return
  const startAt = context.currentTime
  const spacing = 0.19
  const playLength = (notes.length - 1) * spacing + 0.37
  const playCount = soundPlayCount(plays)
  for (let play = 0; play < playCount; play++) {
    notes.forEach((frequency, index) => {
      const start = startAt + play * (playLength + 0.45) + index * spacing
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
}

let promptedOnStart = false

export function requestNotificationsOnStart() {
  if (promptedOnStart || typeof Notification === 'undefined' ||
      Notification.permission !== 'default' || typeof Notification.requestPermission !== 'function') return
  promptedOnStart = true
  void Notification.requestPermission().catch(() => {})
}

const messages = {
  'focus-complete': { title: 'Focus time is up', body: 'Your break has started.' },
  'break-allowance': { title: 'Break allowance ended', body: 'Your break timer is still counting. Start focus when you’re ready.' },
}

export function notifyTimer(tag: keyof typeof messages) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const { title, body } = messages[tag]
    try { new Notification(title, { body, tag }) }
    catch { /* Some mobile browsers require a service worker for notifications. */ }
  }
}
