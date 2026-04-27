/** Short optional chime when a hot lead appears (best-effort; may be blocked until user gesture). */
export function playHotLeadChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.06
    osc.connect(gain)
    gain.connect(ctx.destination)
    const t0 = ctx.currentTime
    osc.start(t0)
    osc.stop(t0 + 0.14)
    osc.onended = () => {
      try {
        void ctx.close()
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* autoplay policy or missing API */
  }
}
