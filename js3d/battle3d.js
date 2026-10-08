"use strict";

/*
 * battle3d.js — cinematic capture battles fought ON the board.
 * The camera swoops down to the action, the attacker charges the defender,
 * strikes (melee / spell / golem slam), the defender topples and sinks,
 * and the attacker claims the square. Click anywhere to skip.
 */
const Battle3D = (() => {

  let skipped = false;
  let skipResolvers = [];

  const tw = (obj, props, opts) =>
    skipped ? (Object.assign(obj, props), opts?.onUpdate?.(1), Promise.resolve()) : Tween.to(obj, props, opts);
  const pause = ms => (skipped ? Promise.resolve() : Tween.wait(ms));

  // play an animation clip once; resolves early if the battle is skipped
  function clip(g, name) {
    if (skipped || !g.userData.skinned) return Promise.resolve();
    return Promise.race([
      g.userData.playOnce(name),
      new Promise(res => skipResolvers.push(res)),
    ]);
  }

  function skip() {
    if (skipped) return;
    skipped = true;
    Tween.skipAll();
    for (const r of skipResolvers) r();
    skipResolvers = [];
  }

  // the 3D set's own creatures, where they differ from the classic titles
  const CREATURES = { wr: "Ancient Treant", br: "Magma Golem", wn: "Sun Phoenix", bn: "Obsidian Wyvern", bb: "Obsidian Pyromancer", wq: "Seraph Queen", bq: "Nyx, Queen of Night", bk: "Vampire Lord", wb: "Archmage of Light" };

  function fighterName(piece) {
    return CREATURES[piece] || `${piece[0] === "w" ? "Ivory" : "Obsidian"} ${Pieces.TITLES[piece[1]]}`;
  }

  function faceYaw(g, targetYaw, duration = 220) {
    const cur = g.rotation.y;
    let delta = (targetYaw - cur) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return tw(g.rotation, { y: cur + delta }, { duration, easing: "inOut" });
  }

  async function meleeStrike(atk, def, dir, glowColor) {
    if (atk.userData.skinned) {
      const swing = clip(atk, atk.userData.attack);
      tw(atk.position, { x: atk.position.x + dir.x * 0.22, z: atk.position.z + dir.z * 0.22 },
         { duration: 260, easing: "inOut" });
      await pause(380);   // impact lands mid-clip
      Sound.clang();
      Board3D.spawnBurst(hitPoint(def), glowColor, 16);
      Board3D.shake(0.09);
      flashHit(def);
      clip(def, "Hit_A");
      await swing;
      return;
    }
    const armR = atk.userData.parts && atk.userData.parts.armR;
    const isLance = atk.userData.type === "n";
    // windup: raise the weapon arm (lancers couch instead of chopping)
    await Promise.all([
      tw(atk.rotation, { x: 0.24 }, { duration: 240, easing: "out" }),
      armR && !isLance ? tw(armR.rotation, { x: 2.4 }, { duration: 240, easing: "out" }) : null,
    ].filter(Boolean));
    await pause(90);
    // lunge + swing
    Sound.clang();
    const lx = atk.position.x + dir.x * 0.45, lz = atk.position.z + dir.z * 0.45;
    await Promise.all([
      tw(atk.position, { x: lx, z: lz }, { duration: 150, easing: "in" }),
      tw(atk.rotation, { x: -0.32 }, { duration: 150, easing: "in" }),
      armR ? tw(armR.rotation, { x: isLance ? 1.5 : 0.5 }, { duration: 140, easing: "in" }) : null,
    ].filter(Boolean));
    Board3D.spawnBurst(hitPoint(def), glowColor, 16);
    Board3D.shake(0.09);
    flashHit(def);
    await pause(160);
    await Promise.all([
      tw(atk.position, { x: atk.position.x - dir.x * 0.3, z: atk.position.z - dir.z * 0.3 }, { duration: 260, easing: "out" }),
      tw(atk.rotation, { x: 0 }, { duration: 260, easing: "out" }),
      armR ? tw(armR.rotation, { x: atk.userData.restArmR || 0 }, { duration: 260, easing: "out" }) : null,
    ].filter(Boolean));
  }

  // ================= spells =================
  // Each caster has its own: the Ivory mage throws lightning, the Ivory
  // queen sends a wave of light off her blade, the Obsidian mage hurls a
  // fireball and the Obsidian queen calls a storm down from above.
  const SPELLS = { wb: "lightning", wq: "blade", bb: "fireball", bq: "storm" };
  const SPELL_REACH = { lightning: 2.4, fireball: 2.4, storm: 2.6, blade: 1.7 };
  const SPELL_COLOR = { lightning: 0x7fc8ff, blade: 0xffa53a, fireball: 0xff7a1e, storm: 0xb36bff };

  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  // unlit additive mesh, bright enough to bloom
  function glowMesh(geo, hex, k = 3, opacity = 1) {
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: hdr(hex, k), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  }

  function discard(obj) {
    Board3D.scene.remove(obj);
    obj.traverse(o => { if (o.material) o.material.dispose(); });
  }

  function flashLight(pos, hex, intensity, ms, range = 7) {
    if (skipped) return;
    const l = new THREE.PointLight(hex, intensity, range);
    l.position.copy(pos);
    Board3D.scene.add(l);
    const s = { i: intensity };
    Tween.to(s, { i: 0 }, { duration: ms, easing: "out", onUpdate: () => { l.intensity = s.i; } })
      .then(() => Board3D.scene.remove(l));
  }

  const castOrigin = (atk, dir) => atk.position.clone()
    .add(new THREE.Vector3(0, (atk.userData.height || 1.2) * 0.8, 0))
    .addScaledVector(dir, 0.3);

  // casting gesture; resolves when the caster has finished it
  function castPose(atk) {
    if ("castAmt" in atk.userData) {
      // pose-only caster: its arms are raised in code
      return (async () => {
        await tw(atk.userData, { castAmt: 1 }, { duration: 320, easing: "out" });
        await pause(650);
        await tw(atk.userData, { castAmt: 0 }, { duration: 380, easing: "inOut" });
      })();
    }
    if (atk.userData.skinned) return clip(atk, "Spellcast_Shoot");
    const armR = atk.userData.parts && atk.userData.parts.armR;
    return (async () => {
      await Promise.all([
        tw(atk.rotation, { x: 0.14 }, { duration: 300, easing: "out" }),
        armR ? tw(armR.rotation, { x: 2.9 }, { duration: 300, easing: "out" }) : null,
      ].filter(Boolean));
      await pause(500);
      tw(atk.rotation, { x: 0 }, { duration: 250, easing: "out" });
      if (armR) tw(armR.rotation, { x: atk.userData.restArmR || 0 }, { duration: 250, easing: "out" });
    })();
  }

  const UNIT_TUBE = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  // one jagged bolt between two points (rebuilt every few frames to flicker)
  function makeBolt(from, to, hex, width = 0.05, jag = 0.22, forks = 2) {
    const g = new THREE.Group();
    const axis = to.clone().sub(from);
    const side = new THREE.Vector3(axis.z, 0, -axis.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = axis.clone().cross(side).normalize();
    const n = Math.max(5, Math.round(axis.length() / 0.26));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const p = from.clone().lerp(to, i / n);
      if (i > 0 && i < n) {
        p.addScaledVector(side, (Math.random() - 0.5) * jag).addScaledVector(up, (Math.random() - 0.5) * jag);
      }
      pts.push(p);
    }
    const seg = (a, b, w, color, k, op) => {
      const m = glowMesh(UNIT_TUBE, color, k, op);
      const d = b.clone().sub(a), len = d.length();
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(Y_AXIS, d.normalize());
      m.scale.set(w, len, w);
      g.add(m);
    };
    for (let i = 0; i < n; i++) {
      seg(pts[i], pts[i + 1], width * 0.4, 0xffffff, 6, 1);
      seg(pts[i], pts[i + 1], width, hex, 2.2, 0.55);
    }
    for (let f = 0; f < forks; f++) {
      let a = pts[1 + Math.floor(Math.random() * (n - 1))].clone();
      for (let j = 0; j < 3; j++) {
        const b = a.clone().addScaledVector(axis, 0.07)
          .addScaledVector(side, (Math.random() - 0.5) * 0.5).addScaledVector(up, (Math.random() - 0.5) * 0.5);
        seg(a, b, width * 0.45, hex, 3, 0.8);
        a = b;
      }
    }
    return g;
  }

  async function flickerBolt(from, to, hex, times, width, jag) {
    for (let i = 0; i < times && !skipped; i++) {
      const b = makeBolt(from, to, hex, width, jag);
      Board3D.scene.add(b);
      await pause(48);
      discard(b);
    }
  }

  async function lightningSpell(atk, def, dir, hex) {
    Sound.magic();
    const cast = castPose(atk);
    const origin = () => (atk.userData.castFrom
      ? atk.userData.castFrom.getWorldPosition(new THREE.Vector3()) : castOrigin(atk, dir));
    const start = origin();
    const spark = glowMesh(new THREE.IcosahedronGeometry(0.07, 1), hex, 5);
    spark.position.copy(start);
    if (!skipped) Board3D.scene.add(spark);
    flashLight(start, hex, 2.5, 420, 4);
    const s = { k: 0.3 };
    await tw(s, { k: 1.5 }, { duration: 300, easing: "in", onUpdate: () => { spark.position.copy(origin()); spark.scale.setScalar(s.k * (0.8 + Math.random() * 0.4)); } });
    start.copy(origin());
    const end = hitPoint(def);
    Sound.zap();
    Board3D.shake(0.12);
    flashHit(def, 0xbfe4ff);
    clip(def, "Hit_A");
    flashLight(end, hex, 9, 480);
    Board3D.spawnBurst(end, 0xd8eeff, 22, 3.4);
    await flickerBolt(start, end, hex, 6, 0.05, 0.24);
    discard(spark);
    Board3D.spawnBurst(end, hex, 10, 1.6);
    await pause(140);
    await cast;
  }

  async function stormSpell(atk, def, dir, hex) {
    Sound.magic();
    const cast = castPose(atk);
    await pause(320);
    const end = hitPoint(def);
    Board3D.dustRing(def.position, hex);
    for (let j = 0; j < 5 && !skipped; j++) {
      const from = end.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 5.5, (Math.random() - 0.5) * 1.6));
      const foot = def.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.25));
      Sound.zap();
      Board3D.shake(0.1 + j * 0.035);
      flashHit(def, 0xe2c8ff);
      if (j === 0) clip(def, "Hit_A");
      flashLight(end, hex, 8, 320);
      Board3D.spawnBurst(foot, 0xe9d8ff, 12, 3);
      await flickerBolt(from, foot, hex, 3, 0.065, 0.34);
      await pause(70);
    }
    await pause(120);
    await cast;
  }

  async function fireballSpell(atk, def, dir, hex) {
    Sound.magic();
    const cast = castPose(atk);
    const start = castOrigin(atk, dir);
    const ball = glowMesh(new THREE.IcosahedronGeometry(0.11, 2), 0xffc45a, 5);
    const halo = glowMesh(new THREE.IcosahedronGeometry(0.2, 2), hex, 1.6, 0.6);
    ball.add(halo);
    ball.position.copy(start);
    const light = new THREE.PointLight(hex, 0, 6);
    if (!skipped) Board3D.scene.add(ball, light);
    const g = { k: 0.1 };
    await tw(g, { k: 1 }, {
      duration: 360, easing: "out",
      onUpdate: () => { ball.scale.setScalar(g.k); light.position.copy(ball.position); light.intensity = g.k * 3; },
    });
    Sound.fire();
    const end = hitPoint(def);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.45, 0));
    const puffGeo = new THREE.IcosahedronGeometry(0.07, 0);
    const s = { t: 0 };
    await tw(s, { t: 1 }, {
      duration: 430, easing: "in",
      onUpdate: () => {
        const a = start.clone().lerp(mid, s.t), b = mid.clone().lerp(end, s.t);
        ball.position.copy(a.lerp(b, s.t));
        ball.rotation.x += 0.5;
        light.position.copy(ball.position);
        if (skipped) return;
        // flame trail
        const puff = glowMesh(puffGeo, Math.random() < 0.5 ? 0xffb347 : 0xff4a12, 2.6, 0.9);
        puff.position.copy(ball.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1));
        Board3D.scene.add(puff);
        let life = 0.36;
        Board3D.addEffect(dt => {
          life -= dt;
          puff.position.y += dt * 0.5;
          puff.scale.setScalar(Math.max(0.01, life / 0.36) * 1.4);
          puff.material.opacity = Math.max(0, life / 0.36) * 0.9;
          if (life <= 0) { discard(puff); return false; }
          return true;
        });
      },
    });
    discard(ball);
    Board3D.scene.remove(light);
    // explosion
    Sound.boom();
    Board3D.shake(0.16);
    flashHit(def, 0xffb070);
    clip(def, "Hit_A");
    flashLight(end, hex, 10, 650, 9);
    Board3D.dustRing(def.position, hex);
    Board3D.spawnBurst(end, 0xffb347, 26, 3.6);
    Board3D.spawnBurst(end, 0x3a2418, 10, 2.4);
    if (!skipped) {
      for (const [color, k, size, ms] of [[0xffe6a0, 5, 0.75, 300], [hex, 2.5, 1.15, 460]]) {
        const shell = glowMesh(new THREE.SphereGeometry(1, 28, 18), color, k, 0.6);
        shell.position.copy(end);
        shell.scale.setScalar(0.12);
        Board3D.scene.add(shell);
        const e = { k: 0.12 };
        Tween.to(e, { k: size }, {
          duration: ms, easing: "out",
          onUpdate: v => { shell.scale.setScalar(e.k); shell.material.opacity = 0.6 * (1 - v); },
        }).then(() => discard(shell));
      }
    }
    await pause(260);
    await cast;
  }

  // the queen's sword stroke throws a crescent of light
  async function bladeSpell(atk, def, dir, hex) {
    Sound.magic();
    const swing = clip(atk, atk.userData.attack);
    tw(atk.position, { x: atk.position.x + dir.x * 0.2, z: atk.position.z + dir.z * 0.2 }, { duration: 260, easing: "inOut" });
    await pause(360);
    const start = castOrigin(atk, dir).addScaledVector(dir, 0.25);
    const end = hitPoint(def);
    const wave = new THREE.Group();
    const arc = glowMesh(new THREE.TorusGeometry(0.5, 0.045, 6, 28, Math.PI * 0.9), hex, 4.5);
    const arcSoft = glowMesh(new THREE.TorusGeometry(0.5, 0.13, 6, 28, Math.PI * 0.9), hex, 1.3, 0.45);
    arc.rotation.z = arcSoft.rotation.z = Math.PI * 0.05;
    wave.add(arc, arcSoft);
    wave.position.copy(start);
    wave.lookAt(end);
    wave.rotateZ(-0.5);
    const light = new THREE.PointLight(hex, 3, 5);
    if (!skipped) Board3D.scene.add(wave, light);
    Sound.clang();
    const s = { t: 0 };
    await tw(s, { t: 1 }, {
      duration: 250, easing: "in",
      onUpdate: () => {
        wave.position.copy(start).lerp(end, s.t);
        wave.scale.setScalar(0.7 + s.t * 0.9);
        light.position.copy(wave.position);
      },
    });
    discard(wave);
    Board3D.scene.remove(light);
    Sound.boom();
    Board3D.shake(0.13);
    flashHit(def, 0xffe9a8);
    clip(def, "Hit_A");
    flashLight(end, hex, 9, 520);
    Board3D.spawnBurst(end, 0xffe9a8, 24, 3.2);
    if (!skipped) {
      const pillar = glowMesh(new THREE.CylinderGeometry(0.42, 0.42, 9, 20, 1, true), hex, 3.2, 0.85);
      pillar.position.copy(def.position).add(new THREE.Vector3(0, 4.5, 0));
      Board3D.shake(0.22);
      Board3D.dustRing(def.position, hex);
      Board3D.scene.add(pillar);
      const e = { k: 1 };
      Tween.to(e, { k: 0.15 }, {
        duration: 480, easing: "out",
        onUpdate: v => { pillar.scale.set(e.k, 1, e.k); pillar.material.opacity = 0.8 * (1 - v); },
      }).then(() => discard(pillar));
    }
    await swing;
  }

  // ================= flying knights =================
  const HOVER = 0.85;

  // lift off and fly to a hover point short of the defender
  async function flyApproach(atk, to) {
    atk.userData.play("Fly", 0.15);
    const from = atk.position.clone();
    const s = { t: 0 };
    await tw(s, { t: 1 }, {
      duration: 760, easing: "inOut",
      onUpdate: () => {
        atk.position.x = from.x + (to.x - from.x) * s.t;
        atk.position.z = from.z + (to.z - from.z) * s.t;
        atk.position.y = HOVER * Math.sin(Math.min(1, s.t * 1.25) * Math.PI / 2);
      },
    });
  }

  // a burst of fire: two expanding shells, sparks and a flash
  function fireBlast(pos, hex) {
    flashLight(pos, hex, 10, 650, 9);
    Board3D.spawnBurst(pos, 0xffd27a, 26, 3.6);
    if (skipped) return;
    for (const [color, k, size, ms] of [[0xfff0b0, 4, 0.42, 280], [hex, 1.6, 0.68, 420]]) {
      const shell = glowMesh(new THREE.SphereGeometry(1, 28, 18), color, k, 0.6);
      shell.position.copy(pos);
      shell.scale.setScalar(0.12);
      Board3D.scene.add(shell);
      const e = { k: 0.12 };
      Tween.to(e, { k: size }, {
        duration: ms, easing: "out",
        onUpdate: v => { shell.scale.setScalar(e.k); shell.material.opacity = 0.6 * (1 - v); },
      }).then(() => discard(shell));
    }
  }

  // the phoenix burns down to a pile of glowing ash
  async function ashDeath(def) {
    const hex = 0xffb347;
    const body = def.position.clone().add(new THREE.Vector3(0, def.userData.lift || 0.6, 0));
    Sound.fire();
    fireBlast(body, hex);
    const pile = new THREE.Group();
    pile.position.set(def.position.x, 0.065, def.position.z);
    const heap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0x2b2623, roughness: 1, flatShading: true }));
    heap.position.y = 0.07;
    pile.add(heap);
    const coals = [];
    for (let i = 0; i < 9; i++) {
      const c = glowMesh(new THREE.IcosahedronGeometry(0.022, 0), i % 2 ? 0xff7a1e : 0xffd27a, 3.5);
      const a = i * 2.4, r = 0.05 + (i % 4) * 0.045;
      c.position.set(Math.cos(a) * r, 0.05 + (0.2 - r) * 0.4, Math.sin(a) * r);
      pile.add(c);
      coals.push(c);
    }
    pile.scale.setScalar(0.01);
    if (!skipped) Board3D.scene.add(pile);
    const s = { k: 1 };
    await tw(s, { k: 0.02 }, {
      duration: 620, easing: "in",
      onUpdate: v => {
        def.scale.setScalar(s.k);
        def.position.y = -(def.userData.lift || 0.6) * v * 0.9;       // the embers fall to the square
        pile.scale.setScalar(Math.max(0.01, v));
        if (!skipped && Math.random() < 0.5) Board3D.spawnBurst(body.clone().setY(body.y * (1 - v) + 0.15), hex, 3, 1.6);
      },
    });
    def.visible = false;
    await pause(700);
    // the coals die, then the ash blows away
    const f = { k: 1 };
    Tween.to(f, { k: 0 }, {
      duration: 1100, easing: "in",
      onUpdate: () => { for (const c of coals) c.material.opacity = f.k; pile.scale.set(1, Math.max(0.05, f.k), 1); },
    }).then(() => discard(pile));
  }

  // dive onto the defender, strike, and pull back up
  async function swoopStrike(atk, def, dir, glowColor) {
    const up = atk.position.clone();
    const fire = !!atk.userData.fireDive, lift = atk.userData.lift || 0;
    await tw(atk.rotation, { x: 0.35 }, { duration: 200, easing: "out" });     // rear back
    if (fire) Sound.fire();
    const puffGeo = fire && new THREE.IcosahedronGeometry(0.09, 1);
    await Promise.all([
      tw(atk.position, { x: def.position.x - dir.x * 0.35, z: def.position.z - dir.z * 0.35, y: fire ? 0.35 - lift : 0.3 }, {
        duration: fire ? 300 : 230, easing: "in",
        onUpdate: () => {
          if (!fire || skipped) return;
          // a comet tail of flame behind the dive
          const puff = glowMesh(puffGeo, Math.random() < 0.5 ? 0xffd27a : 0xff7a1e, 2.8, 0.9);
          puff.position.copy(atk.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.25, lift + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.25));
          Board3D.scene.add(puff);
          let life = 0.45;
          Board3D.addEffect(dt => {
            life -= dt;
            puff.scale.setScalar(Math.max(0.01, life / 0.45) * 1.6);
            puff.material.opacity = Math.max(0, life / 0.45) * 0.9;
            if (life <= 0) { discard(puff); return false; }
            return true;
          });
        },
      }),
      tw(atk.rotation, { x: -0.5 }, { duration: fire ? 300 : 230, easing: "in" }),
    ]);
    if (fire) { Sound.boom(); fireBlast(hitPoint(def), 0xff8a1e); }
    Sound.thud();
    Sound.clang();
    Board3D.spawnBurst(hitPoint(def), glowColor, 20, 3.2);
    Board3D.dustRing(def.position);
    Board3D.shake(0.15);
    flashHit(def);
    clip(def, "Hit_A");
    await pause(120);
    await Promise.all([
      tw(atk.position, { x: up.x, z: up.z, y: HOVER * 0.8 }, { duration: 380, easing: "out" }),
      tw(atk.rotation, { x: 0 }, { duration: 380, easing: "out" }),
    ]);
  }

  const SPELL_FN = { lightning: lightningSpell, storm: stormSpell, fireball: fireballSpell, blade: bladeSpell };

  async function golemStrike(atk, def, dir, glowColor) {
    const p = atk.userData.parts || {};
    Sound.magic();
    // wind up: both fists overhead
    await Promise.all([
      p.armR ? tw(p.armR.rotation, { x: 2.7 }, { duration: 420, easing: "out" }) : null,
      p.armL ? tw(p.armL.rotation, { x: 2.7 }, { duration: 420, easing: "out" }) : null,
      tw(atk.rotation, { x: 0.18 }, { duration: 420, easing: "out" }),
    ].filter(Boolean));
    await pause(150);
    // double-fist slam
    Sound.thud();
    const lx = atk.position.x + dir.x * 0.4, lz = atk.position.z + dir.z * 0.4;
    await Promise.all([
      tw(atk.position, { x: lx, z: lz }, { duration: 150, easing: "in" }),
      tw(atk.rotation, { x: -0.35 }, { duration: 150, easing: "in" }),
      p.armR ? tw(p.armR.rotation, { x: 0.4 }, { duration: 140, easing: "in" }) : null,
      p.armL ? tw(p.armL.rotation, { x: 0.4 }, { duration: 140, easing: "in" }) : null,
    ].filter(Boolean));
    Board3D.dustRing(def.position);
    Board3D.spawnBurst(hitPoint(def), 0xbea573, 18, 3);
    Board3D.shake(0.2);
    flashHit(def);
    clip(def, "Hit_A");
    await pause(220);
    await Promise.all([
      tw(atk.position, { x: atk.position.x - dir.x * 0.25, z: atk.position.z - dir.z * 0.25 }, { duration: 280, easing: "out" }),
      tw(atk.rotation, { x: 0 }, { duration: 280, easing: "out" }),
      p.armR ? tw(p.armR.rotation, { x: 0 }, { duration: 280, easing: "out" }) : null,
      p.armL ? tw(p.armL.rotation, { x: 0 }, { duration: 280, easing: "out" }) : null,
    ].filter(Boolean));
  }

  function hitPoint(def) {
    return def.position.clone().add(new THREE.Vector3(0, (def.userData.height || 1) * 0.55, 0));
  }

  // brief emissive flash on every mesh of the defender
  function flashHit(def, hex = 0xff2222) {
    def.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        const orig = o.material.emissive.getHex();
        const origI = o.material.emissiveIntensity;
        o.material.emissive.setHex(hex);
        o.material.emissiveIntensity = 0.9;
        setTimeout(() => {
          o.material.emissive.setHex(orig);
          o.material.emissiveIntensity = origI;
        }, 180);
      }
    });
  }

  async function death(def) {
    if (def.userData.ashDeath) return ashDeath(def);
    Sound.death();
    if (def.userData.skinned && def.userData.actions.Death_A) {
      await clip(def, "Death_A");
      await pause(220);
      Board3D.spawnBurst(def.position.clone().add(new THREE.Vector3(0, 0.2, 0)),
        def.userData.color === "w" ? 0xd8d4c4 : 0x554e5e, 14);
      await tw(def.position, { y: -1.4 }, { duration: 500, easing: "in" });
      return;
    }
    const p = def.userData.parts || {};
    await Promise.all([
      tw(def.rotation, { x: def.rotation.x - 1.55 }, { duration: 420, easing: "in" }),
      p.armR ? tw(p.armR.rotation, { x: 2.4 }, { duration: 400, easing: "out" }) : null,
      p.armL ? tw(p.armL.rotation, { x: 2.1 }, { duration: 440, easing: "out" }) : null,
    ].filter(Boolean));
    Board3D.spawnBurst(def.position.clone().add(new THREE.Vector3(0, 0.25, 0)),
      def.userData.color === "w" ? 0xd8d4c4 : 0x554e5e, 14);
    await tw(def.position, { y: -1.7 }, { duration: 460, easing: "in" });
  }

  /**
   * move: the capture move about to be made (game not yet updated).
   * Returns when the scene completes or is skipped.
   */
  async function play(move, game) {
    skipped = !!window.__instantBattles;   // debug/testing hook
    const attackerPiece = game.board[move.from];
    const capSq = move.flags === "ep"
      ? move.to + (attackerPiece[0] === "w" ? 8 : -8)
      : move.to;
    const defenderPiece = game.board[capSq];
    const atk = Board3D.getPiece(move.from);
    const def = Board3D.removePiece(capSq);   // take over the map slot; keep visible
    if (!atk || !def) return;
    Board3D.scene.add(def);
    Board3D.trackAnim(def);   // keep the victim's animations running while detached

    const banner = document.getElementById("battle3d-banner");
    banner.innerHTML = `<span>${fighterName(attackerPiece)}</span><span class="bt-vs">⚔</span><span>${fighterName(defenderPiece)}</span>`;
    banner.hidden = false;

    Board3D.onSkip(skip);

    const A = atk.position.clone();
    const D = def.position.clone();
    const dir = D.clone().sub(A).setY(0).normalize();

    // how close the attacker gets: sword's reach, or casting range
    const type = attackerPiece[1];
    const spell = (type === "b" || type === "q") ? SPELLS[attackerPiece] : null;
    const flyer = !!atk.userData.flyer;
    const reach = spell ? SPELL_REACH[spell] : flyer ? 1.25 : 0.95;
    const gap = Math.hypot(D.x - A.x, D.z - A.z);
    const stop = (flyer || gap - reach > 0.35) ? D.clone().sub(dir.clone().multiplyScalar(reach)) : A.clone();
    const fightGap = Math.hypot(D.x - stop.x, D.z - stop.z);

    // camera: swoop to a low side view of where the fight happens
    const mid = stop.clone().lerp(D, 0.5).setY(0);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    if (perp.dot(Board3D.camera.position.clone().sub(mid)) < 0) perp.negate();
    const camPos = mid.clone().add(perp.multiplyScalar(3.2 + fightGap * 0.65)).add(new THREE.Vector3(0, 1.9, 0));
    const camRestore = Board3D.cinematicRestore;
    // clear the shot: hide bystanders standing between the camera and the fight
    const hidden = [];
    if (!skipped) {
      const look = mid.clone().setY(0.6);
      const view = look.clone().sub(camPos);
      const viewLen = view.length();
      view.normalize();
      for (const p of Board3D.piecesGroup.children) {
        if (p === atk || p === def || !p.visible) continue;
        const rel = p.position.clone().setY(0.6).sub(camPos);
        const along = rel.dot(view);
        const off = rel.clone().addScaledVector(view, -along).length();
        if (along > 0 && along < viewLen - 0.4 && off < 0.75 + fightGap * 0.5 * (along / viewLen)) {
          p.visible = false;
          hidden.push(p);
        }
      }
    }
    if (!skipped) await Board3D.cinematicTo(camPos, mid.clone().add(new THREE.Vector3(0, 0.55, 0)), 620);

    // square off
    await Promise.all([faceYaw(atk, Board3D.yawFor(dir)), faceYaw(def, Board3D.yawFor(dir.clone().negate()))]);

    // approach: stop short of the defender
    const approachDist = Math.hypot(stop.x - A.x, stop.z - A.z);
    if (flyer) {
      if (skipped) atk.position.set(stop.x, 0, stop.z);
      else await flyApproach(atk, stop);
    } else if (approachDist > 0.35) {
      if (type === "n" && !atk.userData.skinned) {
        // gallop-leap over the battlefield
        const s = { t: 0 };
        await tw(s, { t: 1 }, {
          duration: 640, easing: "inOut",
          onUpdate: () => {
            atk.position.x = A.x + (stop.x - A.x) * s.t;
            atk.position.z = A.z + (stop.z - A.z) * s.t;
            atk.position.y = Math.sin(s.t * Math.PI) * 1.0;
            const tuck = Math.sin(s.t * Math.PI);
            for (const l of (atk.userData.parts && atk.userData.parts.legs) || []) {
              l.g.rotation.x = (l.g.position.z < 0 ? -0.7 : 0.7) * tuck;
            }
          },
        });
        Board3D.resetPose(atk);
      } else if (skipped) {
        atk.position.set(stop.x, 0, stop.z);
      } else {
        await Board3D.walkToPos(atk, stop.x, stop.z, 380 + approachDist * 170);
      }
    }
    await pause(240);

    const glowColor = Pieces3D.palette(attackerPiece[0]).glow;
    if (spell) await SPELL_FN[spell](atk, def, dir, SPELL_COLOR[spell]);
    else if (flyer) await swoopStrike(atk, def, dir, glowColor);
    else if (type === "r" && (!atk.userData.skinned || atk.userData.heavy)) await golemStrike(atk, def, dir, glowColor);
    else await meleeStrike(atk, def, dir, glowColor);

    await death(def);
    Board3D.scene.remove(def);
    Board3D.untrackAnim(def);

    // claim the square
    const claimDist = Math.hypot(D.x - atk.position.x, D.z - atk.position.z);
    if (flyer) {
      // glide in and land on the captured square
      await Promise.all([
        tw(atk.position, { x: D.x, z: D.z, y: 0 }, { duration: 520, easing: "inOut" }),
        faceYaw(atk, Board3D.factionYaw(atk.userData.color), 520),
      ]);
      atk.rotation.x = 0;
      if (!skipped) atk.userData.play("Idle", 0.3);
    } else if (!skipped && claimDist > 1.3) {
      await Board3D.walkToPos(atk, D.x, D.z, 320 + claimDist * 170);
      await faceYaw(atk, Board3D.factionYaw(atk.userData.color), 220);
    } else {
      await Promise.all([
        tw(atk.position, { x: D.x, z: D.z, y: 0 }, { duration: 320, easing: "inOut" }),
        faceYaw(atk, Board3D.factionYaw(atk.userData.color), 320),
      ]);
    }
    atk.position.set(D.x, 0, D.z);
    if (!skipped && atk.userData.skinned) {
      clip(atk, "Cheer");     // victory flourish; commitMove fades back to Idle
      await pause(700);
    }
    await pause(skipped ? 0 : 240);

    for (const p of hidden) p.visible = true;
    banner.hidden = true;
    Board3D.onSkip(null);
    await camRestore(skipped ? 0 : 650);
  }

  return { play, skip };
})();
