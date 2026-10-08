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

  function buildProcedural(type, color) {
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

  // ================= rigged KayKit characters =================
  // Ivory Order = Adventurers pack, Obsidian Legion = Skeletons pack.
  // Rooks stay procedural stone golems on both sides (no golem in the packs,
  // and a "constructed" piece among the living reads well).

  const MODELS = {};       // name -> {scene, animations}
  const WEAPONS = {};      // name -> scene (non-skinned accessory)
  let modelsReady = false;

  const CHAR_FILES = {
    Knight: "assets/models/Knight.glb",
    Barbarian: "assets/models/Barbarian.glb",
    Mage: "assets/models/Mage.glb",
    Rogue: "assets/models/Rogue.glb",
    Skeleton_Warrior: "assets/models/Skeleton_Warrior.glb",
    Skeleton_Mage: "assets/models/Skeleton_Mage.glb",
    Skeleton_Minion: "assets/models/Skeleton_Minion.glb",
    Skeleton_Rogue: "assets/models/Skeleton_Rogue.glb",
  };
  const WEAPON_FILES = {
    blade: "assets/models/Skeleton_Blade.gltf",
    staff: "assets/models/Skeleton_Staff.gltf",
  };

  // every optional gear mesh per model; build() hides these, then shows cfg.show
  const GEAR = {
    Knight: ["1H_Sword_Offhand", "Badge_Shield", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "1H_Sword", "2H_Sword", "Knight_Helmet", "Knight_Cape"],
    Barbarian: ["1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "2H_Axe", "Mug", "Barbarian_Hat", "Barbarian_Cape"],
    Mage: ["Spellbook", "Spellbook_open", "1H_Wand", "2H_Staff", "Mage_Hat", "Mage_Cape"],
    Rogue: ["Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Knife", "Throwable", "Rogue_Cape"],
    Skeleton_Warrior: ["Skeleton_Warrior_Helmet", "Skeleton_Warrior_Cloak"],
    Skeleton_Mage: ["Skeleton_Mage_Hat"],
    Skeleton_Minion: ["Skeleton_Minion_Cloak"],
    Skeleton_Rogue: ["Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"],
  };

  // role config: which character, which gear, which attack clip
  const ROLE = {
    w: {
      p: { model: "Knight", show: ["1H_Sword", "Badge_Shield", "Knight_Helmet"], attack: "1H_Melee_Attack_Slice_Diagonal", scale: 0.42 },
      n: { model: "Barbarian", show: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"], attack: "2H_Melee_Attack_Spin", scale: 0.46 },
      b: { model: "Mage", show: ["2H_Staff", "Mage_Hat"], attack: "Spellcast_Shoot", scale: 0.45 },
      q: { model: "Rogue", show: ["Rogue_Cape"], crown: true, attack: "Spellcast_Shoot", scale: 0.48 },
      k: { model: "Knight", show: ["2H_Sword", "Knight_Cape"], crown: true, attack: "2H_Melee_Attack_Slice", scale: 0.52 },
    },
    b: {
      p: { model: "Skeleton_Minion", show: [], attack: "Unarmed_Melee_Attack_Punch_A", scale: 0.42 },
      n: { model: "Skeleton_Warrior", show: ["Skeleton_Warrior_Helmet"], weapon: "blade", attack: "1H_Melee_Attack_Chop", scale: 0.46 },
      b: { model: "Skeleton_Mage", show: ["Skeleton_Mage_Hat"], weapon: "staff", attack: "Spellcast_Shoot", scale: 0.45 },
      q: { model: "Skeleton_Rogue", show: ["Skeleton_Rogue_Hood", "Skeleton_Rogue_Cape"], crown: true, attack: "Spellcast_Shoot", scale: 0.48 },
      k: { model: "Skeleton_Warrior", show: ["Skeleton_Warrior_Cloak"], weapon: "blade", crown: true, attack: "1H_Melee_Attack_Slice_Diagonal", scale: 0.52 },
    },
  };

  function load() {
    if (!THREE.GLTFLoader) return Promise.resolve(false);
    const loader = new THREE.GLTFLoader();
    const one = (url, cb) => new Promise(res =>
      loader.load(url, g => { cb(g); res(true); }, undefined, err => {
        console.warn("model load failed:", url, err);
        res(false);
      }));
    const quiet = (url, cb) => new Promise(res =>
      loader.load(url, g => { cb(g); res(true); }, undefined, () => res(false)));
    const jobs = [
      ...Object.entries(MX_FILES).map(([n, u]) => quiet(u, g => { MX[n] = g; })),
      quiet(MOUNT_FILE, g => { mountSrc = g; }),
      quiet(PHX_FILE, g => { phxSrc = g; }),
      quiet("assets/models/mx/props.glb", g => { armsSrc = g; }),
      quiet(MAGE_FILE, g => { mageSrc = g; }),
      quiet(WINGS_FILE, g => { prepWings(g); }),
      quiet(NYX_FILE, g => { nyxSrc = g; }),
      ...Object.entries(HEAVY).map(([c, cfg]) => quiet(cfg.file, g => { heavySrc[c] = g; })),
      ...Object.entries(MX_ANIMS).map(([n, u]) => quiet(u, g => {
        const clip = g.animations[0];
        if (!clip) return;
        clip.name = n;
        const hips = g.scene.getObjectByName(HIPS);
        MX_SRC[n] = { clip, rest: hips ? hips.position.toArray() : [0, 1, 0] };
      })),
      ...Object.entries(CHAR_FILES).map(([n, u]) => one(u, g => { MODELS[n] = g; })),
      ...Object.entries(WEAPON_FILES).map(([n, u]) => one(u, g => { WEAPONS[n] = g.scene; })),
    ];
    return Promise.all(jobs).then(oks => {
      modelsReady = Object.keys(MODELS).length === Object.keys(CHAR_FILES).length;
      return modelsReady;
    });
  }

  // small gold crown built from primitives, attached to the head bone
  function makeCrown(color, big) {
    const P = palette(color);
    const c = new THREE.Group();
    const r = big ? 0.13 : 0.11;
    add(c, cyl(r, r * 1.08, 0.09, 10), goldMat(P.trim), 0, 0.045, 0);
    const spikes = big ? 5 : 4;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      add(c, cone(0.03, 0.09, 6), goldMat(P.trim), Math.cos(a) * r * 0.82, 0.12, Math.sin(a) * r * 0.82);
    }
    add(c, sph(0.035, 6), glowMat(P.glow), 0, 0.05, -r * 0.95);
    return c;
  }

  // a king's crown: tall points, a jewelled band, and arches closing over an orb
  function makeRoyalCrown(color) {
    const dark = color === "b";
    const c = new THREE.Group();
    const metal = dark ? mat(0x2b2530, { roughness: 0.3, metalness: 0.9 }) : goldMat(0xe2b23c);
    const trim = goldMat(dark ? 0x8a6a2c : 0xf3d27a);
    const gem = hex => new THREE.MeshStandardMaterial({ color: 0x120608, emissive: hex, emissiveIntensity: 1.6, roughness: 0.2 });
    const r = 0.14;
    metal.flatShading = trim.flatShading = false;
    add(c, cyl(r, r * 1.05, 0.075, 24), metal, 0, 0.04, 0);
    add(c, new THREE.TorusGeometry(r * 1.04, 0.012, 8, 28), trim, 0, 0.008, 0, Math.PI / 2);
    add(c, new THREE.TorusGeometry(r, 0.012, 8, 28), trim, 0, 0.078, 0, Math.PI / 2);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, tall = i % 2 === 0;
      const h = dark ? (tall ? 0.2 : 0.12) : (tall ? 0.13 : 0.08);
      add(c, cone(dark ? 0.02 : 0.028, h, 6), metal, Math.cos(a) * r * 0.95, 0.078 + h / 2, Math.sin(a) * r * 0.95);
      if (!dark && tall) add(c, sph(0.016, 8), trim, Math.cos(a) * r * 0.95, 0.078 + h, Math.sin(a) * r * 0.95);
      // jewels set around the band
      const ga = a + Math.PI / n;
      add(c, sph(0.018, 8), gem(dark ? 0xff1a2a : (i % 2 ? 0x2f7bff : 0xff2a3a)), Math.cos(ga) * r * 1.03, 0.042, Math.sin(ga) * r * 1.03);
    }
    if (!dark) {
      // velvet cap, with four arches meeting under an orb
      const cap = add(c, sph(r * 0.9, 16), new THREE.MeshStandardMaterial({ color: 0x7a1220, roughness: 0.95 }), 0, 0.09, 0);
      cap.scale.y = 0.75;
      for (let i = 0; i < 4; i++) {
        const arch = add(c, new THREE.TorusGeometry(r * 0.95, 0.011, 6, 16, Math.PI), trim, 0, 0.085, 0);
        arch.scale.y = 0.95;
        arch.rotation.y = (i / 4) * Math.PI;
      }
      add(c, sph(0.03, 12), trim, 0, 0.245, 0);
      add(c, box(0.014, 0.07, 0.014), trim, 0, 0.3, 0);
      add(c, box(0.045, 0.014, 0.014), trim, 0, 0.305, 0);
    } else {
      add(c, sph(0.026, 10), gem(0xff1a2a), 0, 0.05, -r * 1.04);
    }
    return c;
  }

  let softTex = null;
  function softBlot() {
    if (softTex) return softTex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return (softTex = new THREE.CanvasTexture(c));
  }

  // black steel to white enamel, keeping (and brightening) anything gilded
  const royalMaps = {};
  function royalTexture(tex) {
    if (royalMaps[tex.uuid]) return royalMaps[tex.uuid];
    const img = tex.image, c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      // warm, saturated pixels are trim, leather and cloth: turn them gold
      const warm = Math.max(0, Math.min(1, (r - b - 14) / 40));
      const en = Math.min(255, 96 + l * 2.1);
      px[i] = en * (1 - warm) + Math.min(255, 70 + l * 2.6) * warm;
      px[i + 1] = en * 0.97 * (1 - warm) + Math.min(255, 45 + l * 2.0) * warm;
      px[i + 2] = en * 0.9 * (1 - warm) + Math.min(255, l * 0.7) * warm;
    }
    ctx.putImageData(d, 0, 0);
    const out = tex.clone();
    out.source = new THREE.Source(c);
    out.needsUpdate = true;
    return (royalMaps[tex.uuid] = out);
  }

  // Kings rule by majesty, not might: a stepped dais, a royal cape, and an
  // omen that follows them (rising gold motes, or bats and a red mist).
  function makeKing(g, char, color, h) {
    const dark = color === "b";
    const RISE = 0.1;
    char.position.y = RISE;
    g.userData.height = h + RISE;
    // --- the dais ---
    const stone = new THREE.MeshStandardMaterial(dark
      ? { color: 0x17141c, roughness: 0.22, metalness: 0.35 } : { color: 0xf4efe4, roughness: 0.3, metalness: 0.05 });
    const trim = goldMat(dark ? 0x9a2f3c : 0xe2b23c);
    trim.flatShading = false;
    add(g, cyl(0.45, 0.47, 0.05, 40), stone, 0, 0.025, 0);
    add(g, cyl(0.37, 0.39, 0.05, 40), stone, 0, 0.075, 0);
    add(g, new THREE.TorusGeometry(0.455, 0.011, 8, 48), trim, 0, 0.05, 0, Math.PI / 2);
    add(g, new THREE.TorusGeometry(0.375, 0.011, 8, 48), trim, 0, 0.1, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      add(g, sph(0.02, 8), trim, Math.cos(a) * 0.415, 0.055, Math.sin(a) * 0.415);
    }

    // --- the cape: hangs from the shoulders, behind him (his back is +z) ---
    const neck = char.getObjectByName("mixamorigNeck");
    const cape = new THREE.Group();
    g.add(cape);
    const shL = char.getObjectByName("mixamorigLeftShoulder"), shR = char.getObjectByName("mixamorigRightShoulder");
    const at = new THREE.Vector3(), pl = new THREE.Vector3(), pr = new THREE.Vector3(), back = new THREE.Vector3();
    const anchor = () => { g.updateMatrixWorld(true); return g.worldToLocal(neck.getWorldPosition(at)); };
    // which way his back points, from the line of his shoulders (he may stand side-on)
    let flip = 1;
    const backDir = () => {
      g.worldToLocal(shL.getWorldPosition(pl)); g.worldToLocal(shR.getWorldPosition(pr));
      return back.set(pl.z - pr.z, 0, pr.x - pl.x).normalize().multiplyScalar(flip);
    };
    if (shL && shR) { g.updateMatrixWorld(true); if (backDir().z < 0) flip = -1; }     // in the bind pose he faces -z
    let len = h * 0.72;
    if (neck) len = anchor().y - 0.16;
    const W0 = h * 0.2, W1 = h * (dark ? 0.4 : 0.34);
    const geo = new THREE.PlaneGeometry(1, 1, 10, 14);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * 2, v = 0.5 - pos.getY(i);          // u: -1..1 across, v: 0 at the shoulders, 1 at the hem
      const w = W0 + (W1 - W0) * Math.pow(v, 0.8);
      const wrap = (1 - v) * 0.55 + 0.12;                         // curls round the shoulders, flatter at the hem
      pos.setXYZ(i, u * w * (1 - wrap * 0.12 * u * u), -v * len,
        -u * u * w * wrap + v * h * 0.1 + Math.sin(v * 7 + u * 2.5) * 0.012 * v);
    }
    geo.computeVertexNormals();
    const outer = new THREE.MeshStandardMaterial({ color: dark ? 0x121016 : 0x7c1424, roughness: 0.9, side: THREE.FrontSide });
    const lining = new THREE.MeshStandardMaterial({ color: dark ? 0x8a1524 : 0xe9e2d2, roughness: 0.95, side: THREE.BackSide });
    // The sheet is real cloth: a grid of points hung from the shoulders, pulled
    // by gravity and pushed off his body, simulated in world space so it trails
    // and settles on its own. Its vertices are written back in the piece's space.
    for (const m of [outer, lining]) { const sheet = new THREE.Mesh(geo, m); sheet.castShadow = true; sheet.frustumCulled = false; g.add(sheet); }
    const COLS = 11, ROWS = 15, N = COLS * ROWS;
    const rest = [], P = [], Q = [];           // rest shape (cape space), position, previous position (world)
    for (let i = 0; i < N; i++) { rest.push(new THREE.Vector3().fromBufferAttribute(pos, i)); P.push(new THREE.Vector3()); Q.push(new THREE.Vector3()); }
    const links = [];
    const link = (a, b) => links.push([a, b, rest[a].distanceTo(rest[b])]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (r + 1 < ROWS) link(i, i + COLS);
      if (c + 1 < COLS) link(i, i + 1);
      if (r + 1 < ROWS && c + 1 < COLS) { link(i, i + COLS + 1); link(i + 1, i + COLS); }
      if (r + 2 < ROWS) link(i, i + 2 * COLS);          // resists folding
      if (c + 2 < COLS) link(i, i + 2);
    }
    const tether = rest.map((p, i) => p.distanceTo(rest[i % COLS]) * 1.03);    // never stretches past its own length
    // his body, as capsules between joints: [from, to, radius]
    const B = n => char.getObjectByName("mixamorig" + n);
    const body = [
      ["Hips", "Spine2", 0.118], ["Spine2", "Neck", 0.112], ["Neck", "Head", 0.075],
      ["LeftUpLeg", "LeftLeg", 0.074], ["LeftLeg", "LeftFoot", 0.058], ["RightUpLeg", "RightLeg", 0.074], ["RightLeg", "RightFoot", 0.058],
      ["LeftArm", "LeftForeArm", 0.056], ["LeftForeArm", "LeftHand", 0.05], ["RightArm", "RightForeArm", 0.056], ["RightForeArm", "RightHand", 0.05],
    ].map(([a, b, r]) => ({ a: B(a), b: B(b), r: r * h, pa: new THREE.Vector3(), pb: new THREE.Vector3() })).filter(k => k.a && k.b);
    // the vampire's robe hangs from his hips: the cape lies over it
    const skirt = dark && B("Hips") ? { a: B("Hips"), r: 0.19 * h, pa: new THREE.Vector3(), pb: new THREE.Vector3() } : null;
    const d = new THREE.Vector3(), cpt = new THREE.Vector3(), inv = new THREE.Matrix4();
    const pushOut = (p, k) => {
      d.subVectors(k.pb, k.pa);
      const t = Math.max(0, Math.min(1, cpt.subVectors(p, k.pa).dot(d) / (d.lengthSq() || 1)));
      cpt.copy(k.pa).addScaledVector(d, t);
      d.subVectors(p, cpt);
      const l = d.length();
      if (l < k.r && l > 1e-5) p.addScaledVector(d, (k.r - l) / l);
    };
    let live = false, clock = 0;
    const cloth = () => {
      const now = performance.now(), dt = Math.min(1 / 30, Math.max(1 / 240, (now - clock) / 1000));
      const jumped = now - clock > 400;
      clock = now;
      cape.updateMatrixWorld(true);
      // the top edge is sewn to the shoulders
      let far = false;
      for (let c = 0; c < COLS; c++) {
        d.copy(rest[c]).applyMatrix4(cape.matrixWorld);
        if (P[c].distanceTo(d) > 0.7) far = true;
        P[c].copy(d); Q[c].copy(d);
      }
      if (!live || jumped || far) {
        // first frame, or he was just placed somewhere new: hang at rest
        for (let i = COLS; i < N; i++) { P[i].copy(rest[i]).applyMatrix4(cape.matrixWorld); Q[i].copy(P[i]); }
        live = true;
      }
      for (const k of body) { k.pa.setFromMatrixPosition(k.a.matrixWorld); k.pb.setFromMatrixPosition(k.b.matrixWorld); }
      const floor = g.position.y + RISE + 0.03;
      if (skirt) { skirt.pa.setFromMatrixPosition(skirt.a.matrixWorld); skirt.pb.copy(skirt.pa).setY(floor + skirt.r * 0.5); }
      const s = now * 0.001, k2 = dt * dt;
      for (let i = COLS; i < N; i++) {
        const p = P[i], q = Q[i];
        d.subVectors(p, q).multiplyScalar(0.965);
        q.copy(p);
        p.add(d);
        p.y -= 11 * k2;
        // a breath of wind keeps the hem alive
        const v = Math.floor(i / COLS) / (ROWS - 1);
        p.x += Math.sin(s * 1.1 + i * 0.37) * 0.25 * k2 * v;
        p.z += Math.cos(s * 0.8 + i * 0.21) * 0.25 * k2 * v;
      }
      for (let it = 0; it < 6; it++) {
        for (const [a, b, len] of links) {
          d.subVectors(P[b], P[a]);
          const l = d.length() || 1e-6, f = (l - len) / l * 0.5;
          if (a >= COLS) P[a].addScaledVector(d, b >= COLS ? f : f * 2);
          if (b >= COLS) P[b].addScaledVector(d, a >= COLS ? -f : -f * 2);
        }
        for (let i = COLS; i < N; i++) {
          const p = P[i];
          for (const k of body) pushOut(p, k);
          if (skirt) pushOut(p, skirt);
          if (p.y < floor) p.y = floor;
        }
      }
      for (let i = COLS; i < N; i++) {
        const pin = P[i % COLS];
        d.subVectors(P[i], pin);
        const l = d.length();
        if (l > tether[i]) P[i].copy(pin).addScaledVector(d, tether[i] / l);
      }
      inv.copy(g.matrixWorld).invert();
      for (let i = 0; i < N; i++) { d.copy(P[i]).applyMatrix4(inv); pos.setXYZ(i, d.x, d.y, d.z); }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };
    if (dark) {
      // a high standing collar
      const cg = new THREE.CylinderGeometry(h * 0.16, h * 0.105, h * 0.17, 20, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
      add(cape, cg, new THREE.MeshStandardMaterial({ color: 0x121016, roughness: 0.85, side: THREE.FrontSide }), 0, h * 0.045, -h * 0.085);
      add(cape, cg, new THREE.MeshStandardMaterial({ color: 0x8a1524, roughness: 0.9, side: THREE.BackSide }), 0, h * 0.045, -h * 0.085);
    } else {
      // an ermine mantle across the shoulders, clasped in gold
      const fur = new THREE.MeshStandardMaterial({ color: 0xf6f1e6, roughness: 1 });
      const mantle = add(cape, new THREE.TorusGeometry(h * 0.105, h * 0.032, 10, 28), fur, 0, -h * 0.02, -h * 0.075, Math.PI / 2);
      mantle.scale.set(1.3, 1, 0.75);
      const spot = new THREE.MeshStandardMaterial({ color: 0x1a1614, roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        add(cape, sph(h * 0.009, 6), spot, Math.cos(a) * h * 0.13 * 1.3, -h * 0.004, -h * 0.075 + Math.sin(a) * h * 0.13);
      }
      add(cape, sph(h * 0.024, 12), trim, 0, -h * 0.03, -h * 0.205);
    }
    // hem trim
    const hem = add(cape, new THREE.TorusGeometry(1, 0.012, 6, 20, Math.PI), trim, 0, 0, 0);
    hem.visible = false;

    // --- the omen ---
    const omen = [];
    if (!dark) {
      // gold motes drifting up around him
      for (let i = 0; i < 12; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: softBlot(), color: new THREE.Color(0xffd98a).multiplyScalar(1.6), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        m.scale.setScalar(0.045);
        m.layers.set(1);
        g.add(m);
        omen.push({ m, a: i * 2.4, r: 0.18 + (i % 5) * 0.06, sp: 0.1 + (i % 4) * 0.03, off: i / 12 });
      }
      g.userData.omen = s => {
        for (const o of omen) {
          const u = (s * o.sp + o.off) % 1;
          o.m.position.set(Math.cos(o.a + s * 0.3) * o.r, 0.15 + u * 2.0, Math.sin(o.a + s * 0.3) * o.r);
          o.m.material.opacity = Math.sin(Math.PI * u) * 0.9;
        }
      };
    } else {
      // bats wheeling overhead, and a red mist about his feet
      const wing = new THREE.Shape();
      wing.moveTo(0, 0.012); wing.lineTo(0.05, 0.03); wing.lineTo(0.1, 0.012);
      wing.quadraticCurveTo(0.08, 0.0, 0.075, -0.022); wing.quadraticCurveTo(0.055, -0.005, 0.045, -0.026);
      wing.quadraticCurveTo(0.03, -0.006, 0, -0.016); wing.closePath();
      const wg = new THREE.ShapeGeometry(wing);
      wg.rotateX(-Math.PI / 2);
      const black = new THREE.MeshBasicMaterial({ color: 0x08060b, side: THREE.DoubleSide });
      for (let i = 0; i < 5; i++) {
        const bat = new THREE.Group();
        const l = new THREE.Mesh(wg, black), r = new THREE.Mesh(wg, black);
        r.scale.x = -1;
        const body = new THREE.Mesh(sph(0.014, 6), black);
        body.scale.set(1, 0.8, 1.9);
        bat.add(l, r, body);
        g.add(bat);
        omen.push({ bat, l, r, a: i * 1.26, rad: 0.42 + (i % 3) * 0.11, y: h + 0.32 + (i % 4) * 0.13, sp: (0.9 + (i % 3) * 0.25) * (i % 2 ? 1 : -1), fl: 13 + i * 1.7 });
      }
      const mist = [];
      for (let i = 0; i < 7; i++) {
        const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: softBlot(), color: 0x9a1020, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.layers.set(1);
        g.add(m);
        mist.push({ m, a: i * 0.9, sp: 0.18 + (i % 3) * 0.07 });
      }
      g.userData.omen = s => {
        for (const o of omen) {
          const a = o.a + s * o.sp;
          o.bat.position.set(Math.cos(a) * o.rad, o.y + Math.sin(s * 1.3 + o.a) * 0.07, Math.sin(a) * o.rad);
          o.bat.rotation.y = -a + (o.sp > 0 ? Math.PI : 0);          // nose along its path
          const f = Math.sin(s * o.fl) * 0.75;
          o.l.rotation.z = f; o.r.rotation.z = -f;
        }
        for (const o of mist) {
          const a = o.a + s * o.sp;
          o.m.position.set(Math.cos(a) * 0.36, 0.2 + Math.sin(s * 0.7 + o.a) * 0.04, Math.sin(a) * 0.36);
          o.m.scale.setScalar(0.5 + Math.sin(s * 0.5 + o.a * 2) * 0.1);
          o.m.material.opacity = 0.16 + Math.sin(s * 0.8 + o.a) * 0.06;
        }
      };
    }

    // per frame: the mantle follows the shoulders, and the cloth hangs from it
    const prev = g.userData.animate;
    let yaw = 0;
    g.userData.animate = t => {
      if (prev) prev(t);
      const s = t * 0.001;
      g.userData.omen(s);
    };
    const post = g.userData.postAnimate;
    g.userData.postAnimate = () => {
      if (post) post();
      if (!neck) return;
      const p = anchor();
      if (shL && shR) {
        const b = backDir();
        yaw += Math.atan2(Math.sin(Math.atan2(b.x, b.z) - yaw), Math.cos(Math.atan2(b.x, b.z) - yaw)) * 0.25;
      }
      cape.rotation.y = yaw;
      cape.position.set(p.x + Math.sin(yaw) * h * 0.1, p.y - h * 0.005, p.z + Math.cos(yaw) * h * 0.1);
      cloth();
    };
    g.userData.postAnimate();
  }

  function buildSkinned(type, color) {
    const cfg = ROLE[color] && ROLE[color][type];
    if (!cfg || !MODELS[cfg.model]) return null;
    const src = MODELS[cfg.model];
    const char = THREE.SkeletonUtils.clone(src.scene);
    char.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();   // per-piece materials so hit-flashes don't leak
      }
    });
    // gear visibility
    for (const name of GEAR[cfg.model] || []) {
      const n = char.getObjectByName(name);
      if (n) n.visible = cfg.show.includes(name);
    }
    // crown on the head bone (sized for the rig's local space)
    if (cfg.crown) {
      const headBone = char.getObjectByName("head");
      if (headBone) {
        const crown = makeCrown(color, type === "k");
        crown.scale.setScalar(2.6);
        crown.position.y = 0.88;   // chibi heads are huge; clear the scalp
        headBone.add(crown);
      }
    }
    // skeleton weapons attach to the right hand slot
    if (cfg.weapon && WEAPONS[cfg.weapon]) {
      const slot = char.getObjectByName("handslot.r");
      if (slot) {
        const w = WEAPONS[cfg.weapon].clone(true);
        w.traverse(o => { if (o.isMesh) o.castShadow = true; });
        slot.add(w);
      }
    }
    return rigUp(char, src.animations, type, color, cfg.scale, cfg.attack, 1.9 * cfg.scale);
  }

  // wrap a rigged character with a mixer and the play/playOnce helpers the
  // board and battle code drive
  function rigUp(char, clips, type, color, scale, attack, height) {
    const g = new THREE.Group();
    char.scale.setScalar(scale);
    char.rotation.y = Math.PI;   // glTF characters face +z; our forward is -z
    g.add(char);
    const mixer = new THREE.AnimationMixer(char);
    const actions = {};
    for (const clip of clips) actions[clip.name] = mixer.clipAction(clip);
    let current = null;
    const play = (name, fade = 0.25) => {
      const a = actions[name];
      if (!a || a === current) return a;
      a.reset();
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = false;
      a.enabled = true;
      a.setEffectiveWeight(1);
      a.fadeIn(fade).play();
      if (current) current.fadeOut(fade);
      current = a;
      return a;
    };
    const playOnce = (name, fade = 0.15) => new Promise(res => {
      const a = actions[name];
      if (!a) return res();
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.enabled = true;
      a.setEffectiveWeight(1);
      a.fadeIn(fade).play();
      if (current && current !== a) current.fadeOut(fade);
      current = a;
      const onFin = e => {
        if (e.action === a) {
          mixer.removeEventListener("finished", onFin);
          res();
        }
      };
      mixer.addEventListener("finished", onFin);
    });
    play("Idle");
    // desync idle cycles so the army doesn't breathe in unison
    mixer.update(Math.random() * 2);
    g.userData = {
      type, color, skinned: true, mixer, actions, play, playOnce,
      attack,
      height,
      parts: null,
    };
    if (color === "b") g.rotation.y = Math.PI;
    return g;
  }

  // ================= realistic characters (Mixamo trial) =================
  // Optional: used only for the roles listed in MX_ROLE, and only when the
  // converted files are present; otherwise the KayKit role is used.

  const MX = {};          // model name -> gltf
  let armsSrc = null;     // sword + shield props (assets/models/mx/props.glb)
  const MX_SRC = {};      // clip name -> { clip, hipY }
  const MX_NAMES = ["paladin", "maria", "ganfaul", "knight", "uriel", "castleguard",
    "warrok", "nightshade", "maw", "vampire", "mutant", "skeletonzombie"];
  const MX_FILES = {};
  for (const n of MX_NAMES) MX_FILES[n] = "assets/models/mx/" + n + ".glb";
  // game clip name -> animation file (missing ones are simply skipped)
  const MX_ANIMS = {
    Slash: "assets/models/mx/anim_slash.glb",
    Idle: "assets/models/mx/anim_idle.glb",
    Walking_A: "assets/models/mx/anim_walk.glb",
    Running_A: "assets/models/mx/anim_run.glb",
    Hit_A: "assets/models/mx/anim_hit.glb",
    Death_A: "assets/models/mx/anim_death.glb",
    Cheer: "assets/models/mx/anim_victory.glb",
    Spellcast_Shoot: "assets/models/mx/anim_cast.glb",
    Jump_Full_Long: "assets/models/mx/anim_jump.glb",
  };
  // locomotion clips carry forward root motion; the board moves the piece
  // itself, so these are pinned in place
  const MX_IN_PLACE = new Set(["Walking_A", "Running_A", "Jump_Full_Long"]);
  // h = standing height on the board (a tile is 1 unit wide)
  const MX_ROLE = {
    w: {
      k: { model: "paladin", h: 1.42, crown: true, royal: true, metal: 0.4, rough: 0.34, tint: 1 },
      q: { model: "maria", h: 1.32, seraph: true },
      b: { model: "ganfaul", h: 1.25, prop: "staff", archmage: true },
      n: { model: "knight", h: 1.25, prop: "sword" },
      r: { model: "uriel", h: 1.3, metal: 0.8, rough: 0.4, prop: "sword" },
      p: { model: "castleguard", h: 0.98, arms: true, shieldOut: 9, halberd: true },
    },
    b: {
      k: { model: "vampire", h: 1.4, crown: true, crownY: 0.1 },
      q: { model: "nightshade", h: 1.32, crown: true },
      b: { model: "maw", h: 1.27, efreet: true },
      n: { model: "vampire", h: 1.25 },
      r: { model: "mutant", h: 1.34 },
      p: { model: "skeletonzombie", h: 1.05, arms: "rusted", shieldOut: 6 },
    },
  };
  // the hips rest along one axis of their parent; its length is our size gauge
  const upAxis = v => [0, 1, 2].reduce((m, k) => (Math.abs(v[k]) > Math.abs(v[m]) ? k : m), 0);
  const HIPS = "mixamorigHips";

  // Mixamo clips are authored for one character's proportions: keep the
  // rotations, drop bone offsets, and rescale the hip travel to fit.
  function retarget(src, char) {
    const hips = char.getObjectByName(HIPS);
    const up = upAxis(src.rest);
    const ratio = hips && src.rest[up] ? hips.position.getComponent(up) / src.rest[up] : 1;
    const tracks = [];
    for (const t of src.clip.tracks) {
      const dot = t.name.lastIndexOf(".");
      const node = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      if (!char.getObjectByName(node)) continue;
      if (prop === "quaternion") tracks.push(t);
      else if (prop === "position" && node === HIPS) {
        const c = t.clone(), v = c.values;
        if (MX_IN_PLACE.has(src.clip.name)) {
          // keep only the vertical bob (the axis the hips rest along)
          for (let i = 0; i < v.length; i++) if (i % 3 !== up) v[i] = v[i % 3];
        }
        for (let i = 0; i < v.length; i++) v[i] *= ratio;
        tracks.push(c);
      }
    }
    return new THREE.AnimationClip(src.clip.name, src.clip.duration, tracks);
  }

  // simple hand props for characters that ship empty-handed (sizes in the
  // rig's own centimetre space; the grip runs along the prop's Y axis)
  function makeProp(kind, color) {
    const P = palette(color), g = new THREE.Group();
    if (kind === "sword") {
      add(g, cyl(1.5, 1.5, 15, 8), mat(0x3a2a1c), 0, 0, 0);
      add(g, sph(2.4, 8), goldMat(P.trim), 0, -8.5, 0);
      add(g, box(20, 2.4, 3.4), goldMat(P.trim), 0, 8.5, 0);
      add(g, box(4.6, 72, 1.1), steelMat(0xd6dbe6), 0, 45.5, 0);
      const tip = add(g, cone(2.4, 8, 4), steelMat(0xd6dbe6), 0, 85.5, 0);
      tip.scale.z = 0.3;
      tip.rotation.y = Math.PI / 4;
    } else {
      add(g, cyl(1.7, 2.0, 165, 8), mat(WOOD), 0, 30, 0);
      add(g, cyl(3.2, 4.2, 6, 8), goldMat(P.trim), 0, 113, 0);
      add(g, sph(6.5, 10), glowMat(P.glow), 0, 121, 0);
    }
    return g;
  }

  // An efreet: the demon's legs are folded away and replaced by a whirling
  // column of fire, his skin smoulders, and he teleports instead of walking.
  function makeEfreet(g, char, h, opts = {}) {
    if (!opts.keepLegs) {
      for (const n of ["mixamorigLeftUpLeg", "mixamorigRightUpLeg"]) {
        const b = char.getObjectByName(n);
        if (b) b.scale.setScalar(0.001);
      }
    }
    const lift = opts.lift || 0;
    char.traverse(o => {
      if (o.isMesh && o.material.emissive) {
        o.material.emissive.setHex(0xff5a14);
        o.material.emissiveIntensity = opts.glow ?? 0.22;
      }
    });
    const fire = (hex, k, opacity) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const top = h * (opts.top ?? 0.6);          // roughly the waist
    const column = new THREE.Group();
    const shells = [];
    // nested flame funnels: narrow at the ground, flaring out under the torso
    for (const [rTop, rBot, hex, k, op, spin] of [
      [0.22, 0.05, 0xff3a0a, 1.2, 0.22, 1.7], [0.15, 0.035, 0xff8a1e, 1.8, 0.3, -2.6], [0.08, 0.02, 0xffe08a, 3.5, 0.6, 3.9],
    ]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, top, 9, 4, true), fire(hex, k, op));
      // twist the funnel so it reads as a vortex
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const a = (pos.getY(i) / top + 0.5) * 1.6;
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), pos.getY(i), x * Math.sin(a) + z * Math.cos(a));
      }
      m.position.y = top / 2;
      column.add(m);
      shells.push({ m, spin });
    }
    const embers = [];
    for (let i = 0; i < 7; i++) {
      const e = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), fire(0xffb347, 4, 1));
      column.add(e);
      embers.push({ e, off: i / 7, r: 0.1 + (i % 3) * 0.07, a: i * 2.4 });
    }
    // tongues of flame swirling up the funnel, so its outline is never still
    const tongues = [];
    const tongueGeo = new THREE.IcosahedronGeometry(0.06, 1);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(tongueGeo, fire(i % 3 === 0 ? 0xffd27a : i % 3 === 1 ? 0xff7a1e : 0xff3a0a, i % 3 === 0 ? 3.2 : 2, 0.8));
      column.add(m);
      tongues.push({ m, off: i / 16, a: i * 2.399, sp: 0.9 + (i % 5) * 0.12 });
    }
    g.add(column);
    g.userData.teleport = true;
    g.userData.flameColor = 0xff6a1a;
    const prev = g.userData.animate;
    g.userData.animate = t => {
      if (prev) prev(t);
      const s = t * 0.001;
      for (const { m, spin } of shells) {
        m.rotation.y = s * spin;
        const w = 1 + Math.sin(s * 7 + spin) * 0.08;
        m.scale.set(w, 1 + Math.sin(s * 5 + spin * 2) * 0.05, w);
      }
      for (const b of embers) {
        const u = (s * 0.7 + b.off) % 1;
        b.e.position.set(Math.cos(b.a + s * 2) * b.r * (0.4 + u), u * top * 1.5, Math.sin(b.a + s * 2) * b.r * (0.4 + u));
        b.e.material.opacity = 1 - u;
      }
      for (const f of tongues) {
        const u = (s * f.sp + f.off) % 1;
        const r = 0.03 + u * 0.2;
        const a = f.a + s * 3 + u * 2.5;
        f.m.position.set(Math.cos(a) * r, u * top * 1.08, Math.sin(a) * r);
        const k = 0.5 + u * 1.3;
        f.m.scale.set(k, k * 2.3, k);
        f.m.material.opacity = 0.85 * Math.sin(Math.PI * Math.min(1, u * 1.15));
      }
      char.position.y = lift + Math.sin(s * 2.2) * 0.025;     // hover
    };
  }

  // ---- the Ivory footmen are halberdiers ----
  // A halberd in hand units (about a centimetre), butt at the origin, head up +y,
  // axe blade toward -z (the way the piece faces).
  function makeHalberd() {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 0.8 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xdfe4ec, roughness: 0.28, metalness: 0.92 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2b23c, roughness: 0.35, metalness: 0.8 });
    add(g, cyl(2.3, 2.5, 196, 10), wood, 0, 98, 0);
    add(g, cone(2.7, 8, 8), steel, 0, 4, 0, Math.PI);                 // butt spike
    add(g, cyl(3, 3, 34, 10), steel, 0, 186, 0);                     // socket and langets
    add(g, cyl(3.5, 3.5, 2.6, 12), gold, 0, 169, 0);
    add(g, cyl(3.5, 3.5, 2.6, 12), gold, 0, 203, 0);
    const spike = add(g, cone(4, 44, 4), steel, 0, 226, 0);            // top spike, diamond in section
    spike.scale.z = 0.45;
    const plate = (pts, depth) => {
      const sh = new THREE.Shape();
      sh.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) q.length === 4 ? sh.quadraticCurveTo(q[0], q[1], q[2], q[3]) : sh.lineTo(q[0], q[1]);
      sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.5, bevelSegments: 1 });
      geo.translate(0, 0, -depth / 2);
      geo.rotateY(Math.PI / 2);                                           // shape +x becomes the blade's reach, toward -z
      return geo;
    };
    // crescent axe blade, with a spur behind it
    add(g, plate([[2, -13], [18, -27], [32, -10, 32, 0], [32, 10, 18, 27], [2, 13]], 1.4), steel, 0, 187, 0);
    add(g, plate([[-2, 8], [-21, 1], [-14, -3, -2, -7]], 1.4), steel, 0, 189, 0);
    g.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
    return g;
  }

  // a small round buckler; its face looks along +y
  function makeBuckler() {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xd9dee8, roughness: 0.32, metalness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2b23c, roughness: 0.35, metalness: 0.8 });
    const face = add(g, sph(15, 20), steel, 0, 0, 0);
    face.scale.y = 0.22;
    add(g, new THREE.TorusGeometry(14.5, 1.1, 8, 28), gold, 0, 0.4, 0, Math.PI / 2);
    const boss = add(g, sph(4.4, 12), gold, 0, 2.4, 0);
    boss.scale.y = 0.8;
    return g;
  }

  // The halberd stands upright in his fist, butt on the ground, whatever the
  // arm is doing; when he strikes (or falls) it goes with the hand instead.
  function makeHalberdier(g, char) {
    const hand = char.getObjectByName("mixamorigRightHand");
    if (!hand) return;
    const grip = new THREE.Group(), halberd = makeHalberd();
    halberd.scale.setScalar(0.9);
    grip.add(halberd);
    hand.add(grip);
    grip.position.set(0, 9, 2);
    const inFist = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));   // head out of the top of the fist
    const hq = new THREE.Quaternion(), gq = new THREE.Quaternion(), up = new THREE.Quaternion();
    const hp = new THREE.Vector3(), hs = new THREE.Vector3();
    let stand = 1;
    const post = g.userData.postAnimate;
    g.userData.postAnimate = () => {
      if (post) post();
      const acts = g.userData.actions || {};
      const busy = ["Slash", "Death_A"].some(n => acts[n] && acts[n].isRunning() && acts[n].getEffectiveWeight() > 0.3);
      stand += ((busy ? 0 : 1) - stand) * 0.22;
      hand.getWorldQuaternion(hq);
      g.getWorldQuaternion(gq);
      up.copy(hq).invert().multiply(gq);                  // upright, blade toward his front
      grip.quaternion.copy(inFist).slerp(up, stand);
      // slide the shaft through the fist so the butt rests on the ground
      hand.getWorldPosition(hp);
      hand.getWorldScale(hs);
      const reach = Math.max(20, Math.min(120, (hp.y - g.position.y - 0.04) / hs.y));
      halberd.position.y = -(62 + (reach - 62) * stand);
    };
  }

  function buildMixamo(type, color) {
    const cfg = MX_ROLE[color] && MX_ROLE[color][type];
    if (!cfg || !MX[cfg.model] || !MX_SRC.Slash) return null;
    const char = THREE.SkeletonUtils.clone(MX[cfg.model].scene);
    char.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = o.material.clone();
        if (cfg.metal != null) { o.material.metalness = cfg.metal; o.material.roughness = cfg.rough; }
        if (cfg.royal && o.material.map && o.material.map.image) o.material.map = royalTexture(o.material.map);
        // lift the Ivory army's albedo so the sides read apart even in silhouette
        o.material.color.multiplyScalar(cfg.tint ?? (color === "w" ? 1.45 : 0.95));
      }
    });
    // size every model to its role, whatever its native proportions
    const hips = char.getObjectByName(HIPS);
    const hipLen = hips ? Math.abs(hips.position.getComponent(upAxis(hips.position.toArray()))) : 100;
    const scale = cfg.h / (hipLen * 0.0185);
    if (cfg.arms && armsSrc) {
      // the Paladin's own sword and shield, carried on the same bones he uses
      const k = hipLen / 95.6;                 // sized to this character
      for (const [name, boneName] of [["sword", "mixamorigRightHand"], ["shield", "mixamorigLeftForeArm"]]) {
        const src = armsSrc.scene.getObjectByName(name), bone = char.getObjectByName(boneName);
        if (!src || !bone) continue;
        if (cfg.halberd && name === "sword") continue;
        const prop = src.clone(true);
        prop.position.set(0, 0, 0); prop.rotation.set(0, 0, 0); prop.scale.setScalar(k);
        if (name === "shield") {
          // larger, and pushed out along its face normal so the arm sits behind it
          const grow = 1.35;
          const box = new THREE.Box3().setFromObject(prop);
          const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
          const e = size.toArray(), thin = e.indexOf(Math.min(...e));
          prop.scale.setScalar(k * grow);
          prop.position.copy(c).multiplyScalar(1 - grow);           // grow about its own centre
          const out = new THREE.Vector3().setComponent(thin, Math.sign(c.getComponent(thin)) || 1);
          prop.position.addScaledVector(out, (cfg.shieldOut || 0) * k);
          if (cfg.halberd) {
            // a buckler strapped to the forearm, where the big shield's centre was
            const b = makeBuckler();
            b.scale.setScalar(k * 2.275);
            b.position.copy(c).addScaledVector(out, (cfg.shieldOut || 0) * k);
            // slide it down the forearm toward the wrist
            const wrist = char.getObjectByName("mixamorigLeftHand");
            if (wrist) {
              const axis = wrist.position.clone().normalize(), len = wrist.position.length();
              b.position.addScaledVector(axis, len * 0.8 - b.position.dot(axis));
            }
            b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
            bone.add(b);
            continue;
          }
        }
        prop.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.material = o.material.clone();
          if (cfg.arms === "rusted") {
            o.material.color.setRGB(0.5, 0.36, 0.3);
            o.material.metalness = 0.35;
            o.material.roughness = 0.85;
          } else { o.material.metalness = 0.8; o.material.roughness = 0.4; o.material.color.multiplyScalar(1.5); }
        });
        bone.add(prop);
      }
    }
    if (cfg.prop) {
      const hand = char.getObjectByName("mixamorigRightHand");
      if (hand) {
        const prop = makeProp(cfg.prop, color);
        prop.position.set(0, 9, 2);
        prop.rotation.x = -Math.PI / 2;      // blade up out of the fist
        hand.add(prop);
        char.userData.propObj = prop;
      }
    }
    if (cfg.crown) {
      const head = char.getObjectByName("mixamorigHead");
      if (head) {
        const crown = type === "k" ? makeRoyalCrown(color) : makeCrown(color, false);
        crown.scale.setScalar(hipLen * 0.72);
        crown.position.y = hipLen * (cfg.crownY ?? 0.2);
        head.add(crown);
      }
    }
    const clips = Object.values(MX_SRC).map(src => retarget(src, char));
    if (!MX_SRC.Idle) {
      // no idle downloaded yet: hold the guard stance the slash starts from
      const slash = clips.find(c => c.name === "Slash");
      clips.push(THREE.AnimationUtils.subclip(slash, "Idle", 0, 2, 30));
    }
    // bind-pose leg rotations, captured before any animation plays
    char.userData.legRest = ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot"]
      .map(n => char.getObjectByName("mixamorig" + n)).filter(Boolean).map(bn => [bn, bn.quaternion.clone()]);
    if (cfg.seraph) {
      // find the sword blade in the hand's own space while still in the bind pose
      const hand = char.getObjectByName("mixamorigRightHand");
      let sword = null;
      char.traverse(o => { if (o.isSkinnedMesh && /sword/i.test(o.name)) sword = o; });
      if (hand && sword) {
        // the sword is rigid on the hand, so the hand's inverse bind matrix
        // maps its vertices straight into the hand's own space
        const idx = sword.skeleton.bones.indexOf(hand);
        const toHand = sword.skeleton.boneInverses[Math.max(0, idx)];
        const v = new THREE.Vector3(), tip = new THREE.Vector3();
        const pos = sword.geometry.attributes.position;
        let far = 0;
        for (let i = 0; i < pos.count; i += 3) {
          v.fromBufferAttribute(pos, i).applyMatrix4(sword.bindMatrix).applyMatrix4(toHand);
          if (v.lengthSq() > far) { far = v.lengthSq(); tip.copy(v); }
        }
        char.userData.sword = { hand, mesh: sword, tip };
      }
    }
    const g = rigUp(char, clips, type, color, scale, "Slash", cfg.h);
    if (cfg.efreet) makeEfreet(g, char, cfg.h);
    if (cfg.seraph) makeSeraph(g, char, hipLen, cfg.h);
    if (cfg.archmage) makeArchmage(g, char, hipLen, cfg.h);
    if (cfg.halberd) makeHalberdier(g, char);
    if (type === "k") { makeKing(g, char, color, cfg.h); return g; }
    // faction base, so the two armies read at a glance
    const P = palette(color);
    add(g, cyl(0.31, 0.34, 0.035, 28), mat(color === "w" ? 0xf2ecdc : 0x1d1a22, { roughness: 0.4 }), 0, 0.018, 0);
    add(g, cyl(0.325, 0.325, 0.012, 28), goldMat(color === "w" ? P.trim : 0x9a2f3c), 0, 0.04, 0);
    return g;
  }

  // ================= flying mounts: the knights =================
  // Knights are winged drakes: they stand on their square, and fly to move
  // or attack, which is why they alone can pass over other pieces.
  const MOUNT_FILE = "assets/models/mx/wyvern.glb";
  const MOUNT_CLIPS = { Idle: "metarig|idol", Fly: "metarig|flaping", Jump_Full_Long: "metarig|flaping" };
  let mountSrc = null;       // loaded gltf
  let mountBox = null;       // idle-pose bounds in the model's own units
  let ivoryMaps = null;      // original texture uuid -> pale recolour

  // true bounds of a skinned model in its current pose (Box3 can't see skinning)
  function skinnedBounds(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3(), v = new THREE.Vector3();
    root.traverse(o => {
      if (!o.isSkinnedMesh) return;
      o.skeleton.update();
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 1200));
      for (let i = 0; i < pos.count; i += step) {
        o.boneTransform(i, v);
        box.expandByPoint(v.applyMatrix4(o.matrixWorld));
      }
    });
    return box;
  }

  // bleach a colour texture to ivory, keeping the golden belly plates
  function paleTexture(tex, gain = 1.55, lift = 38) {
    const img = tex.image;
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (r > 150 && g > 105 && g > b * 1.7) continue;          // gold stays gold
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      const k = Math.min(255, l * gain + lift);
      px[i] = k * 0.98 + r * 0.04; px[i + 1] = k * 0.95 + g * 0.03; px[i + 2] = k * 0.9 + b * 0.03;
    }
    ctx.putImageData(d, 0, 0);
    const out = tex.clone();
    out.source = new THREE.Source(c);
    out.needsUpdate = true;
    return out;
  }

  function buildMount(type, color) {
    if (type !== "n" || !mountSrc) return null;
    if (!mountBox) {
      const probe = THREE.SkeletonUtils.clone(mountSrc.scene);
      const idle = mountSrc.animations.find(a => a.name === MOUNT_CLIPS.Idle);
      const m = new THREE.AnimationMixer(probe);
      if (idle) { m.clipAction(idle).play(); m.setTime(0.01); }
      mountBox = skinnedBounds(probe);
    }
    const root = THREE.SkeletonUtils.clone(mountSrc.scene);
    if (color === "w" && !ivoryMaps) ivoryMaps = {};
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      if (color === "w" && o.material.map && o.material.map.image) {
        const key = o.material.map.uuid;
        if (!ivoryMaps[key]) ivoryMaps[key] = paleTexture(o.material.map);
        o.material.map = ivoryMaps[key];
        if (o.material.emissive) o.material.emissive.multiplyScalar(0.6);
      }
    });
    // centre the model on its square and stand it on the board
    const size = mountBox.getSize(new THREE.Vector3());
    const ctr = mountBox.getCenter(new THREE.Vector3());
    const shift = new THREE.Group();
    shift.position.set(-ctr.x, -mountBox.min.y, -ctr.z);
    shift.add(root);
    const char = new THREE.Group();
    char.add(shift);
    const scale = 1.45 / size.z;
    const clips = [];
    for (const [name, srcName] of Object.entries(MOUNT_CLIPS)) {
      const src = mountSrc.animations.find(a => a.name === srcName);
      if (src) { const c = src.clone(); c.name = name; clips.push(c); }
    }
    const g = rigUp(char, clips, type, color, scale, null, size.y * scale * 0.8);
    g.userData.flyer = true;
    // fire breath: the battle rears the neck (headPitch) and opens the jaw (jawOpen)
    const bones = {};
    root.traverse(o => { if (o.isBone) bones[o.name] = o; });
    const head = bones.head_021, jaw = bones.jaw_022, neck = bones.spine017_020;
    if (head && jaw) {
      const tip = bones.mouth7L_029 || jaw;
      const posed = [neck, head, jaw].filter(Boolean);
      // bones the clips leave alone would otherwise keep turning every frame
      const tracked = new Set(clips.flatMap(c => c.tracks.map(t => t.name.split(".")[0])));
      const rest = posed.map(b => (tracked.has(b.name) ? null : b.quaternion.clone()));
      const side = new THREE.Vector3(), rot = new THREE.Quaternion(), pq = new THREE.Quaternion();
      const turn = (b, angle) => {
        b.parent.getWorldQuaternion(pq);
        rot.setFromAxisAngle(side, angle);
        b.quaternion.premultiply(pq).premultiply(rot).premultiply(pq.invert());
      };
      g.userData.breath = true;
      g.userData.headPitch = 0;
      g.userData.jawOpen = 0;
      g.userData.mouth = v => tip.getWorldPosition(v);
      g.userData.postAnimate = () => {
        posed.forEach((b, i) => { if (rest[i]) b.quaternion.copy(rest[i]); });
        const hp = g.userData.headPitch, jo = g.userData.jawOpen;
        if (Math.abs(hp) < 0.001 && jo < 0.001) return;
        side.set(1, 0, 0).applyQuaternion(g.quaternion);
        if (neck) turn(neck, hp * 0.5);
        turn(head, hp * 0.5);
        turn(jaw, jo);
      };
    }
    const P = palette(color);
    const base = [
      add(g, cyl(0.31, 0.34, 0.035, 28), mat(color === "w" ? 0xf2ecdc : 0x1d1a22, { roughness: 0.4 }), 0, 0.018, 0),
      add(g, cyl(0.325, 0.325, 0.012, 28), goldMat(color === "w" ? P.trim : 0x9a2f3c), 0, 0.04, 0),
    ];
    // the base stays behind when the drake takes off
    g.userData.animate = () => { const down = g.position.y < 0.03; base[0].visible = base[1].visible = down; };
    return g;
  }

  // ================= the queens: a seraph and a goddess of night =================
  // The most powerful piece never walks. Both queens float above their
  // square on feathered wings, ringed by an aura, and glide when they move.
  const WINGS_FILE = "assets/models/mx/wings.glb";
  const NYX_FILE = "assets/models/mx/nyx.glb";
  let wingsProto = null, nyxSrc = null;

  // split the wing model into two halves that hinge at the spine
  function prepWings(gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const proto = new THREE.Group();
    const L = new THREE.Group(), R = new THREE.Group();
    L.name = "wingL"; R.name = "wingR";
    proto.add(L, R);
    const meshes = [];
    root.traverse(o => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) {
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      (c.x >= 0 ? L : R).attach(m);
    }
    wingsProto = proto;
  }

  function makeWings(tint, emissive) {
    const w = wingsProto.clone(true);
    w.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      o.material.transparent = false;
      o.material.alphaTest = 0.4;
      o.material.depthWrite = true;
      o.material.side = THREE.DoubleSide;
      o.material.color.setHex(tint);
      if (o.material.emissive) { o.material.emissive.setHex(emissive); o.material.emissiveIntensity = 0.25; }
    });
    return w;
  }

  // glowing ground disc + drifting motes; returns a per-frame updater
  function makeAura(g, hex, h) {
    const glow = (k, op) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 28), glow(1.6, 0.4));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.062;
    g.add(disc);
    const motes = [];
    const geo = new THREE.OctahedronGeometry(0.02);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, glow(4, 1));
      g.add(m);
      motes.push({ m, off: i / 10, a: i * 2.399, r: 0.2 + (i % 4) * 0.07 });
    }
    return s => {
      disc.material.opacity = 0.32 + Math.sin(s * 2) * 0.1;
      for (const b of motes) {
        const u = (s * 0.22 + b.off) % 1;
        b.m.position.set(Math.cos(b.a + s * 0.6) * b.r, 0.1 + u * h * 1.15, Math.sin(b.a + s * 0.6) * b.r);
        b.m.material.opacity = Math.sin(Math.PI * u);
      }
    };
  }

  const flap = (w, s, amt = 0.13, speed = 1.7) => {
    const a = Math.sin(s * speed) * amt;
    w.getObjectByName("wingL").rotation.y = a;
    w.getObjectByName("wingR").rotation.y = -a;
  };

  // Ivory's bishop: an archmage of light. He hovers inside a turning ring of
  // runes with crystals in orbit, his staff blazes, and he travels as a
  // bolt of lightning instead of walking.
  function makeArchmage(g, char, hipLen, h) {
    const hex = 0x7fc8ff, lift = 0.14;
    const glow = (k, op) => new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    // rune circle on the ground: two rings and a band of glyph marks
    const circle = new THREE.Group();
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.066;
    circle.add(new THREE.Mesh(new THREE.RingGeometry(0.4, 0.425, 48), glow(2.2, 0.9)));
    circle.add(new THREE.Mesh(new THREE.RingGeometry(0.27, 0.285, 40), glow(2.2, 0.8)));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(i % 3 ? 0.035 : 0.06, 0.085), glow(2.6, 0.9));
      m.position.set(Math.cos(a) * 0.343, Math.sin(a) * 0.343, 0);
      m.rotation.z = a + Math.PI / 2 + (i % 2 ? 0.5 : -0.3);
      circle.add(m);
    }
    g.add(circle);
    // crystals orbiting at chest height
    const crystals = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), glow(3.2, 0.95));
      c.scale.y = 1.8;
      g.add(c);
      crystals.push(c);
    }
    // the staff head burns with light
    const hand = char.getObjectByName("mixamorigRightHand");
    const staff = char.userData.propObj;
    let flare = null;
    if (staff) {
      flare = new THREE.Mesh(new THREE.IcosahedronGeometry(11, 1), glow(3.5, 0.7));
      flare.position.set(0, 121, 0);
      staff.add(flare);
      g.userData.castFrom = flare;          // spells leave from the staff head
      // hold the staff upright whatever the hand is doing
      const hq = new THREE.Quaternion();
      g.userData.postAnimate = () => {
        hand.getWorldQuaternion(hq);
        staff.quaternion.copy(hq.invert());
      };
    }
    g.userData.teleport = true;
    g.userData.teleportStyle = "lightning";
    g.userData.flameColor = hex;
    const prev = g.userData.animate;
    g.userData.animate = t => {
      if (prev) prev(t);
      const s = t * 0.001;
      char.position.y = lift + Math.sin(s * 1.8) * 0.03;
      circle.rotation.z = s * 0.5;
      circle.children.forEach((m, i) => { m.material.opacity = 0.65 + Math.sin(s * 3 + i) * 0.25; });
      crystals.forEach((c, i) => {
        const a = s * 1.1 + (i / crystals.length) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.36, h * 0.55 + Math.sin(s * 2 + i * 1.7) * 0.1, Math.sin(a) * 0.36);
        c.rotation.y = s * 2 + i;
      });
      if (flare) flare.scale.setScalar(0.85 + Math.sin(s * 8) * 0.18);
    };
  }

  // Ivory: the animated queen becomes a seraph (wings and halo ride her bones)
  function makeSeraph(g, char, hipLen, h) {
    const lift = 0.2;
    const spine = char.getObjectByName("mixamorigSpine2");
    const head = char.getObjectByName("mixamorigHead");
    let wings = null;
    if (wingsProto && spine) {
      wings = makeWings(0xffffff, 0xfff1c8);
      wings.scale.setScalar(hipLen * 1.75);
      wings.position.set(0, hipLen * 0.08, -hipLen * 0.14);
      spine.add(wings);
    }
    if (head) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(hipLen * 0.24, hipLen * 0.016, 8, 40), new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffd36a).multiplyScalar(4),
      }));
      halo.rotation.x = Math.PI / 2;                 // lies flat, hovering over her head
      halo.position.set(0, hipLen * 0.3, 0);
      head.add(halo);
    }
    // Her fitted gown is part of the model (built in Blender and skinned to
    // her body). She floats, so her legs hang straight beneath it instead of
    // following the fighting stance in the animations.
    const legRest = char.userData.legRest || [];
    g.userData.postAnimate = () => { for (const [bn, q] of legRest) bn.quaternion.copy(q); };
    // her sword burns: flames climb the blade from the guard to the tip
    const flames = [];
    const sw = char.userData.sword;
    if (sw) {
      if (sw.mesh.material.emissive) { sw.mesh.material.emissive.setHex(0xff6a14); sw.mesh.material.emissiveIntensity = 0.35; }
      const L = sw.tip.length();
      const fire = (hex, k) => new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex).multiplyScalar(k), transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const blade = new THREE.Group();
      blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sw.tip.clone().normalize());
      sw.hand.add(blade);
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(geo, fire(i % 3 === 0 ? 0xffd27a : i % 3 === 1 ? 0xff7a1e : 0xff3a0a, i % 3 === 0 ? 2.2 : 1.5));
        blade.add(m);
        flames.push({ m, off: i / 18, a: i * 2.399, sp: 0.8 + (i % 4) * 0.15 });
      }
      blade.userData.L = L;
      flames.blade = blade;
    }
    const aura = makeAura(g, 0xffd98a, h);
    g.userData.glide = true;
    const prev = g.userData.animate;
    g.userData.animate = t => {
      if (prev) prev(t);
      const s = t * 0.001;
      char.position.y = lift + Math.sin(s * 1.6) * 0.03;
      if (wings) flap(wings, s);
      aura(s);
      if (flames.blade) {
        const L = flames.blade.userData.L;
        for (const f of flames) {
          const u = (s * f.sp + f.off) % 1;
          const r = L * 0.022 * (1 - u * 0.5);
          f.m.position.set(Math.cos(f.a + s * 4) * r, L * (0.22 + u * 0.82), Math.sin(f.a + s * 4) * r);
          const k = L * (0.022 + 0.02 * Math.sin(Math.PI * u));
          f.m.scale.set(k, k * 3, k);
          f.m.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.1));
        }
      }
    };
  }

  // Obsidian: Nyx, a goddess of night. A single sculpted pose that drifts.
  function buildNyx(type, color) {
    if (type !== "q" || color !== "b" || !nyxSrc) return null;
    const h = 1.5, lift = 0.2;
    const fig = nyxSrc.scene.clone(true);
    fig.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.material = o.material.clone();
    });
    const body = new THREE.Group();
    fig.scale.setScalar(h);
    fig.rotation.y = Math.PI;
    body.add(fig);
    let wings = null;
    if (wingsProto) {
      wings = makeWings(0x2a2233, 0x35186a);
      wings.scale.setScalar(h * 0.95);
      wings.position.set(0, h * 0.72, 0.1);
      wings.rotation.y = Math.PI;
      body.add(wings);
    }
    const g = new THREE.Group();
    g.add(body);
    add(g, cyl(0.31, 0.34, 0.035, 28), mat(0x1d1a22, { roughness: 0.4 }), 0, 0.018, 0);
    add(g, cyl(0.325, 0.325, 0.012, 28), goldMat(0x9a2f3c), 0, 0.04, 0);
    const aura = makeAura(g, 0x9a4dff, h);
    g.userData = {
      type, color, height: h, parts: null, restArmR: 0,
      animate: t => {
        const s = t * 0.001;
        body.position.y = lift + Math.sin(s * 1.4) * 0.035;
        body.rotation.y = Math.sin(s * 0.7) * 0.06;
        if (wings) flap(wings, s, 0.16, 1.4);
        aura(s);
      },
    };
    g.rotation.y = Math.PI;
    return g;
  }

  // ================= the pyromancer: Obsidian's bishop =================
  // A masked dark mage wreathed in fire. The model ships as a single pose,
  // so everything he does is layered on in code: he hovers in a vortex of
  // flame, his cloak stirs, fire burns in his hands, and he raises an arm
  // to cast. He teleports instead of walking.
  const MAGE_FILE = "assets/models/mx/shadowmage.glb";
  let mageSrc = null;

  function buildFireMage(type, color) {
    if (type !== "b" || color !== "b" || !mageSrc) return null;
    const char = THREE.SkeletonUtils.clone(mageSrc.scene);
    char.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
    });
    const pose = mageSrc.animations.find(a => /ActionPose/.test(a.name)) || mageSrc.animations[0];
    const idle = pose.clone();
    idle.name = "Idle";
    const h = 1.3;
    const g = rigUp(char, [idle], type, color, h, null, h);
    makeEfreet(g, char, h, { keepLegs: true, lift: 0.16, top: 0.5, glow: 0.02 });

    const bone = re => { let hit = null; char.traverse(o => { if (!hit && o.isBone && re.test(o.name)) hit = o; }); return hit; };
    // fire held in both hands
    const handFire = [];
    for (const re of [/L_Hand_\d+$/, /R_Hand_\d+$/]) {
      const hand = bone(re);
      if (!hand) continue;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xff8a2a).multiplyScalar(4), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      hand.add(orb);
      handFire.push(orb);
    }
    const cloak = [];
    char.traverse(o => { if (o.isBone && /^Cloak\d/.test(o.name)) cloak.push({ b: o, q: o.quaternion.clone() }); });
    const armR = bone(/R_Upperarm_\d+$/), armL = bone(/L_Upperarm_\d+$/);
    const rest = [armR, armL].map(b => b && b.quaternion.clone());
    const side = new THREE.Vector3(), rot = new THREE.Quaternion(), pq = new THREE.Quaternion(), tmp = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0);
    g.userData.castAmt = 0;       // 0..1, driven by the battle code
    g.userData.postAnimate = () => {
      const s = performance.now() * 0.001;
      cloak.forEach((c, i) => {
        tmp.setFromAxisAngle(X, Math.sin(s * 2.4 - i * 0.6) * 0.07);
        c.b.quaternion.copy(c.q).multiply(tmp);
      });
      handFire.forEach((o, i) => {
        // the rig's bones are in centimetres; size the flame in board units
        if (!o.userData.k) { o.parent.getWorldScale(side); o.userData.k = 1 / side.x; o.position.set(0, 0.09 * o.userData.k, 0); }
        o.scale.setScalar(o.userData.k * (0.85 + Math.sin(s * 9 + i * 2) * 0.2 + g.userData.castAmt * 0.9));
      });
      // raise both arms toward the target while casting
      side.set(1, 0, 0).applyQuaternion(g.quaternion);
      [armR, armL].forEach((b, i) => {
        if (!b) return;
        b.quaternion.copy(rest[i]);
        if (g.userData.castAmt < 0.001) return;
        b.parent.getWorldQuaternion(pq);
        rot.setFromAxisAngle(side, g.userData.castAmt * 1.25);
        b.quaternion.premultiply(pq).premultiply(rot).premultiply(pq.invert());
      });
    };
    const P = palette(color);
    add(g, cyl(0.31, 0.34, 0.035, 28), mat(0x1d1a22, { roughness: 0.4 }), 0, 0.018, 0);
    add(g, cyl(0.325, 0.325, 0.012, 28), goldMat(0x9a2f3c), 0, 0.04, 0);
    return g;
  }

  // ================= the sun phoenix: Ivory's knight =================
  // A firebird in white and gold. It never lands: it hovers over its square
  // on slow wingbeats, trailing flame, dives burning onto its prey, and
  // burns down to ash when it is taken.
  const PHX_FILE = "assets/models/mx/phoenix.glb";
  let phxSrc = null;
  const phxMaps = {};

  // recolour a texture: plumage to ivory and gold, or (glow maps) to sunfire
  function sunTexture(tex, glowMap) {
    const key = tex.uuid + (glowMap ? "g" : "c");
    if (phxMaps[key]) return phxMaps[key];
    const img = tex.image, c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const l = 0.3 * r + 0.59 * g + 0.11 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (glowMap) {
        const k = Math.min(255, l * 1.5);
        px[i] = k; px[i + 1] = k * 0.8; px[i + 2] = k * 0.4;
      } else {
        // dull feathers turn ivory; the vivid ones turn gold
        const w = Math.min(1, sat / 110);
        const iv = Math.min(255, l * 1.5 + 85);
        px[i] = iv * (1 - w) + Math.min(255, l * 1.9 + 60) * w;
        px[i + 1] = iv * 0.96 * (1 - w) + Math.min(255, l * 1.45 + 30) * w;
        px[i + 2] = iv * 0.86 * (1 - w) + l * 0.55 * w;
      }
    }
    ctx.putImageData(d, 0, 0);
    const out = tex.clone();
    out.source = new THREE.Source(c);
    out.needsUpdate = true;
    return (phxMaps[key] = out);
  }

  function buildPhoenix(type, color) {
    if (type !== "n" || color !== "w" || !phxSrc) return null;
    const clip0 = phxSrc.animations[0];
    const root = THREE.SkeletonUtils.clone(phxSrc.scene);
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      const m = o.material = o.material.clone();
      m.transparent = false; m.alphaTest = 0.3; m.depthWrite = true; m.side = THREE.DoubleSide;
      if (m.map && m.map.image) m.map = sunTexture(m.map, false);
      if (m.emissiveMap && m.emissiveMap.image) { m.emissiveMap = sunTexture(m.emissiveMap, true); m.emissive.setHex(0xffffff); m.emissiveIntensity = 1.5; }
    });
    // the file is one unit tall, tail-tip on the ground, beak along +x
    root.rotation.y = -Math.PI / 2;
    const char = new THREE.Group();
    char.add(root);
    const scale = 1.2;
    const clips = [];
    if (clip0) for (const n of ["Idle", "Fly", "Jump_Full_Long"]) { const c = clip0.clone(); c.name = n; clips.push(c); }
    const lift = 0.42;
    const g = rigUp(char, clips, type, color, scale, null, lift + 0.3);
    g.userData.flyer = true;
    g.userData.fireDive = true;
    g.userData.ashDeath = true;
    g.userData.lift = lift;
    // tongues of sunfire streaming off the bird
    const flames = [];
    const geo = new THREE.IcosahedronGeometry(0.05, 1);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: new THREE.Color(i % 3 ? 0xffb347 : 0xfff0b0).multiplyScalar(i % 3 ? 1.3 : 1.9), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      g.add(m);
      flames.push({ m, off: i / 14, a: i * 2.399, sp: 0.7 + (i % 4) * 0.14 });
    }
    const P = palette(color);
    const base = [
      add(g, cyl(0.31, 0.34, 0.035, 28), mat(0xf2ecdc, { roughness: 0.4 }), 0, 0.018, 0),
      add(g, cyl(0.325, 0.325, 0.012, 28), goldMat(P.trim), 0, 0.04, 0),
    ];
    g.userData.animate = t => {
      const s = t * 0.001;
      char.position.y = lift + Math.sin(s * 1.5) * 0.05;
      const down = Math.abs(g.position.y) < 0.03;
      base[0].visible = base[1].visible = down;
      for (const f of flames) {
        const u = (s * f.sp + f.off) % 1;
        const r = 0.16 * (1 - u * 0.6);
        f.m.position.set(Math.cos(f.a + s) * r, char.position.y + 0.5 - u * 0.7, Math.sin(f.a + s) * r + 0.1 + u * 0.45);
        const k = 0.5 + Math.sin(Math.PI * u) * 0.9;
        f.m.scale.set(k, k * 2, k);
        f.m.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.1));
      }
    };
    return g;
  }

  // ================= colossi: the rooks =================
  // Obsidian fields a molten rock golem, Ivory an ancient tree giant.
  // Both files are pre-normalised (1 unit tall, feet at the origin).
  const HEAVY = {
    w: { file: "assets/models/mx/treeman.glb", h: 1.7, pale: true },
    b: { file: "assets/models/mx/golem.glb", h: 1.4 },
  };
  const heavySrc = {};
  const heavyMaps = {};

  function buildHeavy(type, color) {
    const cfg = HEAVY[color], src = heavySrc[color];
    if (type !== "r" || !src) return null;
    const char = THREE.SkeletonUtils.clone(src.scene);
    char.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      o.material = o.material.clone();
      if (cfg.pale && o.material.map && o.material.map.image) {
        const key = o.material.map.uuid;
        if (!heavyMaps[key]) heavyMaps[key] = paleTexture(o.material.map, 3.2, 96);   // silver birch
        o.material.map = heavyMaps[key];
      }
    });
    const idle = src.animations[0].clone();
    idle.name = "Idle";
    const g = rigUp(char, [idle], type, color, cfg.h, null, cfg.h * 0.9);
    g.userData.heavy = true;
    // These models ship with an idle only, so the walk is layered on top of
    // it: thighs, knees and upper arms are swung about the body's side axis.
    const bone = re => { let hit = null; char.traverse(o => { if (!hit && o.isBone && re.test(o.name)) hit = o; }); return hit; };
    const limbs = [
      { thigh: bone(/L_Thigh_\d+$|^L_leg/), calf: bone(/L_Calf_\d+$|^L_knee/), arm: bone(/R_Upperarm_\d+$|^R_arm/), off: 0 },
      { thigh: bone(/R_Thigh_\d+$|^R_leg/), calf: bone(/R_Calf_\d+$|^R_knee/), arm: bone(/L_Upperarm_\d+$|^L_arm/), off: Math.PI },
    ];
    const walk = g.userData.walk = { phase: 0, amp: 0 };
    const side = new THREE.Vector3(), rot = new THREE.Quaternion(), pq = new THREE.Quaternion();
    const swing = (b, angle) => {
      if (!b) return;
      // rotate in world space about the side axis: local' = P^-1 * R * P * local
      b.parent.getWorldQuaternion(pq);
      rot.setFromAxisAngle(side, angle);
      b.quaternion.premultiply(pq).premultiply(rot).premultiply(pq.invert());
    };
    g.userData.postAnimate = () => {
      if (walk.amp < 0.001) return;
      side.set(1, 0, 0).applyQuaternion(g.quaternion);
      for (const l of limbs) {
        const ph = walk.phase + l.off;
        swing(l.thigh, Math.sin(ph) * 0.6 * walk.amp);
        swing(l.calf, -Math.max(0, Math.cos(ph)) * 0.75 * walk.amp);
        swing(l.arm, Math.sin(ph) * 0.4 * walk.amp);
      }
    };
    const P = palette(color);
    add(g, cyl(0.36, 0.39, 0.035, 28), mat(color === "w" ? 0xf2ecdc : 0x1d1a22, { roughness: 0.4 }), 0, 0.018, 0);
    add(g, cyl(0.375, 0.375, 0.012, 28), goldMat(color === "w" ? P.trim : 0x9a2f3c), 0, 0.04, 0);
    return g;
  }

  function build(type, color) {
    const mount = buildPhoenix(type, color) || buildMount(type, color) || buildHeavy(type, color) || buildFireMage(type, color) || buildNyx(type, color);
    if (mount) return mount;
    const g = buildMixamo(type, color) || (type !== "r" && modelsReady && buildSkinned(type, color));
    if (g) return g;
    return buildProcedural(type, color);
  }

  return { build, palette, load, get modelsReady() { return modelsReady; } };
})();
