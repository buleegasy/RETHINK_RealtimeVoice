export function playAdminBuzzer(): void {
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;
    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        osc.disconnect();
        gain.disconnect();
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
      } catch {}
    };

    osc.onended = cleanup;
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(cleanup, 500);
  } catch {}
}
