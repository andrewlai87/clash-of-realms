"use strict";

/*
 * battle.js — cinematic capture battles.
 * When a piece captures, the two combatants meet in an arena overlay.
 * The attacker always wins (chess rules stay pure) — but they earn it.
 *
 * Attack styles by piece type:
 *   p, n, k → melee lunge + slash
 *   b, q    → magic projectile + explosion
 *   r       → golem leap + ground slam
 */
const Battle = (() => {

  let overlay = null;
  let skipped = false;
  let active = [];   // running Animation objects (finished instantly on skip)
  let timers = [];

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function run(target, keyframes, opts) {
    if (skipped) return Promise.resolve();
    const a = target.animate(keyframes, opts);
    active.push(a);
    return a.finished.catch(() => {});
  }

  function wait(ms) {
    if (skipped) return Promise.resolve();
    return new Promise(res => timers.push(setTimeout(res, ms)));
  }

  function skip() {
    skipped = true;
    for (const a of active) { try { a.finish(); } catch (e) { try { a.cancel(); } catch (e2) {} } }
    for (const t of timers) clearTimeout(t);
    timers = [];
  }

  function cleanup() {
    if (overlay) overlay.remove();
    overlay = null;
    active = [];
    timers = [];
  }

  function fighterName(piece) {
    const factionAdj = piece[0] === "w" ? "Ivory" : "Obsidian";
    return `${factionAdj} ${Pieces.TITLES[piece[1]]}`;
  }

  function spawnParticles(arena, x, y, color, count = 10) {
    if (skipped) return;
    for (let i = 0; i < count; i++) {
      const p = el("div", "bt-particle");
      p.style.background = color;
      p.style.left = x + "px";
      p.style.top = y + "px";
      arena.appendChild(p);
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      run(p, [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 30}px) scale(0.2)`, opacity: 0 },
      ], { duration: 500 + Math.random() * 300, easing: "cubic-bezier(0.1,0.6,0.4,1)" }).then(() => p.remove());
    }
  }

  function shake(intensity = 8, duration = 260) {
    if (skipped || !overlay) return Promise.resolve();
    const frames = [];
    for (let i = 0; i < 6; i++) {
      const f = 1 - i / 6;
      frames.push({ transform: `translate(${(Math.random() * 2 - 1) * intensity * f}px, ${(Math.random() * 2 - 1) * intensity * f}px)` });
    }
    frames.push({ transform: "translate(0,0)" });
    return run(overlay, frames, { duration });
  }

  function center(elm, arena) {
    const r = elm.getBoundingClientRect();
    const a = arena.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }

  async function meleeAttack(atk, def, arena, glow) {
    const dist = def.getBoundingClientRect().left - atk.getBoundingClientRect().left - atk.offsetWidth * 0.45;
    // anticipation
    await run(atk, [
      { transform: "translateX(0) rotate(0deg)" },
      { transform: "translateX(-26px) rotate(-7deg)" },
    ], { duration: 240, easing: "ease-out", fill: "forwards" });
    await wait(90);
    // lunge
    Sound.clang();
    await run(atk, [
      { transform: "translateX(-26px) rotate(-7deg)" },
      { transform: `translateX(${dist}px) rotate(6deg)` },
    ], { duration: 190, easing: "cubic-bezier(0.5,0,1,0.6)", fill: "forwards" });
    // slash flash at defender
    const d = center(def, arena);
    const slash = el("div", "bt-slash");
    slash.innerHTML = `<svg viewBox="0 0 100 100"><path d="M15,80 Q50,10 85,25" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M25,90 Q58,30 90,42" stroke="${glow}" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
    slash.style.left = (d.x - 60) + "px";
    slash.style.top = (d.y - 70) + "px";
    arena.appendChild(slash);
    run(slash, [
      { opacity: 0, transform: "scale(0.4) rotate(-20deg)" },
      { opacity: 1, transform: "scale(1.1) rotate(0deg)", offset: 0.3 },
      { opacity: 0, transform: "scale(1.3) rotate(10deg)" },
    ], { duration: 360 }).then(() => slash.remove());
    shake(9);
    spawnParticles(arena, d.x, d.y, glow, 8);
    await wait(140);
    // recoil back a bit
    run(atk, [
      { transform: `translateX(${dist}px) rotate(6deg)` },
      { transform: `translateX(${dist * 0.55}px) rotate(0deg)` },
    ], { duration: 300, easing: "ease-out", fill: "forwards" });
  }

  async function magicAttack(atk, def, arena, glow) {
    // raise staff / gather power
    Sound.magic();
    await run(atk, [
      { transform: "rotate(0deg) translateY(0)" },
      { transform: "rotate(-6deg) translateY(-8px)" },
    ], { duration: 300, easing: "ease-out", fill: "forwards" });
    const a = center(atk, arena);
    const d = center(def, arena);
    // charging orb
    const orb = el("div", "bt-orb");
    orb.style.background = `radial-gradient(circle, #fff 8%, ${glow} 45%, transparent 70%)`;
    orb.style.left = (a.x + 40) + "px";
    orb.style.top = (a.y - 60) + "px";
    arena.appendChild(orb);
    await run(orb, [
      { transform: "scale(0.1)", opacity: 0.3 },
      { transform: "scale(1.15)", opacity: 1 },
    ], { duration: 340, easing: "ease-in", fill: "forwards" });
    // projectile flies
    await run(orb, [
      { transform: "scale(1.15) translate(0,0)" },
      { transform: `scale(0.9) translate(${d.x - a.x - 40}px, ${d.y - 20 - (a.y - 60)}px)` },
    ], { duration: 320, easing: "cubic-bezier(0.4,0,1,0.7)", fill: "forwards" });
    orb.remove();
    // explosion
    Sound.boom();
    const boom = el("div", "bt-boom");
    boom.style.background = `radial-gradient(circle, #fff 5%, ${glow} 35%, transparent 70%)`;
    boom.style.left = (d.x - 70) + "px";
    boom.style.top = (d.y - 90) + "px";
    arena.appendChild(boom);
    run(boom, [
      { transform: "scale(0.2)", opacity: 1 },
      { transform: "scale(1.4)", opacity: 0 },
    ], { duration: 450, easing: "ease-out" }).then(() => boom.remove());
    shake(10);
    spawnParticles(arena, d.x, d.y - 20, glow, 12);
    await wait(160);
    run(atk, [
      { transform: "rotate(-6deg) translateY(-8px)" },
      { transform: "rotate(0deg) translateY(0)" },
    ], { duration: 250, fill: "forwards" });
  }

  async function golemAttack(atk, def, arena, glow) {
    const dist = def.getBoundingClientRect().left - atk.getBoundingClientRect().left - atk.offsetWidth * 0.35;
    // rise
    Sound.magic();
    await run(atk, [
      { transform: "translate(0,0)" },
      { transform: "translate(20px,-90px) rotate(4deg)" },
    ], { duration: 380, easing: "ease-out", fill: "forwards" });
    await wait(110);
    // slam down onto defender
    await run(atk, [
      { transform: "translate(20px,-90px) rotate(4deg)" },
      { transform: `translate(${dist}px, 0) rotate(0deg)` },
    ], { duration: 200, easing: "cubic-bezier(0.6,0,1,0.5)", fill: "forwards" });
    Sound.thud();
    const d = center(def, arena);
    const dust = el("div", "bt-dust");
    dust.style.left = (d.x - 90) + "px";
    arena.appendChild(dust);
    run(dust, [
      { transform: "scaleX(0.3)", opacity: 0.9 },
      { transform: "scaleX(1.5)", opacity: 0 },
    ], { duration: 550, easing: "ease-out" }).then(() => dust.remove());
    shake(14, 380);
    spawnParticles(arena, d.x, d.y + 30, "#b8ab90", 12);
    await wait(180);
    run(atk, [
      { transform: `translate(${dist}px,0)` },
      { transform: `translate(${dist * 0.5}px,0)` },
    ], { duration: 320, easing: "ease-out", fill: "forwards" });
  }

  async function defenderDeath(def, arena, defPiece) {
    Sound.death();
    const d = center(def, arena);
    spawnParticles(arena, d.x, d.y, defPiece[0] === "w" ? "#cfd6e4" : "#5c6070", 8);
    await run(def, [
      { transform: "scaleX(-1) rotate(0deg) translateY(0)", opacity: 1, filter: "brightness(2.2)" },
      { transform: "scaleX(-1) rotate(-14deg) translateY(4px)", opacity: 0.9, filter: "brightness(1)", offset: 0.35 },
      { transform: "scaleX(-1) rotate(-80deg) translateY(30px)", opacity: 0, filter: "brightness(0.6)" },
    ], { duration: 620, easing: "ease-in", fill: "forwards" });
  }

  /**
   * Play a capture battle. attacker/defender are piece codes like "wn", "bp".
   * Returns a promise that resolves when the scene finishes (or is skipped).
   */
  function play(attacker, defender) {
    return new Promise(resolve => {
      skipped = false;
      active = [];
      timers = [];

      overlay = el("div", "battle-overlay");
      const glow = Pieces.palette(attacker[0]).glow;
      const arena = el("div", "battle-arena");
      const ground = el("div", "battle-ground");
      const banner = el("div", "battle-banner",
        `<span class="bt-name">${fighterName(attacker)}</span><span class="bt-vs">⚔</span><span class="bt-name">${fighterName(defender)}</span>`);
      const hint = el("div", "battle-hint", "click to skip");

      const atk = el("div", "bt-fighter bt-attacker", Pieces.svg(attacker[1], attacker[0]));
      const def = el("div", "bt-fighter bt-defender", Pieces.svg(defender[1], defender[0]));
      def.style.transform = "scaleX(-1)";

      arena.append(ground, atk, def);
      overlay.append(banner, arena, hint);
      document.body.appendChild(overlay);

      let done = false;
      const finish = async () => {
        if (done) return;
        done = true;
        overlay.removeEventListener("click", onSkip);
        if (!skipped) {
          banner.innerHTML = `<span class="bt-name bt-victory">${fighterName(attacker)} prevails!</span>`;
          run(atk, [
            { transform: "translateY(0)" },
            { transform: "translateY(-18px)" },
            { transform: "translateY(0)" },
          ], { duration: 360, easing: "ease-out" });
          await wait(650);
          await run(overlay, [{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: "forwards" });
        }
        cleanup();
        resolve();
      };

      const onSkip = () => { skip(); finish(); };
      overlay.addEventListener("click", onSkip);

      (async () => {
        await run(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards" });
        await Promise.all([
          run(atk, [
            { transform: "translateX(-140px)", opacity: 0 },
            { transform: "translateX(0)", opacity: 1 },
          ], { duration: 340, easing: "ease-out" }),
          run(def, [
            { transform: "scaleX(-1) translateX(-140px)", opacity: 0 },
            { transform: "scaleX(-1) translateX(0)", opacity: 1 },
          ], { duration: 340, easing: "ease-out" }),
        ]);
        await wait(320);
        if (!skipped) {
          const t = attacker[1];
          if (t === "b" || t === "q") await magicAttack(atk, def, arena, glow);
          else if (t === "r") await golemAttack(atk, def, arena, glow);
          else await meleeAttack(atk, def, arena, glow);
          await defenderDeath(def, arena, defender);
        }
        if (!skipped) await finish();
      })();
    });
  }

  return { play };
})();
