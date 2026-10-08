"use strict";

/*
 * board3d.js — the 3D scene: renderer, camera + orbit controls, board,
 * lighting, piece placement/movement, selection markers, particles,
 * camera cinematics and screen shake. Chess logic stays in engine.js;
 * this file only draws and animates.
 */
const Board3D = (() => {

  let renderer, scene, camera, container;
  let lookTarget = new THREE.Vector3(0, 0.2, 0);
  const orbit = { theta: 0, phi: 0.98, radius: 11.6 };
  let cinematic = false;
  let shakeAmp = 0;

  const tiles = [];
  const pieces = new Array(64).fill(null);
  let piecesGroup, markerGroup, statusGroup;
  const effects = [];       // frame-updated particles: {update(dt,t) -> alive}
  const flames = [];
  const animExtra = new Set();   // detached groups (e.g. battle victims) still animating
  let onSquareClick = null;

  function tickPiece(p, now, mixerDt) {
    if (p.userData.animate) p.userData.animate(now);
    if (p.userData.mixer) p.userData.mixer.update(mixerDt);
    if (p.userData.postAnimate) p.userData.postAnimate();
  }

  function trackAnim(g) { animExtra.add(g); }
  function untrackAnim(g) { animExtra.delete(g); }

  const worldX = sq => (sq & 7) - 3.5;
  const worldZ = sq => (sq >> 3) - 3.5;

  // yaw so a piece (modeled facing -z) faces direction d
  const yawFor = d => Math.atan2(-d.x, -d.z);
  const factionYaw = color => (color === "w" ? 0 : Math.PI);

  // ---------- init ----------

  function init(containerEl, clickHandler) {
    container = containerEl;
    onSquareClick = clickHandler;

    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14101d);
    scene.fog = new THREE.Fog(0x14101d, 16, 34);

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

    piecesGroup = new THREE.Group();
    markerGroup = new THREE.Group();
    statusGroup = new THREE.Group();
    scene.add(piecesGroup, markerGroup, statusGroup);

    Gfx3D.init(renderer, scene, camera, { hideInDepth: [markerGroup, statusGroup] });
    buildLights();
    buildBoard();
    buildSurroundings();

    bindInput();
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    let lastFrameAt = 0;
    let dof = 0;                // battle close-ups ease into depth of field
    const safeFrame = () => {
      try {
        lastFrameAt = performance.now();
        frame();
      } catch (err) {
        if (!window.__loopErr) {
          window.__loopErr = String(err && err.stack || err);
          console.error("render loop error:", err);
        }
      }
    };
    renderer.setAnimationLoop(safeFrame);
    // rAF stops in hidden tabs, which would freeze battles/AI mid-animation.
    // Keep the game ticking (at low rate) whenever rAF stalls.
    setInterval(() => {
      if (performance.now() - lastFrameAt > 250) safeFrame();
    }, 120);

    function frame() {
      const now = performance.now();
      const rawDt = (now - last) / 1000;
      const dt = Math.min(0.05, rawDt);          // physics/effects step
      const mixerDt = Math.min(rawDt, 1.0);       // animations may fast-forward after a stall
      last = now;
      Tween.update(now);
      for (const p of pieces) if (p) tickPiece(p, now, mixerDt);
      for (const p of animExtra) tickPiece(p, now, mixerDt);
      for (const f of flames) f(now);
      for (let i = effects.length - 1; i >= 0; i--) if (!effects[i](dt, now)) effects.splice(i, 1);
      if (!cinematic) {
        camera.position.set(
          lookTarget.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
          lookTarget.y + orbit.radius * Math.cos(orbit.phi),
          lookTarget.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
        );
      }
      camera.lookAt(lookTarget);
      if (shakeAmp > 0.002) {
        scene.position.set((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp * 0.5, (Math.random() - 0.5) * shakeAmp);
        shakeAmp *= 0.86;
      } else {
        scene.position.set(0, 0, 0);
        shakeAmp = 0;
      }
      dof += ((cinematic ? 1 : 0) - dof) * Math.min(1, dt * 5);
      Gfx3D.render(dof, camera.position.distanceTo(lookTarget));
    }
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    Gfx3D.resize(w, h);
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0x9585b8, 0x241a2a, 0.28));
    const key = new THREE.DirectionalLight(0xffe8c4, 1.7);
    key.position.set(5, 10, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6.5; key.shadow.camera.right = 6.5;
    key.shadow.camera.top = 6.5; key.shadow.camera.bottom = -6.5;
    key.shadow.camera.near = 2; key.shadow.camera.far = 26;
    key.shadow.bias = -0.0015;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9aa0d8, 0.2);
    fill.position.set(-6, 5, -5);
    scene.add(fill);
  }

  // deterministic per-tile variation (so the board looks the same every load)
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function buildBoard() {
    // oak and mahogany squares, each cut from a different patch of the plank
    const matLight = Gfx3D.pbr("oak_veneer_01", { color: 0xf2dfc0, roughness: 0.55, normal: 0.6 });
    const matDark = Gfx3D.pbr("dark_wood", { color: 0xa98672, roughness: 0.62, normal: 0.6, env: 0.7 });
    const tileGeo = new THREE.BoxGeometry(0.98, 0.14, 0.98);
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      const light = ((r + c) & 1) === 0;
      const geo = Gfx3D.remapUV(tileGeo.clone(), 0.22, 0.22, hash(i) * 0.78, hash(i + 64) * 0.78, !light);
      const t = new THREE.Mesh(geo, light ? matLight : matDark);
      t.position.set(worldX(i), -0.07, worldZ(i));
      t.receiveShadow = true;
      t.userData.sq = i;
      tiles.push(t);
      scene.add(t);
    }
    // wooden frame, grain running along each rail
    const wood = Gfx3D.pbr("dark_wood", { color: 0x6b4a3a, roughness: 0.72, normal: 0.8, env: 0.6 });
    const frameLong = Gfx3D.remapUV(new THREE.BoxGeometry(9.2, 0.22, 0.6), 2.4, 0.16);
    const frameSide = Gfx3D.remapUV(new THREE.BoxGeometry(0.6, 0.22, 8.0), 2.1, 0.16, 0.3, 0.5, true);
    for (const [g, x, z] of [[frameLong, 0, 4.3], [frameLong, 0, -4.3], [frameSide, 4.3, 0], [frameSide, -4.3, 0]]) {
      const m = new THREE.Mesh(g, wood);
      m.position.set(x, -0.05, z);
      m.receiveShadow = true;
      m.castShadow = true;
      scene.add(m);
    }
    const plinthGeo = Gfx3D.remapUV(new THREE.BoxGeometry(9.6, 0.3, 9.6), 2.5, 2.5);
    const plinth = new THREE.Mesh(plinthGeo, Gfx3D.pbr("dark_wood", { color: 0x3e2a20, roughness: 0.85, env: 0.5 }));
    plinth.position.y = -0.31;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);
    // gold trim strips on frame top
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9a04e, roughness: 0.28, metalness: 1 });
    const trimGeoL = new THREE.BoxGeometry(8.2, 0.03, 0.05);
    const trimGeoS = new THREE.BoxGeometry(0.05, 0.03, 8.2);
    for (const [g, x, z] of [[trimGeoL, 0, 4.06], [trimGeoL, 0, -4.06], [trimGeoS, 4.06, 0], [trimGeoS, -4.06, 0]]) {
      const m = new THREE.Mesh(g, trimMat);
      m.position.set(x, 0.07, z);
      scene.add(m);
    }
  }

  function buildSurroundings() {
    // flagstone floor of the hall
    const ground = new THREE.Mesh(
      Gfx3D.remapUV(new THREE.PlaneGeometry(80, 80), 18, 18),
      Gfx3D.pbr("monastery_stone_floor", { color: 0x8d86a0, roughness: 1, normal: 1.2, env: 0.6 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.47;
    ground.receiveShadow = true;
    scene.add(ground);
    // corner torch pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3140, roughness: 0.8, flatShading: true });
    for (const [x, z] of [[4.9, 4.9], [-4.9, 4.9], [4.9, -4.9], [-4.9, -4.9]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.15, 8), pillarMat);
      p.position.set(x, 0.12, z);
      p.castShadow = true;
      scene.add(p);
      const flame = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.1),
        new THREE.MeshStandardMaterial({ color: 0x331503, emissive: 0xff9440, emissiveIntensity: 2.4 })
      );
      flame.position.set(x, 0.82, z);
      scene.add(flame);
      const phase = (x + z * 3) * 10;
      flames.push(t => {
        const f = 1 + Math.sin(t * 0.011 + phase) * 0.18 + Math.sin(t * 0.023 + phase * 2) * 0.1;
        flame.scale.set(f, f * (1 + Math.sin(t * 0.017 + phase) * 0.25), f);
        flame.material.emissiveIntensity = 2.0 + f * 0.6;
      });
    }
    const l1 = new THREE.PointLight(0xff9440, 0.45, 9);
    l1.position.set(4.9, 1.2, 4.9);
    const l2 = new THREE.PointLight(0xff9440, 0.45, 9);
    l2.position.set(-4.9, 1.2, -4.9);
    scene.add(l1, l2);
  }

  // ---------- input: orbit + click ----------

  function bindInput() {
    const el = renderer.domElement;
    el.style.touchAction = "none";

    // pointerId -> {x, y}; supports mouse and multi-touch (iPad).
    const ptrs = new Map();
    let tapStart = null;        // where the (single) pointer went down, for tap-vs-drag
    let dragging = false;
    let pinch = null;           // { dist, radius } captured when a 2nd finger lands

    const clampRadius = r => Math.max(6, Math.min(18, r));

    el.addEventListener("pointerdown", e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      if (ptrs.size === 1) {
        tapStart = { x: e.clientX, y: e.clientY };
        dragging = false;
      } else if (ptrs.size === 2) {
        tapStart = null;        // two fingers is never a tap
        const [a, b] = [...ptrs.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), radius: orbit.radius };
      } else {
        tapStart = null;
      }
    });

    el.addEventListener("pointermove", e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0 && !cinematic) orbit.radius = clampRadius(pinch.radius * pinch.dist / d);
        return;
      }
      if (ptrs.size !== 1) return;
      if (tapStart && !dragging &&
          Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > 7) dragging = true;
      if (dragging && !cinematic) {
        orbit.theta -= dx * 0.0055;
        orbit.phi = Math.max(0.28, Math.min(1.28, orbit.phi - dy * 0.0045));
      }
    });

    const release = e => {
      const wasTap = ptrs.size === 1 && tapStart && !dragging && e.type === "pointerup";
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (wasTap) {
        if (cinematic) { if (skipHandler) skipHandler(); }
        else pick(e);
      }
      if (ptrs.size === 0) { tapStart = null; dragging = false; }
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);

    el.addEventListener("wheel", e => {
      e.preventDefault();
      if (cinematic) return;
      orbit.radius = clampRadius(orbit.radius * (1 + e.deltaY * 0.0011));
    }, { passive: false });
  }

  let skipHandler = null;
  function onSkip(fn) { skipHandler = fn; }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...tiles, ...piecesGroup.children], true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.sq === undefined) o = o.parent;
      if (o && o.userData.sq !== undefined) {
        if (onSquareClick) onSquareClick(o.userData.sq);
        return;
      }
    }
  }

  // ---------- pieces ----------

  function addPiece(type, color, sq) {
    const g = Pieces3D.build(type, color);
    g.position.set(worldX(sq), 0, worldZ(sq));
    g.userData.sq = sq;
    pieces[sq] = g;
    piecesGroup.add(g);
    return g;
  }

  function removePiece(sq) {
    const g = pieces[sq];
    if (g) { piecesGroup.remove(g); pieces[sq] = null; }
    return g;
  }

  function fullSync(game) {
    for (let i = 0; i < 64; i++) if (pieces[i]) { piecesGroup.remove(pieces[i]); pieces[i] = null; }
    for (let i = 0; i < 64; i++) {
      const p = game.board[i];
      if (p) addPiece(p[1], p[0], i);
    }
  }

  function getPiece(sq) { return pieces[sq]; }

  // Reconcile the piece map after game.make(move). All visual motion has
  // already happened; this snaps groups to exact centers and fixes the map.
  function commitMove(move, game) {
    const g = pieces[move.from];
    pieces[move.from] = null;
    // any capture group should already be removed visually; clear map slots
    if (pieces[move.to] && pieces[move.to] !== g) removePiece(move.to);
    if (move.flags === "ep") {
      const capSq = move.to + (g.userData.color === "w" ? 8 : -8);
      removePiece(capSq);
    }
    pieces[move.to] = g;
    if (g) {
      g.userData.sq = move.to;
      g.position.set(worldX(move.to), 0, worldZ(move.to));
      g.rotation.set(0, factionYaw(g.userData.color), 0);
      g.scale.set(1, 1, 1);
      g.visible = true;
      if (g.userData.skinned) g.userData.play("Idle", 0.2);
      else resetPose(g);
    }
    if (move.flags === "castleK" || move.flags === "castleQ") {
      const rookFrom = move.flags === "castleK" ? move.to + 1 : move.to - 2;
      const rookTo = move.flags === "castleK" ? move.to - 1 : move.to + 1;
      const rk = pieces[rookFrom];
      pieces[rookFrom] = null;
      pieces[rookTo] = rk;
      if (rk) {
        rk.userData.sq = rookTo;
        rk.position.set(worldX(rookTo), 0, worldZ(rookTo));
      }
    }
    if (move.promo && g) {
      removePiece(move.to);
      addPiece(move.promo, g.userData.color, move.to);
    }
  }

  // ---------- movement animations ----------

  // restore limbs to their resting pose
  function resetPose(g) {
    const parts = g.userData.parts;
    if (!parts) return;
    for (const l of parts.legs || []) l.g.rotation.set(0, 0, 0);
    if (parts.armR) parts.armR.rotation.set(g.userData.restArmR || 0, 0, 0);
    if (parts.armL) parts.armL.rotation.set(0, 0, 0);
  }

  // vanish in a burst of flame, streak to the target, and reappear there
  async function teleportToPos(g, tx, tz) {
    const hex = g.userData.flameColor || 0xff6a1a;
    const from = g.position.clone(), to = new THREE.Vector3(tx, 0, tz);
    const mid = h => new THREE.Vector3(0, h, 0);
    Sound.fire();
    spawnBurst(from.clone().add(mid(0.6)), hex, 18, 2.6);
    dustRing(from, hex);
    await Tween.to(g.scale, { x: 0.02, y: 1.5, z: 0.02 }, { duration: 200, easing: "in" });
    g.visible = false;
    // a comet of fire along the path
    const glow = k => new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const comet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), glow(5));
    const puffGeo = new THREE.IcosahedronGeometry(0.09, 0);
    scene.add(comet);
    const dist = from.distanceTo(to);
    const s = { t: 0 };
    await Tween.to(s, { t: 1 }, {
      duration: 160 + dist * 70, easing: "inOut",
      onUpdate: () => {
        comet.position.lerpVectors(from, to, s.t).y = 0.55;
        const puff = new THREE.Mesh(puffGeo, glow(2.4));
        puff.position.copy(comet.position);
        scene.add(puff);
        let life = 0.4;
        effects.push(dt => {
          life -= dt;
          puff.scale.setScalar(Math.max(0.01, life / 0.4));
          puff.material.opacity = Math.max(0, life / 0.4);
          if (life <= 0) { scene.remove(puff); puff.material.dispose(); return false; }
          return true;
        });
      },
    });
    scene.remove(comet);
    g.position.set(tx, 0, tz);
    g.visible = true;
    Sound.boom();
    spawnBurst(to.clone().add(mid(0.6)), hex, 22, 3);
    dustRing(to, hex);
    shake(0.05);
    await Tween.to(g.scale, { x: 1, y: 1, z: 1 }, { duration: 240, easing: "outBack" });
    g.scale.set(1, 1, 1);
  }

  // stride (or glide, or animation-clip walk) to a world position
  function walkToPos(g, tx, tz, duration = 420) {
    if (g.userData.teleport && Math.hypot(tx - g.position.x, tz - g.position.z) > 0.05) return teleportToPos(g, tx, tz);
    const fx = g.position.x, fz = g.position.z;
    const distTiles = Math.hypot(tx - fx, tz - fz);
    const cycles = Math.max(1, Math.round(distTiles * 1.3));
    const parts = g.userData.parts || {};
    const skinned = g.userData.skinned;
    const glide = !skinned && (!parts.legs || parts.legs.length === 0);
    if (skinned) g.userData.play(distTiles > 1.3 ? "Running_A" : "Walking_A", 0.12);
    // heavies take one full stride per tile, slowly, and turn toward their path
    const steps = Math.max(1, Math.round(distTiles));
    const yaw0 = g.rotation.y;
    let yawDelta = 0;
    if (g.userData.heavy && distTiles > 0.05) {
      duration = Math.max(duration, 650 * steps);
      yawDelta = (yawFor({ x: tx - fx, z: tz - fz }) - yaw0) % (Math.PI * 2);
      if (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
      if (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
    }
    const s = { t: 0 };
    return Tween.to(s, { t: 1 }, {
      duration, easing: "inOut",
      onUpdate: () => {
        g.position.x = fx + (tx - fx) * s.t;
        g.position.z = fz + (tz - fz) * s.t;
        if (g.userData.heavy) {
          // heavy stride: real leg and arm swing, turning to face the way it walks
          const env = Math.min(1, s.t / 0.15, (1 - s.t) / 0.15);
          const ph = s.t * Math.PI * 2 * steps;
          g.userData.walk.phase = ph;
          g.userData.walk.amp = env;
          g.position.y = Math.abs(Math.cos(ph)) * 0.035 * env;
          g.rotation.z = Math.sin(ph) * 0.045 * env;
          g.rotation.y = yaw0 + yawDelta * env;
          const foot = Math.floor(ph / Math.PI + 0.5);
          if (foot !== g.userData._step) { g.userData._step = foot; if (foot > 0) { shake(0.045); Sound.thud(); } }
          return;
        }
        if (skinned) return;
        const env = Math.sin(Math.PI * Math.min(1, s.t * 1.15));
        if (glide) {
          g.position.y = Math.abs(Math.sin(s.t * Math.PI * cycles)) * 0.045 * env;
        } else {
          const w = s.t * Math.PI * 2 * cycles;
          for (const l of parts.legs) l.g.rotation.x = Math.sin(w + l.phase) * 0.55 * env;
          if (parts.armL) parts.armL.rotation.x = Math.sin(w + Math.PI) * 0.3 * env;
          g.position.y = Math.abs(Math.sin(w)) * 0.025;
        }
      },
    }).then(() => {
      g.position.y = 0;
      if (g.userData.heavy) { g.rotation.z = 0; g.rotation.y = yaw0; g.userData.walk.amp = 0; g.userData._step = 0; shake(0.06); }
      if (skinned) g.userData.play("Idle", 0.15);
      else resetPose(g);
    });
  }

  function walkTo(g, toSq, duration) {
    return walkToPos(g, worldX(toSq), worldZ(toSq), duration);
  }

  function slide(g, toSq, duration = 420) {
    return walkTo(g, toSq, duration);
  }

  function leap(g, toSq, duration = 620, height = 1.1) {
    const fx = g.position.x, fz = g.position.z;
    const tx = worldX(toSq), tz = worldZ(toSq);
    const parts = g.userData.parts || {};
    if (g.userData.skinned) g.userData.play("Jump_Full_Long", 0.1);
    const s = { t: 0 };
    return Tween.to(s, { t: 1 }, {
      duration, easing: "inOut",
      onUpdate: () => {
        g.position.x = fx + (tx - fx) * s.t;
        g.position.z = fz + (tz - fz) * s.t;
        g.position.y = Math.sin(s.t * Math.PI) * height;
        if (g.userData.skinned) return;
        // legs stretch mid-leap: front legs forward, back legs trailing
        const tuck = Math.sin(s.t * Math.PI);
        for (const l of parts.legs || []) {
          l.g.rotation.x = (l.g.position.z < 0 ? -0.7 : 0.7) * tuck;
        }
      },
    }).then(() => {
      g.position.y = 0;
      if (g.userData.skinned) g.userData.play("Idle", 0.15);
      else resetPose(g);
    });
  }

  async function animateMove(move, game) {
    const g = pieces[move.from];
    if (!g) return;
    const d = dist(move.from, move.to);
    if (g.userData.type === "n") await leap(g, move.to);
    else await walkTo(g, move.to, 340 + Math.min(560, d * 130));
    if (move.flags === "castleK" || move.flags === "castleQ") {
      const rookFrom = move.flags === "castleK" ? move.to + 1 : move.to - 2;
      const rookTo = move.flags === "castleK" ? move.to - 1 : move.to + 1;
      if (pieces[rookFrom]) await walkTo(pieces[rookFrom], rookTo, 420);
    }
  }

  function dist(a, b) {
    return Math.hypot((a & 7) - (b & 7), (a >> 3) - (b >> 3));
  }

  // quick capture (battles off): victim topples & sinks while attacker slides in
  async function quickCapture(move, capSq) {
    const victim = pieces[capSq];
    const g = pieces[move.from];
    if (victim) {
      piecesGroup.remove(victim);
      scene.add(victim);       // keep it visible while the map slot is reused
      pieces[capSq] = null;
      (async () => {
        await Tween.to(victim.rotation, { x: victim.rotation.x - 1.5 }, { duration: 300, easing: "in" });
        spawnBurst(new THREE.Vector3(worldX(capSq), 0.4, worldZ(capSq)), 0x999999, 10);
        await Tween.to(victim.position, { y: -1.6 }, { duration: 380, easing: "in" });
        scene.remove(victim);
      })();
    }
    if (g) {
      if (g.userData.type === "n") await leap(g, move.to);
      else await walkTo(g, move.to, 340 + Math.min(560, dist(move.from, move.to) * 130));
    }
  }

  // ---------- markers ----------

  const MARKER_Y = { last: 0.075, check: 0.078, select: 0.081, move: 0.085 };

  function flatMesh(geo, color, opacity, y, x, z) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    return m;
  }

  function setSelection(sq, moves, game) {
    markerGroup.clear();
    if (sq == null) return;
    markerGroup.add(flatMesh(new THREE.RingGeometry(0.34, 0.44, 24), 0xd8ab4a, 0.9, MARKER_Y.select, worldX(sq), worldZ(sq)));
    for (const m of moves) {
      if (m.from !== sq) continue;
      const isCap = game.board[m.to] || m.flags === "ep";
      if (isCap) {
        markerGroup.add(flatMesh(new THREE.RingGeometry(0.3, 0.42, 24), 0xdc4a3c, 0.95, MARKER_Y.move, worldX(m.to), worldZ(m.to)));
      } else {
        markerGroup.add(flatMesh(new THREE.CircleGeometry(0.14, 18), 0xd8ab4a, 0.85, MARKER_Y.move, worldX(m.to), worldZ(m.to)));
      }
    }
  }

  let lastMoveMeshes = [], checkMesh = null;

  function setLastMove(move) {
    for (const m of lastMoveMeshes) statusGroup.remove(m);
    lastMoveMeshes = [];
    if (!move) return;
    for (const sq of [move.from, move.to]) {
      const m = flatMesh(new THREE.PlaneGeometry(0.95, 0.95), 0xf0c85a, 0.22, MARKER_Y.last, worldX(sq), worldZ(sq));
      statusGroup.add(m);
      lastMoveMeshes.push(m);
    }
  }

  function setCheck(sq) {
    if (checkMesh) { statusGroup.remove(checkMesh); checkMesh = null; }
    if (sq == null) return;
    checkMesh = flatMesh(new THREE.CircleGeometry(0.46, 24), 0xdc2828, 0.5, MARKER_Y.check, worldX(sq), worldZ(sq));
    statusGroup.add(checkMesh);
  }

  // ---------- effects ----------

  function spawnBurst(pos, color, count = 16, speed = 2.6) {
    const geo = new THREE.TetrahedronGeometry(0.045);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed * 0.9 + 0.6,
        (Math.random() - 0.5) * speed
      );
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0);
      let life = 0.7 + Math.random() * 0.4;
      scene.add(m);
      effects.push((dt) => {
        life -= dt;
        v.y -= 7.5 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.material.opacity = Math.max(0, life * 1.6);
        if (life <= 0 || m.position.y < -0.4) { scene.remove(m); return false; }
        return true;
      });
    }
  }

  function dustRing(pos, color = 0xbea573) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.55, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.09, pos.z);
    scene.add(m);
    const s = { k: 1 };
    Tween.to(s, { k: 3.2 }, {
      duration: 550, easing: "out",
      onUpdate: () => { m.scale.set(s.k, s.k, 1); m.material.opacity = 0.8 * Math.max(0, 1 - (s.k - 1) / 2.2); },
    }).then(() => scene.remove(m));
  }

  function shake(amp) { shakeAmp = Math.max(shakeAmp, amp); }

  // ---------- camera ----------

  function syncOrbitFromCamera() {
    const off = camera.position.clone().sub(lookTarget);
    orbit.radius = Math.max(6, Math.min(18, off.length()));
    orbit.phi = Math.max(0.28, Math.min(1.28, Math.acos(off.y / off.length())));
    orbit.theta = Math.atan2(off.x, off.z);
  }

  async function cinematicTo(pos, look, duration = 600) {
    cinematic = true;
    if (duration <= 0) {
      camera.position.copy(pos);
      lookTarget.set(look.x, look.y, look.z);
      return;
    }
    await Promise.all([
      Tween.to(camera.position, { x: pos.x, y: pos.y, z: pos.z }, { duration, easing: "inOut" }),
      Tween.to(lookTarget, { x: look.x, y: look.y, z: look.z }, { duration, easing: "inOut" }),
    ]);
  }

  async function cinematicRestore(duration = 650) {
    const home = new THREE.Vector3(
      orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      0.2 + orbit.radius * Math.cos(orbit.phi),
      orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
    );
    if (duration <= 0) {
      camera.position.copy(home);
      lookTarget.set(0, 0.2, 0);
      cinematic = false;
      return;
    }
    await Promise.all([
      Tween.to(camera.position, { x: home.x, y: home.y, z: home.z }, { duration, easing: "inOut" }),
      Tween.to(lookTarget, { x: 0, y: 0.2, z: 0 }, { duration, easing: "inOut" }),
    ]);
    cinematic = false;
  }

  function flipCamera() {
    const s = { th: orbit.theta };
    Tween.to(s, { th: orbit.theta + Math.PI }, {
      duration: 800, easing: "inOut",
      onUpdate: () => { orbit.theta = s.th; },
    });
  }

  function setHome(color) {
    orbit.theta = color === "w" ? 0 : Math.PI;
    orbit.phi = 0.98;
    orbit.radius = 11.6;
  }

  return {
    init, fullSync, getPiece, addPiece, removePiece, commitMove,
    animateMove, quickCapture, slide, leap, walkTo, walkToPos, resetPose,
    setSelection, setLastMove, setCheck,
    spawnBurst, dustRing, shake, trackAnim, untrackAnim,
    addEffect: fn => { effects.push(fn); },
    cinematicTo, cinematicRestore, flipCamera, setHome, onSkip,
    setRichGraphics: on => Gfx3D.setRich(on),
    worldX, worldZ, factionYaw, yawFor,
    get camera() { return camera; },
    get scene() { return scene; },
    get piecesGroup() { return piecesGroup; },
  };
})();
