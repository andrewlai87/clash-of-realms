"use strict";

/*
 * sound.js — small synthesized sound effects via WebAudio.
 * No audio files; everything is generated. Muted state persists.
 */
const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem("cor-muted") === "1";

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // iOS only allows audio started from a user gesture. Create/resume the
  // context on every early tap (regardless of mute state) so that sounds
  // fired later from async battle animations are already unlocked.
  function unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) { try { ctx = new AC(); } catch (e) { return; } }
    if (ctx.state === "suspended") ctx.resume();
    if (ctx.state === "running") document.removeEventListener("pointerdown", unlock);
  }
  document.addEventListener("pointerdown", unlock, { passive: true });

  function tone(freq, dur, type = "sine", vol = 0.15, when = 0, slideTo = null) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, filterFreq = 1000, vol = 0.2, when = 0, q = 1) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  return {
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      localStorage.setItem("cor-muted", m ? "1" : "0");
    },
    move()    { tone(220, 0.08, "triangle", 0.18); noise(0.05, 800, 0.08); },
    select()  { tone(330, 0.05, "triangle", 0.10); },
    clang()   { noise(0.15, 2600, 0.25, 0, 4); tone(1300, 0.12, "square", 0.06); tone(880, 0.18, "triangle", 0.08, 0.02); },
    thud()    { noise(0.22, 220, 0.4, 0, 0.8); tone(70, 0.25, "sine", 0.3, 0, 40); },
    magic()   { tone(440, 0.3, "sine", 0.12, 0, 1320); tone(660, 0.25, "triangle", 0.08, 0.05, 1760); },
    boom()    { noise(0.35, 400, 0.35, 0, 0.7); tone(120, 0.3, "sawtooth", 0.12, 0, 50); },
    zap()     { noise(0.12, 5200, 0.3, 0, 0.6); tone(1900, 0.09, "sawtooth", 0.07, 0, 180); noise(0.4, 260, 0.22, 0.05, 0.7); },
    fire()    { noise(0.5, 700, 0.16, 0, 0.6); tone(170, 0.4, "sawtooth", 0.05, 0, 85); },
    death()   { tone(300, 0.35, "sawtooth", 0.1, 0, 90); noise(0.2, 600, 0.1, 0.05); },
    check()   { tone(523, 0.12, "square", 0.08); tone(494, 0.2, "square", 0.08, 0.12); },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", 0.15, i * 0.14)); },
    defeat()  { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, "triangle", 0.13, i * 0.16)); },
  };
})();
