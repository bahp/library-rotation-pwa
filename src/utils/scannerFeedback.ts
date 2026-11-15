/**
 * Haptic & synthetic Web Audio feedback when a barcode or ISBN scan locks successfully.
 * Fails silently on browsers/environments where Vibration API or Web Audio API are blocked.
 */
export function triggerScanSuccessFeedback(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([50, 50, 50]);
    } catch {
      // Ignore vibration permission errors
    }
  }

  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1318.5, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.17);
    osc.onended = () => {
      try {
        ctx.close().catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    };
  } catch {
    // Ignore autoplay/audio policy blocks
  }
}
