"use strict";

/*
 * scenery3d.js — the battlefield between two realms.
 * The board stands on open ground. Behind the Ivory side (+z) a pale castle
 * rises under a dawn sky; behind the Obsidian side (-z) a black fortress and
 * a volcano sit under storm cloud. Everything here is procedural: a shader
 * sky dome, a ring of mountains, two skylines, a few props near the board,
 * and drifting motes and embers. Can be switched off for the plain hall.
 */
const Scenery3D = (() => {

  let root = null, sky = null;
  const tickers = [];
  let enabled = true;
  try { enabled = localStorage.getItem("cor-scene") !== "plain"; } catch (e) {}

  const FOG = new THREE.Color(0x14101d);

  // ---------- sky ----------

  const SKY_VERT = "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
  const SKY_FRAG = `
    varying vec3 vDir;
    uniform float uTime, uFlash;
    uniform vec3 uFog;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p){ return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 9.1) * 0.15; }
    void main(){
      vec3 d = normalize(vDir);
      float side = smoothstep(-0.6, 0.6, d.z);              // 1 = Ivory (dawn), 0 = Obsidian (storm)
      float h = max(d.y, 0.0);
      vec3 iv = mix(vec3(1.0, 0.66, 0.36), vec3(0.36, 0.45, 0.70), smoothstep(0.0, 0.26, h));
      iv = mix(iv, vec3(0.07, 0.11, 0.27), smoothstep(0.18, 0.85, h));
      vec3 ob = mix(vec3(0.62, 0.13, 0.05), vec3(0.19, 0.05, 0.14), smoothstep(0.0, 0.22, h));
      ob = mix(ob, vec3(0.025, 0.02, 0.06), smoothstep(0.15, 0.8, h));
      vec3 col = mix(ob, iv, side);
      // rising sun behind the castle, molten glow behind the fortress
      float sun = max(dot(d, normalize(vec3(0.22, 0.07, 1.0))), 0.0);
      col += vec3(1.0, 0.82, 0.5) * (pow(sun, 60.0) * 1.3 + pow(sun, 7.0) * 0.22);
      float lava = max(dot(d, normalize(vec3(-0.32, 0.05, -1.0))), 0.0);
      col += vec3(1.0, 0.28, 0.05) * (pow(lava, 30.0) * 0.8 + pow(lava, 6.0) * 0.18);
      // clouds: gilded at dawn, heavy and lit from below over the fortress
      vec2 cp = d.xz / (d.y + 0.22) * 1.1 + vec2(uTime * 0.008, uTime * 0.003);
      float c = fbm(cp);
      float cloud = smoothstep(mix(0.42, 0.56, side), 0.82, c) * smoothstep(0.015, 0.2, d.y);
      vec3 cloudIv = vec3(1.0, 0.78, 0.6) * (0.55 + 0.6 * pow(sun, 3.0));
      vec3 cloudOb = vec3(0.07, 0.04, 0.07) + vec3(0.6, 0.13, 0.04) * pow(lava, 3.0) + vec3(0.55, 0.5, 0.9) * uFlash * (1.0 - side);
      col = mix(col, mix(cloudOb, cloudIv, side), cloud * mix(0.9, 0.6, side));
      // a few stars high over the dark side
      float st = step(0.9975, hash(floor(d.xz / (d.y + 0.4) * 90.0)));
      col += st * (1.0 - side) * smoothstep(0.35, 0.8, d.y) * 0.5 * (1.0 - cloud);
      col *= 0.62;                                          // keep the board the brightest thing
      col = mix(uFog, col, smoothstep(-0.01, 0.09, d.y));   // haze meets the fogged ground
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`;

  function buildSky() {
    sky = new THREE.Mesh(
      new THREE.SphereGeometry(70, 40, 20),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide,
        depthWrite: false, fog: false,
        uniforms: { uTime: { value: 0 }, uFlash: { value: 0 }, uFog: { value: FOG } },
      })
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    root.add(sky);
    let nextFlash = 5, flashEnd = 0;
    tickers.push(s => {
      sky.material.uniforms.uTime.value = s;
      if (s > nextFlash) { flashEnd = s + 0.16; nextFlash = s + 6 + Math.random() * 9; }
      sky.material.uniforms.uFlash.value = s < flashEnd ? 0.6 + Math.random() * 0.4 : 0;
    });
  }

  // ---------- distant terrain ----------

  const lambert = (hex, extra = {}) => new THREE.MeshLambertMaterial({ color: hex, fog: false, ...extra });
  const glow = (hex, k = 2, op = 1) => new THREE.MeshBasicMaterial({
    color: new THREE.Color(hex).multiplyScalar(k), transparent: op < 1, opacity: op, fog: false,
    blending: op < 1 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: op >= 1, side: THREE.DoubleSide,
  });
  function put(parent, geo, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  }

  // two overlapping ridgelines with an irregular, continuous profile
  function buildMountains() {
    const Y0 = -0.5;
    const iv = new THREE.Color(0x3a4160), ob = new THREE.Color(0x0f0a13), c = new THREE.Color();
    const ridge = (R, N, amp, seed, shade) => {
      const pos = [], col = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const hgt = amp * (0.55 + 0.45 * Math.sin(a * 3 + seed)
          + 0.32 * Math.sin(a * 7 + seed * 2.3) + 0.2 * Math.sin(a * 17 + seed * 4.1) + 0.12 * Math.sin(a * 41 + seed * 7.7));
        const x = Math.sin(a) * R, z = Math.cos(a) * R, y = Y0 + Math.max(0.6, hgt);
        pos.push(x, Y0, z, x, y, z);
        c.copy(ob).lerp(iv, THREE.MathUtils.smoothstep(z / R, -0.55, 0.55)).multiplyScalar(shade);
        col.push(c.r * 0.7, c.g * 0.7, c.b * 0.7, c.r * 1.15, c.g * 1.15, c.b * 1.15);
        if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      root.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })));
    };
    ridge(39.5, 360, 4.6, 1.7, 0.8);      // far range
    ridge(36, 360, 2.3, 4.9, 1.15);       // nearer foothills
  }

  // the Ivory castle: pale walls, blue roofs, lit windows, banners
  function buildCastle() {
    const g = new THREE.Group();
    g.position.set(-7, -0.5, 27);
    const wall = lambert(0x9d9580), roof = lambert(0x2f4a7c), win = glow(0xffd58a, 2.2);
    const tower = (x, z, r, h) => {
      put(g, new THREE.CylinderGeometry(r, r * 1.08, h, 10), wall, x, h / 2, z);
      put(g, new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.35, 10), wall, x, h + 0.1, z);
      put(g, new THREE.ConeGeometry(r * 1.25, r * 2.6, 10), roof, x, h + 0.3 + r * 1.3, z);
      for (let k = 0; k < 3; k++) put(g, new THREE.PlaneGeometry(0.16, 0.34), win, x + (k - 1) * r * 0.45, h * (0.45 + 0.17 * k), z - r - 0.02);
      return h + 0.3 + r * 2.6;
    };
    put(g, new THREE.BoxGeometry(11, 3.2, 1.2), wall, 0, 1.6, 0);
    for (let i = -5; i <= 5; i++) put(g, new THREE.BoxGeometry(0.5, 0.45, 1.25), wall, i, 3.4, 0);
    put(g, new THREE.BoxGeometry(4.2, 5.4, 3), wall, 0.4, 2.7, 2.2);
    put(g, new THREE.PlaneGeometry(0.9, 1.5), glow(0xffc46a, 1.6), 0, 0.8, -0.63);            // gate
    tower(-5.6, 0, 0.9, 5.2); tower(5.6, 0, 0.9, 5.0); tower(-2.2, 0.4, 0.7, 4.4); tower(2.4, 0.4, 0.7, 4.6);
    const top = tower(0.4, 2.6, 1.1, 8.6);
    tower(-1.6, 3.2, 0.6, 7.0); tower(2.6, 3.0, 0.65, 6.4);
    // pennants
    const flag = glow(0x3e63b8, 1.1);
    for (const [x, y, z] of [[0.4, top, 2.6], [-5.6, 9.0, 0], [5.6, 8.8, 0]]) {
      put(g, new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), wall, x, y + 0.5, z);
      const f = put(g, new THREE.PlaneGeometry(0.9, 0.4), flag, x + 0.47, y + 0.9, z);
      tickers.push(s => { f.rotation.y = Math.sin(s * 1.7 + x) * 0.35; });
    }
    root.add(g);
  }

  // the Obsidian fortress: black spires with red windows, and a volcano behind
  function buildFortress() {
    const g = new THREE.Group();
    g.position.set(6, -0.5, -27);
    const rock = lambert(0x16111b), win = glow(0xff4a1c, 2.4);
    const spire = (x, z, r, h, lean = 0) => {
      const m = put(g, new THREE.CylinderGeometry(r * 0.12, r, h, 5), rock, x, h / 2, z, x * 0.7);
      m.rotation.z = lean;
      for (let k = 0; k < 2; k++) put(g, new THREE.PlaneGeometry(0.12, 0.4), win, x + (k - 0.5) * r * 0.4, h * (0.3 + 0.2 * k), z + r * 0.72);
    };
    put(g, new THREE.BoxGeometry(12, 2.6, 1.4), rock, 0, 1.3, 0);
    for (let i = -6; i <= 6; i += 1.2) put(g, new THREE.ConeGeometry(0.28, 1.1, 4), rock, i, 3.1, 0);
    put(g, new THREE.PlaneGeometry(1.1, 1.6), glow(0xff3a10, 1.8), 0, 0.85, 0.72);            // gate
    spire(0, -1.5, 1.6, 11.5); spire(-2.6, -1, 1.1, 8.2, 0.06); spire(2.8, -1.2, 1.2, 8.8, -0.07);
    spire(-5.4, 0, 0.9, 6.0, 0.1); spire(5.6, 0, 0.9, 6.4, -0.1); spire(-1.3, 0.2, 0.7, 5.2); spire(1.5, 0.3, 0.7, 5.6);
    root.add(g);
    // volcano
    const v = new THREE.Group();
    v.position.set(-13, -0.5, -33);
    put(v, new THREE.CylinderGeometry(1.6, 8.5, 9.5, 9, 1, true), lambert(0x120c12), 0, 4.75, 0);
    const mouth = put(v, new THREE.SphereGeometry(2.1, 12, 8), glow(0xff5a14, 1.7, 0.75), 0, 9.6, 0);
    const plume = put(v, new THREE.SphereGeometry(3.4, 12, 8), glow(0xff3a0a, 0.5, 0.45), 0, 11.5, 0);
    for (const [a, len] of [[0.4, 5.5], [2.3, 4.2], [4.4, 6.2]]) {
      const s = put(v, new THREE.PlaneGeometry(0.35, len), glow(0xff5a14, 1.9), Math.sin(a) * 3.4, 6.6, Math.cos(a) * 3.4, a);
      s.rotation.x = -0.6;
    }
    tickers.push(s => {
      mouth.scale.setScalar(1 + Math.sin(s * 2.3) * 0.08);
      plume.scale.set(1 + Math.sin(s * 0.9) * 0.1, 1.2 + Math.sin(s * 0.6) * 0.15, 1);
    });
    root.add(v);
  }

  // ---------- near the board ----------

  function buildProps(gfx) {
    // a stone terrace under the board
    const slab = new THREE.Mesh(gfx.remapUV(new THREE.BoxGeometry(12.6, 0.14, 12.6), 3, 3),
      gfx.pbr("monastery_stone_floor", { color: 0xb8b0c2, roughness: 1, env: 0.5 }));
    slab.position.y = -0.4;
    slab.receiveShadow = true;
    root.add(slab);

    // Ivory side: marble columns, one of them broken
    const marble = new THREE.MeshStandardMaterial({ color: 0xc9cbd2, roughness: 0.6 });
    const column = (x, z, h) => {
      const g = new THREE.Group();
      g.position.set(x, -0.33, z);
      put(g, new THREE.BoxGeometry(0.95, 0.22, 0.95), marble, 0, 0.11, 0);
      const shaft = put(g, new THREE.CylinderGeometry(0.3, 0.34, h, 14), marble, 0, 0.22 + h / 2, 0);
      shaft.castShadow = true;
      if (h > 3) put(g, new THREE.BoxGeometry(0.9, 0.2, 0.9), marble, 0, 0.32 + h, 0);
      root.add(g);
    };
    column(-6.9, 6.6, 3.6); column(6.9, 6.6, 1.5); column(-6.9, 3.4, 1.0); column(6.9, 3.4, 3.6);
    const fallen = put(root, new THREE.CylinderGeometry(0.3, 0.3, 1.9, 14), marble, 7.6, -0.05, 5.2, 0.5);
    fallen.rotation.z = Math.PI / 2;

    // Obsidian side: shards of black glass, glowing at the base
    const glass = new THREE.MeshStandardMaterial({ color: 0x110c16, roughness: 0.18, metalness: 0.4, flatShading: true });
    const shard = (x, z, h, r, lean, ry) => {
      const m = put(root, new THREE.ConeGeometry(r, h, 5), glass, x, -0.33 + h / 2, z, ry);
      m.rotation.z = lean;
      m.castShadow = true;
    };
    for (const sx of [-1, 1]) {
      shard(sx * 6.9, -6.6, 3.6, 0.55, sx * 0.1, 0.4); shard(sx * 7.5, -6.0, 2.0, 0.4, -sx * 0.25, 1.1); shard(sx * 6.4, -7.2, 1.4, 0.35, sx * 0.3, 2.0);
      shard(sx * 6.9, -3.4, 2.6, 0.45, -sx * 0.12, 0.9); shard(sx * 7.4, -3.0, 1.1, 0.3, sx * 0.3, 0.2);
      const ember = put(root, new THREE.CircleGeometry(1.1, 20), glow(0xff3a14, 0.7, 0.5), sx * 6.9, -0.32, -6.5);
      ember.rotation.x = -Math.PI / 2;
    }

    // banners at the four corners of the field
    const banner = (x, z, hex, trim) => {
      const g = new THREE.Group();
      g.position.set(x, -0.33, z);
      const pole = put(g, new THREE.CylinderGeometry(0.035, 0.045, 3.4, 8), new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.7 }), 0, 1.7, 0);
      pole.castShadow = true;
      put(g, new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: trim, metalness: 0.9, roughness: 0.3 }), 0, 3.45, 0);
      const geo = new THREE.PlaneGeometry(0.85, 1.7, 5, 8);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, side: THREE.DoubleSide }));
      cloth.position.set(0.46, 2.45, 0);
      cloth.castShadow = true;
      g.add(cloth);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.1), new THREE.MeshStandardMaterial({ color: trim, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }));
      stripe.position.set(0.46, 3.25, 0.004);
      g.add(stripe);
      g.rotation.y = z > 0 ? Math.PI : 0;
      const base = geo.attributes.position.array.slice();
      tickers.push(s => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1];
          p.setZ(i, Math.sin(s * 2.4 + bx * 5 + by * 1.6 + x) * 0.07 * (bx + 0.43));
        }
        p.needsUpdate = true;
      });
      root.add(g);
    };
    banner(-5.9, 5.9, 0x2f4f9a, 0xd8ab4a); banner(5.9, 5.9, 0x2f4f9a, 0xd8ab4a);
    banner(-5.9, -5.9, 0x7a1420, 0x8a8a94); banner(5.9, -5.9, 0x7a1420, 0x8a8a94);
  }

  // ---------- drifting motes and embers ----------

  function buildDrift() {
    const make = (count, hex, size, zMin, zMax, rise) => {
      const pos = new Float32Array(count * 3), seed = [];
      for (let i = 0; i < count; i++) seed.push([Math.random() * 20 - 10, Math.random(), zMin + Math.random() * (zMax - zMin), 0.6 + Math.random() * 0.8, Math.random() * 6.28]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(hex).multiplyScalar(2.5), size, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      pts.frustumCulled = false;
      root.add(pts);
      tickers.push(s => {
        for (let i = 0; i < count; i++) {
          const [x, off, z, sp, ph] = seed[i];
          const u = (s * rise * sp * 0.12 + off) % 1;
          pos[i * 3] = x + Math.sin(s * 0.7 + ph) * 0.5;
          pos[i * 3 + 1] = -0.3 + u * 5.5;
          pos[i * 3 + 2] = z + Math.cos(s * 0.5 + ph) * 0.4;
        }
        geo.attributes.position.needsUpdate = true;
      });
    };
    make(40, 0xff5a1e, 0.07, -11, -5.5, 1.3);     // embers over the Obsidian ground
    make(26, 0xfff0c0, 0.055, 5.5, 11, 0.5);      // motes of dawn light over the Ivory ground
  }

  // ---------- public ----------

  function build(scene, gfx) {
    root = new THREE.Group();
    scene.add(root);
    buildSky();
    buildMountains();
    buildCastle();
    buildFortress();
    buildProps(gfx);
    buildDrift();
    root.visible = enabled;
  }

  function update(nowMs) {
    if (!root || !enabled) return;
    const s = nowMs * 0.001;
    for (const t of tickers) t(s);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (root) root.visible = enabled;
    try { localStorage.setItem("cor-scene", enabled ? "field" : "plain"); } catch (e) {}
    return enabled;
  }

  return { build, update, setEnabled, get enabled() { return enabled; } };
})();
