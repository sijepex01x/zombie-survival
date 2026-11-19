// audio.js — DEADZONE synth sound engine (W3).
// All sounds are WebAudio oscillators + noise buffers. No audio files.
// Lazy AudioContext: created/resumed on first user gesture via unlock().
// Every public method guards against a missing/suspended context.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  const api = {
    muted: false,
    unlock,
    shoot,
    reload,
    hit,
    zombieDie,
    groan,
    horn,
    pickup,
    buy,
    roar,
    playerHurt,
    gameOver,
    waveClear,
    click,
    explosion,
    alert,
    setMuted,
  };

  function unlock() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        // 1s white-noise buffer, reused by every noise-based sound.
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) {
        ctx = null;
      }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function setMuted(m) {
    api.muted = !!m;
    if (master) master.gain.value = api.muted ? 0 : 0.5;
  }

  // Ready to make sound? (unlock() is called by main.js on first gesture.)
  function ok() {
    return !!ctx && ctx.state === 'running' && !api.muted && !!master;
  }

  // --- low-level synth helpers -------------------------------------------
  function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.15, vol = 0.3, at = 0, curve = 'exp' }) {
    if (!ok()) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(Math.max(1, f1), t0 + dur);
    }
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.1, vol = 0.3, at = 0, freq = 1200, q = 0.8, type = 'lowpass', f1 = null }) {
    if (!ok()) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t0);
    if (f1 !== null) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // --- public sounds ------------------------------------------------------
  function shoot(weapon) {
    if (!ok()) return;
    if (weapon === 'shotgun') {
      noise({ dur: 0.22, vol: 0.55, freq: 900, f1: 120 });
      tone({ type: 'square', f0: 160, f1: 45, dur: 0.18, vol: 0.35 });
    } else if (weapon === 'rifle') {
      noise({ dur: 0.09, vol: 0.42, freq: 2800, f1: 300, type: 'bandpass', q: 1.2 });
      tone({ type: 'square', f0: 320, f1: 90, dur: 0.07, vol: 0.22 });
    } else { // pistol
      noise({ dur: 0.07, vol: 0.35, freq: 2200, f1: 400, type: 'bandpass', q: 1.0 });
      tone({ type: 'square', f0: 240, f1: 110, dur: 0.06, vol: 0.18 });
    }
  }

  function reload() {
    tone({ type: 'square', f0: 900, f1: 500, dur: 0.05, vol: 0.14 });
    tone({ type: 'square', f0: 600, f1: 900, dur: 0.05, vol: 0.16, at: 0.16 });
    noise({ dur: 0.04, vol: 0.12, freq: 3000, type: 'highpass', at: 0.16 });
  }

  function hit() {
    noise({ dur: 0.08, vol: 0.28, freq: 500, f1: 150 });
    tone({ type: 'triangle', f0: 180, f1: 70, dur: 0.08, vol: 0.25 });
  }

  function zombieDie() {
    tone({ type: 'sawtooth', f0: 220, f1: 40, dur: 0.35, vol: 0.22 });
    noise({ dur: 0.18, vol: 0.18, freq: 700, f1: 120 });
  }

  function groan() {
    // Low guttural moan, random pitch each call.
    const base = 70 + Math.random() * 60;
    tone({ type: 'sawtooth', f0: base, f1: base * 0.6, dur: 0.7, vol: 0.10 });
    tone({ type: 'sine', f0: base * 1.5, f1: base * 0.9, dur: 0.55, vol: 0.06, at: 0.05 });
  }

  function horn() {
    // Wave horn: two low brass blasts.
    tone({ type: 'sawtooth', f0: 110, dur: 0.5, vol: 0.28 });
    tone({ type: 'sawtooth', f0: 165, dur: 0.5, vol: 0.18 });
    tone({ type: 'sawtooth', f0: 110, dur: 0.6, vol: 0.28, at: 0.55 });
    tone({ type: 'sawtooth', f0: 165, dur: 0.6, vol: 0.18, at: 0.55 });
  }

  function pickup() {
    tone({ type: 'sine', f0: 660, f1: 990, dur: 0.09, vol: 0.2 });
  }

  function buy() {
    tone({ type: 'sine', f0: 880, dur: 0.08, vol: 0.2 });
    tone({ type: 'sine', f0: 1320, dur: 0.14, vol: 0.2, at: 0.08 });
  }

  function roar() {
    tone({ type: 'sawtooth', f0: 90, f1: 45, dur: 1.1, vol: 0.4 });
    tone({ type: 'sawtooth', f0: 135, f1: 60, dur: 1.0, vol: 0.25, at: 0.05 });
    noise({ dur: 0.9, vol: 0.3, freq: 400, f1: 80 });
  }

  function playerHurt() {
    tone({ type: 'sawtooth', f0: 140, f1: 60, dur: 0.25, vol: 0.35 });
    noise({ dur: 0.15, vol: 0.3, freq: 300, f1: 90 });
  }

  function gameOver() {
    // Slow descending minor phrase.
    const notes = [392, 311, 262, 196];
    notes.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.55, vol: 0.25, at: i * 0.32 }));
    tone({ type: 'sawtooth', f0: 98, f1: 49, dur: 1.4, vol: 0.15, at: 0.2 });
  }

  function waveClear() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.22, at: i * 0.09 }));
  }

  function click() {
    tone({ type: 'square', f0: 1200, f1: 800, dur: 0.04, vol: 0.12 });
  }

  // v2: explosion — low boom + noise burst (grenades, boomers).
  function explosion() {
    tone({ type: 'sine', f0: 120, f1: 35, dur: 0.5, vol: 0.5 });
    noise({ dur: 0.4, vol: 0.45, freq: 900, f1: 120 });
  }

  // v2: alert chime, one per severity — red: low urgent double-beep,
  // yellow: single mid beep, green: pleasant two-note rise.
  function alert(severity) {
    if (severity === 'red') {
      tone({ type: 'square', f0: 220, dur: 0.12, vol: 0.2 });
      tone({ type: 'square', f0: 220, dur: 0.12, vol: 0.2, at: 0.18 });
    } else if (severity === 'green') {
      tone({ type: 'sine', f0: 660, dur: 0.12, vol: 0.2 });
      tone({ type: 'sine', f0: 880, dur: 0.18, vol: 0.2, at: 0.1 });
    } else {
      tone({ type: 'sine', f0: 440, dur: 0.15, vol: 0.2 });
    }
  }

  return api;
}
