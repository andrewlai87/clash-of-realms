"use strict";

/*
 * pieces3d.js — procedural blocky humanoid chess pieces (Crossy-Road-ish
 * chibi proportions). Each piece is a THREE.Group with origin at the tile
 * center, facing -z (white's forward). Board tile = 1 world unit.
 *
 * Limbs are pivot Groups so they can be animated:
 *   userData.parts = {
 *     legs: [{ g, phase }],   // hip/shoulder pivots for the walk cycle
 *     armR, armL,             // shoulder pivots (weapon arm = armR)
 *   }
 *   userData.restArmR         // resting rotation.x for the weapon arm
 *   userData.height           // approx top of head, for battle targeting
 */
const Pieces3D = (() => {

  function palette(color) {
    return color === "w" ? {
      body: 0xe8e0cc, cloth: 0x3d63ab, clothDark: 0x2b4779,
      trim: 0xc9a04e, steel: 0xc4cbd8, skin: 0xdfae83,
      hair: 0x6b4520, beard: 0xe0dcd2, stone: 0xcfc7b4, stoneDark: 0x9a9182,
      glow: 0x6fd2ff, horse: 0xece5d4,
    } : {
      body: 0x413e4c, cloth: 0x96303f, clothDark: 0x5e1e28,
      trim: 0xa5772e, steel: 0x7e8494, skin: 0xb99a8c,
      hair: 0x241d18, beard: 0xb4aec2, stone: 0x5c5650, stoneDark: 0x403b35,
      glow: 0xc86bff, horse: 0x4e453e,
    };
  }

  const WOOD = 0x6b4e2e;
  const EYE = 0x1c1a24;

  function mat(hex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: opts.roughness ?? 0.62,
      metalness: opts.metalness ?? 0.08,
      flatShading: true,
    });
  }
  function goldMat(hex) { return mat(hex, { roughness: 0.35, metalness: 0.75 }); }
  function steelMat(hex) { return mat(hex, { roughness: 0.4, metalness: 0.6 }); }
  function glowMat(hex) {
    return new THREE.MeshStandardMaterial({
      color: 0x111118, emissive: hex, emissiveIntensity: 2.2, roughness: 0.4,
    });
  }

  function add(parent, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // pivot group (for limbs) at a given position
  function pivot(parent, x, y, z) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);

  function eyes(parent, P, y, z, dx = 0.038, r = 0.014) {
    add(parent, sph(r, 6), mat(EYE), -dx, y, z);
    add(parent, sph(r, 6), mat(EYE), dx, y, z);
  }

  // simple two-legged base; returns leg pivots
  function legs(g, P, hipX, hipY, legW, legH, bootMat) {
    const out = [];
    for (const side of [-1, 1]) {
      const hip = pivot(g, side * hipX, hipY, 0);
      add(hip, box(legW, legH, legW * 1.1), mat(P.clothDark), 0, -legH / 2, 0);
      add(hip, box(legW * 1.15, 0.07, legW * 1.6), bootMat || mat(P.clothDark), 0, -legH + 0.015, -legW * 0.25);
      out.push({ g: hip, phase: side === -1 ? 0 : Math.PI });
    }
    return out;
  }

  // ---------- Footman (pawn) ----------
  function pawn(g, P) {
    const parts = { legs: legs(g, P, 0.07, 0.34, 0.09, 0.34, mat(P.clothDark)) };
    // torso: armor with cloth tabard
    add(g, box(0.26, 0.28, 0.17), mat(P.body, { metalness: 0.3, roughness: 0.5 }), 0, 0.48, 0);
    add(g, box(0.15, 0.26, 0.02), mat(P.cloth), 0, 0.46, -0.09);
    add(g, box(0.27, 0.05, 0.18), mat(P.clothDark), 0, 0.355, 0);
    add(g, box(0.07, 0.06, 0.02), goldMat(P.trim), 0, 0.355, -0.09);
    // arms
    parts.armR = pivot(g, 0.16, 0.585, 0);
    parts.armL = pivot(g, -0.16, 0.585, 0);
    for (const a of [parts.armR, parts.armL]) {
      add(a, sph(0.06), mat(P.body, { metalness: 0.3 }), 0, 0.01, 0);
      add(a, box(0.08, 0.26, 0.09), mat(P.cloth), 0, -0.14, 0);
      add(a, sph(0.045), mat(P.skin), 0, -0.28, 0);
    }
    // spear (in right hand, sticking up)
    add(parts.armR, cyl(0.015, 0.015, 0.8, 7), mat(WOOD), 0, -0.08, -0.02);
    add(parts.armR, cone(0.03, 0.1, 8), steelMat(P.steel), 0, 0.37, -0.02);
    // shield (on left forearm)
    add(parts.armL, cyl(0.125, 0.125, 0.035, 12), mat(P.cloth), -0.07, -0.18, 0, 0, 0, Math.PI / 2);
    add(parts.armL, sph(0.04), goldMat(P.trim), -0.095, -0.18, 0);
    // head + helm
    add(g, sph(0.105), mat(P.skin), 0, 0.73, 0);
    eyes(g, P, 0.745, -0.093);
    add(g, new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(P.body, { metalness: 0.4, roughness: 0.4 }), 0, 0.735, 0);
    add(g, box(0.24, 0.03, 0.24), mat(P.body, { metalness: 0.4 }), 0, 0.735, 0);
    add(g, box(0.026, 0.08, 0.02), mat(P.body, { metalness: 0.4 }), 0, 0.72, -0.108);
    g.userData.parts = parts;
    g.userData.height = 0.86;
  }

  // ---------- Knight (armored rider on a blocky warhorse) ----------
  function knight(g, P) {
    const parts = { legs: [] };
    const horseMat = mat(P.horse);
    // horse legs (diagonal gallop pairs)
    for (const [x, z, phase] of [[-0.11, -0.21, 0], [0.11, 0.21, 0], [0.11, -0.21, Math.PI], [-0.11, 0.21, Math.PI]]) {
      const hip = pivot(g, x, 0.36, z);
      add(hip, box(0.07, 0.34, 0.08), horseMat, 0, -0.17, 0);
      add(hip, box(0.078, 0.05, 0.09), mat(P.stoneDark), 0, -0.335, 0);
      parts.legs.push({ g: hip, phase });
    }
    // body + caparison (cloth drape)
    add(g, box(0.3, 0.24, 0.62), horseMat, 0, 0.47, 0);
    add(g, box(0.34, 0.12, 0.66), mat(P.cloth), 0, 0.47, 0);
    add(g, box(0.35, 0.04, 0.67), goldMat(P.trim), 0, 0.405, 0);
    // neck + head
    add(g, box(0.13, 0.3, 0.17), horseMat, 0, 0.68, -0.26, -0.45, 0, 0);
    const head = add(g, box(0.11, 0.13, 0.3), horseMat, 0, 0.84, -0.4, -0.1, 0, 0);
    add(g, box(0.115, 0.04, 0.26), goldMat(P.trim), 0, 0.91, -0.42, -0.1, 0, 0);  // chanfron
    add(g, cone(0.03, 0.09, 6), horseMat, -0.045, 0.94, -0.32);
    add(g, cone(0.03, 0.09, 6), horseMat, 0.045, 0.94, -0.32);
    add(g, sph(0.02, 6), glowMat(P.glow), -0.058, 0.85, -0.5);
    add(g, sph(0.02, 6), glowMat(P.glow), 0.058, 0.85, -0.5);
    // mane + tail
    add(g, box(0.06, 0.3, 0.1), mat(P.hair), 0, 0.72, -0.15, -0.45, 0, 0);
    add(g, box(0.06, 0.26, 0.07), mat(P.hair), 0, 0.42, 0.33, 0.5, 0, 0);
    // rider
    const riderArmor = mat(P.body, { metalness: 0.35, roughness: 0.45 });
    add(g, box(0.18, 0.24, 0.13), riderArmor, 0, 0.74, 0.06);
    add(g, box(0.05, 0.16, 0.08), mat(P.clothDark), -0.16, 0.62, 0.04, 0.35, 0, 0);
    add(g, box(0.05, 0.16, 0.08), mat(P.clothDark), 0.16, 0.62, 0.04, 0.35, 0, 0);
    // great-helm fully enclosing the head, with visor slit + plume
    add(g, box(0.15, 0.15, 0.15), riderArmor, 0, 0.93, 0.06);
    add(g, box(0.12, 0.028, 0.02), mat(EYE), 0, 0.945, -0.021);
    add(g, cone(0.035, 0.15, 6), mat(P.cloth), 0, 1.07, 0.06);
    // lance arm
    parts.armR = pivot(g, 0.14, 0.8, 0.06);
    add(parts.armR, box(0.055, 0.16, 0.065), riderArmor, 0, -0.07, 0);
    add(parts.armR, cyl(0.018, 0.018, 0.9, 7), mat(WOOD), 0.025, 0.12, 0);
    add(parts.armR, cone(0.032, 0.1, 8), steelMat(P.steel), 0.025, 0.61, 0);
    add(parts.armR, box(0.018, 0.09, 0.14), mat(P.cloth), 0.025, 0.51, 0.07);
    g.userData.parts = parts;
    g.userData.height = 1.12;
  }

  // ---------- Battlemage (bishop) ----------
  function bishop(g, P) {
    const parts = { legs: [] };  // robed: glides
    add(g, cyl(0.13, 0.24, 0.52, 12), mat(P.cloth), 0, 0.26, 0);
    add(g, cyl(0.235, 0.245, 0.05, 12), mat(P.clothDark), 0, 0.045, 0);
    add(g, box(0.22, 0.2, 0.16), mat(P.cloth), 0, 0.58, 0);
    add(g, box(0.23, 0.04, 0.17), goldMat(P.trim), 0, 0.5, 0);
    parts.armR = pivot(g, 0.14, 0.64, 0);
    parts.armL = pivot(g, -0.14, 0.64, 0);
    for (const a of [parts.armR, parts.armL]) {
      add(a, box(0.11, 0.26, 0.12), mat(P.clothDark), 0, -0.12, 0);
      add(a, sph(0.04), mat(P.skin), 0, -0.26, 0);
    }
    // staff with glowing orb (right hand)
    add(parts.armR, cyl(0.014, 0.014, 0.85, 7), mat(WOOD), 0.02, -0.02, -0.02);
    add(parts.armR, cyl(0.03, 0.045, 0.05, 8), goldMat(P.trim), 0.02, 0.38, -0.02);
    const orb = add(parts.armR, sph(0.055, 8), glowMat(P.glow), 0.02, 0.44, -0.02);
    // head, beard, hat
    add(g, sph(0.1), mat(P.skin), 0, 0.86, 0);
    eyes(g, P, 0.88, -0.088, 0.036);
    const beard = add(g, cone(0.06, 0.17, 8), mat(P.beard), 0, 0.77, -0.06);
    beard.rotation.x = Math.PI;
    add(g, cyl(0.16, 0.16, 0.025, 12), mat(P.clothDark), 0, 0.945, 0);
    add(g, cone(0.11, 0.34, 10), mat(P.cloth), 0.012, 1.12, 0, 0, 0, -0.1);
    add(g, sph(0.024, 6), goldMat(P.trim), 0.045, 1.28, 0);
    g.userData.parts = parts;
    g.userData.height = 1.05;
    g.userData.animate = t => { orb.material.emissiveIntensity = 2.0 + Math.sin(t * 0.004) * 0.7; };
  }

  // ---------- Stone Golem (rook) ----------
  function rook(g, P) {
    const parts = { legs: [] };
    const stone = mat(P.stone, { roughness: 0.85 });
    const stoneD = mat(P.stoneDark, { roughness: 0.9 });
    // stumpy legs
    for (const side of [-1, 1]) {
      const hip = pivot(g, side * 0.12, 0.3, 0);
      add(hip, box(0.14, 0.26, 0.16), stone, 0, -0.13, 0);
      add(hip, box(0.17, 0.07, 0.21), stoneD, 0, -0.275, -0.015);
      parts.legs.push({ g: hip, phase: side === -1 ? 0 : Math.PI });
    }
    // massive torso
    add(g, box(0.42, 0.36, 0.28), stone, 0, 0.5, 0);
    add(g, box(0.3, 0.2, 0.05), stoneD, 0, 0.52, -0.15);
    add(g, box(0.05, 0.09, 0.02), glowMat(P.glow), 0, 0.52, -0.18);           // chest rune
    add(g, box(0.16, 0.15, 0.21), stone, -0.27, 0.66, 0);
    add(g, box(0.16, 0.15, 0.21), stone, 0.27, 0.66, 0);
    // arms with huge fists
    parts.armR = pivot(g, 0.3, 0.64, 0);
    parts.armL = pivot(g, -0.3, 0.64, 0);
    for (const a of [parts.armR, parts.armL]) {
      add(a, box(0.13, 0.3, 0.15), stone, 0, -0.14, 0);
      add(a, box(0.18, 0.16, 0.19), stoneD, 0, -0.36, 0);
    }
    // head with crenellated crown (a nod to the rook tower)
    add(g, box(0.17, 0.15, 0.16), stone, 0, 0.83, 0);
    add(g, sph(0.024, 6), glowMat(P.glow), -0.045, 0.84, -0.085);
    add(g, sph(0.024, 6), glowMat(P.glow), 0.045, 0.84, -0.085);
    for (const [x, z] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) {
      add(g, box(0.055, 0.08, 0.055), stone, x, 0.94, z);
    }
    g.userData.parts = parts;
    g.userData.height = 0.98;
    const e = g.children.filter(c => c.material && c.material.emissive);
    g.userData.animate = t => {
      const p = 1.8 + Math.sin(t * 0.003) * 0.5;
      for (const m of e) m.material.emissiveIntensity = p;
    };
  }

  // ---------- Sorceress-Queen ----------
  function queen(g, P) {
    const parts = { legs: [] };  // gowned: glides
    add(g, cyl(0.11, 0.23, 0.58, 12), mat(P.cloth), 0, 0.29, 0);
    add(g, cyl(0.225, 0.235, 0.04, 12), goldMat(P.trim), 0, 0.04, 0);
    add(g, box(0.2, 0.22, 0.14), mat(P.clothDark), 0, 0.66, 0);
    add(g, sph(0.02, 6), glowMat(P.glow), 0, 0.73, -0.075);                    // necklace gem
    parts.armR = pivot(g, 0.13, 0.72, 0);
    parts.armL = pivot(g, -0.13, 0.72, 0);
    for (const a of [parts.armR, parts.armL]) {
      add(a, box(0.06, 0.24, 0.07), mat(P.cloth), 0, -0.11, 0);
      add(a, sph(0.035), mat(P.skin), 0, -0.24, 0);
    }
    // scepter with floating gem
    add(parts.armR, cyl(0.011, 0.011, 0.5, 7), goldMat(P.trim), 0.015, -0.03, -0.015);
    const gem = add(parts.armR, new THREE.OctahedronGeometry(0.05), glowMat(P.glow), 0.015, 0.26, -0.015);
    // head, hair, crown
    add(g, sph(0.095), mat(P.skin), 0, 0.9, 0);
    eyes(g, P, 0.92, -0.083, 0.035);
    add(g, box(0.19, 0.3, 0.08), mat(P.hair), 0, 0.82, 0.08);
    add(g, new THREE.SphereGeometry(0.103, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(P.hair), 0, 0.905, 0.01);
    add(g, cyl(0.068, 0.075, 0.045, 10), goldMat(P.trim), 0, 1.01, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(g, cone(0.016, 0.055, 6), goldMat(P.trim), Math.cos(a) * 0.055, 1.055, Math.sin(a) * 0.055);
    }
    add(g, sph(0.02, 6), glowMat(P.glow), 0, 1.02, -0.068);
    g.userData.parts = parts;
    g.userData.height = 1.1;
    g.userData.animate = t => {
      gem.rotation.y = t * 0.0012;
      gem.material.emissiveIntensity = 2.0 + Math.sin(t * 0.0035) * 0.6;
    };
  }

  // ---------- High King ----------
  function king(g, P) {
    const armorMat = mat(P.body, { metalness: 0.35, roughness: 0.45 });
    const parts = { legs: legs(g, P, 0.08, 0.36, 0.1, 0.36, armorMat) };
    // torso, cape, tabard
    add(g, box(0.3, 0.3, 0.19), armorMat, 0, 0.53, 0);
    add(g, box(0.16, 0.28, 0.02), mat(P.cloth), 0, 0.5, -0.1);
    add(g, box(0.31, 0.05, 0.2), mat(P.clothDark), 0, 0.39, 0);
    add(g, box(0.08, 0.07, 0.02), goldMat(P.trim), 0, 0.39, -0.1);
    add(g, box(0.34, 0.52, 0.03), mat(P.clothDark), 0, 0.44, 0.13, 0.08, 0, 0);
    // pauldrons + arms
    parts.armR = pivot(g, 0.19, 0.655, 0);
    parts.armL = pivot(g, -0.19, 0.655, 0);
    for (const a of [parts.armR, parts.armL]) {
      add(a, sph(0.075), goldMat(P.trim), 0, 0.02, 0);
      add(a, box(0.09, 0.28, 0.1), armorMat, 0, -0.15, 0);
      add(a, sph(0.05), mat(P.skin), 0, -0.3, 0);
    }
    // greatsword (right hand, point down)
    add(parts.armR, sph(0.028, 6), goldMat(P.trim), 0, -0.24, 0);
    add(parts.armR, cyl(0.018, 0.018, 0.1, 7), mat(P.clothDark), 0, -0.3, 0);
    add(parts.armR, box(0.19, 0.035, 0.045), goldMat(P.trim), 0, -0.36, 0);
    add(parts.armR, box(0.05, 0.5, 0.016), steelMat(P.steel), 0, -0.62, 0);
    const tip = add(parts.armR, cone(0.026, 0.08, 4), steelMat(P.steel), 0, -0.9, 0);
    tip.rotation.x = Math.PI;
    tip.rotation.y = Math.PI / 4;
    // head, beard, crown
    add(g, sph(0.105), mat(P.skin), 0, 0.8, 0);
    eyes(g, P, 0.825, -0.092);
    const beard = add(g, cone(0.068, 0.19, 8), mat(P.beard), 0, 0.7, -0.055);
    beard.rotation.x = Math.PI;
    add(g, cyl(0.082, 0.09, 0.055, 10), goldMat(P.trim), 0, 0.92, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(g, cone(0.018, 0.06, 6), goldMat(P.trim), Math.cos(a) * 0.068, 0.975, Math.sin(a) * 0.068);
    }
    add(g, box(0.018, 0.09, 0.018), goldMat(P.trim), 0, 1.02, 0);
    add(g, box(0.06, 0.018, 0.018), goldMat(P.trim), 0, 1.035, 0);
    add(g, sph(0.022, 6), glowMat(P.glow), 0, 0.925, -0.085);
    g.userData.parts = parts;
    g.userData.height = 1.06;
    g.userData.restArmR = 0.32;   // sword held slightly forward at rest
  }

  const BUILDERS = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

  function build(type, color) {
    const g = new THREE.Group();
    const P = palette(color);
    g.userData = { type, color, height: 1, restArmR: 0 };
    BUILDERS[type](g, P);
    if (g.userData.parts && g.userData.parts.armR) {
      g.userData.parts.armR.rotation.x = g.userData.restArmR || 0;
    }
    if (color === "b") g.rotation.y = Math.PI;
    return g;
  }

  return { build, palette };
})();
