"use strict";

/*
 * tween3d.js — minimal promise-based tween system driven by the render loop.
 * Tween.to(object, {x: 5, y: 2}, {duration, easing}) animates numeric props.
 * Tween.skipAll() jumps every active tween (and pending wait) to its end —
 * used to make battle scenes skippable.
 */
const Tween = (() => {
  const active = new Set();
  const waiters = new Set();

  const EASE = {
    linear: t => t,
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  };

  function to(obj, props, opts = {}) {
    const duration = opts.duration ?? 300;
    const ease = EASE[opts.easing || "inOut"];
    return new Promise(resolve => {
      const entry = {
        obj, ease, duration,
        start: performance.now(),
        from: {}, target: { ...props },
        onUpdate: opts.onUpdate || null,
        resolve,
      };
      for (const k in props) entry.from[k] = obj[k];
      active.add(entry);
    });
  }

  function wait(ms) {
    return new Promise(resolve => {
      const entry = { resolve, timer: setTimeout(() => { waiters.delete(entry); resolve(); }, ms) };
      waiters.add(entry);
    });
  }

  function update(now) {
    for (const e of active) {
      let t = (now - e.start) / e.duration;
      if (t >= 1) t = 1;
      const v = e.ease(t);
      for (const k in e.target) e.obj[k] = e.from[k] + (e.target[k] - e.from[k]) * v;
      if (e.onUpdate) e.onUpdate(v);
      if (t === 1) { active.delete(e); e.resolve(); }
    }
  }

  function skipAll() {
    for (const e of active) {
      for (const k in e.target) e.obj[k] = e.target[k];
      if (e.onUpdate) e.onUpdate(1);
      e.resolve();
    }
    active.clear();
    for (const w of waiters) { clearTimeout(w.timer); w.resolve(); }
    waiters.clear();
  }

  return { to, wait, update, skipAll, EASE };
})();
