"use strict";

/*
 * pieces3d.js — procedural low-poly 3D fantasy chess pieces.
 * Each piece is a THREE.Group whose origin sits at the center of its tile,
 * facing -z (white's forward). Board tile = 1 world unit.
 * userData: { type, color, height, animate(t)? }
 */
const Pieces3D = (() => {

  function palette(color) {
    return color === "w" ? {
      body: 0xe8e0cc,      // ivory
      cloth: 0x3d63ab,     // royal blue
      clothDark: 0x2b4779,
      trim: 0xc9a04e,      // gold
      steel: 0xc4cbd8,
      skin: 0xdfae83,
      hair: 0x6b4520,
      beard: 0xe0dcd2,
      stone: 0xcfc7b4,
      stoneDark: 0x9a9182,
      glow: 0x6fd2ff,
    } : {
      body: 0x413e4c,      // dark iron
      cloth: 0x96303f,     // crimson
      clothDark: 0x5e1e28,
      trim: 0xa5772e,      // antique gold
      steel: 0x7e8494,
      skin: 0xb99a8c,
      hair: 0x241d18,
      beard: 0xb4aec2,
      stone: 0x5c5650,
      stoneDark: 0x403b35,
      glow: 0xc86bff,
    };
  }

  const WOOD = 0x6b4e2e;

  function mat(hex, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: opts.roughness ?? 0.62,
      metalness: opts.metalness ?? 0.08,
      flatShading: true,
      ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.emissiveIntensity ?? 1.6 } : {}),
    });
  }

  function goldMat(hex) { return mat(hex, { roughness: 0.35, metalness: 0.75 }); }
  function steelMat(hex) { return mat(hex, { roughness: 0.4, metalness: 0.6 }); }
  function glowMat(hex) {
    return new THREE.MeshStandardMaterial({
      color: 0x111118, emissive: hex, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0,
    });
  }

  // helper: add a mesh to group
  function add(g, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }

  const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const sph = (r, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);

  function plinth(g, P, r = 0.28) {
    add(g, cyl(r * 1.02, r * 1.14, 0.09, 14), mat(P.body, { roughness: 0.5 }), 0, 0.045, 0);
    add(g, cyl(r * 0.8, r * 0.95, 0.07, 14), goldMat(P.trim), 0, 0.12, 0);
  }

  // ---------- Footman (pawn) ----------
  function pawn(g, P) {
    plinth(g, P, 0.24);
    add(g, cyl(0.11, 0.17, 0.4), mat(P.cloth), 0, 0.35, 0);                    // tunic
    add(g, cyl(0.125, 0.13, 0.05), goldMat(P.trim), 0, 0.44, 0);               // belt
    const chest = add(g, sph(0.145), mat(P.body), 0, 0.58, 0);                 // chest plate
    chest.scale.y = 0.85;
    add(g, sph(0.105), mat(P.skin), 0, 0.75, 0);                               // head
    add(g, new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        mat(P.body, { metalness: 0.4, roughness: 0.4 }), 0, 0.755, 0);          // helm
    add(g, box(0.03, 0.09, 0.025), mat(P.body, { metalness: 0.4 }), 0, 0.73, -0.105); // nose guard
    // spear
    add(g, cyl(0.014, 0.014, 0.85, 7), mat(WOOD), 0.18, 0.5, 0);
    add(g, cone(0.032, 0.11, 8), steelMat(P.steel), 0.18, 0.97, 0);
    // shield
    add(g, cyl(0.13, 0.13, 0.035, 12), mat(P.cloth), -0.2, 0.5, -0.02, Math.PI / 2, 0, 0);
    add(g, sph(0.04), goldMat(P.trim), -0.2, 0.5, -0.045);
    g.userData.height = 0.95;
  }

  // ---------- Knight (armored warhorse) ----------
  function knight(g, P) {
    plinth(g, P, 0.28);
    add(g, cyl(0.17, 0.24, 0.24, 12), mat(P.body), 0, 0.27, 0);                // pedestal
    add(g, box(0.32, 0.24, 0.3), mat(P.body, { metalness: 0.35, roughness: 0.45 }), 0, 0.5, 0.02); // chest
    // neck, leaning forward
    add(g, box(0.2, 0.52, 0.24), mat(P.body), 0, 0.78, -0.02, -0.32, 0, 0);
    // head + snout
    add(g, box(0.17, 0.17, 0.3), mat(P.body), 0, 1.05, -0.2, -0.12, 0, 0);
    add(g, box(0.12, 0.12, 0.18), mat(P.body), 0, 1.0, -0.38, -0.1, 0, 0);
    // ears
    add(g, cone(0.035, 0.11, 6), mat(P.body), -0.055, 1.18, -0.12);
    add(g, cone(0.035, 0.11, 6), mat(P.body), 0.055, 1.18, -0.12);
    // mane
    add(g, box(0.06, 0.5, 0.14), mat(P.cloth), 0, 0.82, 0.12, -0.3, 0, 0);
    add(g, box(0.05, 0.16, 0.1), mat(P.cloth), 0, 1.14, -0.02, -0.4, 0, 0);
    // chanfron (face armor)
    add(g, box(0.12, 0.03, 0.3), goldMat(P.trim), 0, 1.14, -0.24, -0.12, 0, 0);
    // glowing eyes
    add(g, sph(0.023, 6), glowMat(P.glow), -0.09, 1.05, -0.32);
    add(g, sph(0.023, 6), glowMat(P.glow), 0.09, 1.05, -0.32);
    // breast trim
    add(g, box(0.34, 0.05, 0.05), goldMat(P.trim), 0, 0.6, -0.14);
    g.userData.height = 1.2;
  }

  // ---------- Battlemage (bishop) ----------
  function bishop(g, P) {
    plinth(g, P, 0.26);
    add(g, cyl(0.06, 0.23, 0.6, 12), mat(P.cloth), 0, 0.46, 0);                // robe
    add(g, cyl(0.2, 0.235, 0.06, 12), mat(P.clothDark), 0, 0.2, 0);            // hem
    const sh = add(g, sph(0.13), mat(P.cloth), 0, 0.79, 0);                     // shoulders
    sh.scale.y = 0.8;
    add(g, sph(0.095), mat(P.skin), 0, 0.93, 0);                                // head
    const beard = add(g, cone(0.06, 0.17, 8), mat(P.beard), 0, 0.83, -0.06);    // beard
    beard.rotation.x = Math.PI;
    // wizard hat
    add(g, cyl(0.165, 0.165, 0.025, 12), mat(P.clothDark), 0, 0.99, 0);
    add(g, cone(0.115, 0.42, 10), mat(P.cloth), 0.015, 1.2, 0, 0, 0, -0.09);
    add(g, sph(0.028, 6), goldMat(P.trim), 0.05, 1.4, 0);
    // staff with glowing orb
    add(g, cyl(0.013, 0.013, 0.95, 7), mat(WOOD), 0.19, 0.55, 0);
    const orb = add(g, sph(0.06, 8), glowMat(P.glow), 0.19, 1.08, 0);
    add(g, cyl(0.035, 0.05, 0.05, 8), goldMat(P.trim), 0.19, 1.0, 0);
    g.userData.height = 1.35;
    g.userData.animate = t => { orb.material.emissiveIntensity = 2.0 + Math.sin(t * 0.004) * 0.7; };
  }

  // ---------- Tower Golem (rook) ----------
  function rook(g, P) {
    add(g, cyl(0.31, 0.35, 0.1, 14), mat(P.stoneDark), 0, 0.05, 0);
    add(g, cyl(0.25, 0.3, 0.62, 10), mat(P.stone, { roughness: 0.85 }), 0, 0.42, 0); // tower
    add(g, cyl(0.29, 0.29, 0.05, 10), mat(P.stoneDark), 0, 0.2, 0);             // band
    add(g, cyl(0.28, 0.26, 0.07, 10), mat(P.stone, { roughness: 0.85 }), 0, 0.76, 0); // cap
    for (let i = 0; i < 6; i++) {                                                // crenellations
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      add(g, box(0.1, 0.13, 0.09), mat(P.stone, { roughness: 0.85 }),
          Math.cos(a) * 0.23, 0.85, Math.sin(a) * 0.23, 0, -a, 0);
    }
    // eye recess + glowing eyes
    add(g, box(0.17, 0.13, 0.06), mat(0x14101c), 0, 0.55, -0.26);
    const e1 = add(g, sph(0.028, 6), glowMat(P.glow), -0.045, 0.56, -0.29);
    const e2 = add(g, sph(0.028, 6), glowMat(P.glow), 0.045, 0.56, -0.29);
    // rune
    add(g, box(0.05, 0.07, 0.02), glowMat(P.glow), 0, 0.32, -0.28);
    // floating fists
    const f1 = add(g, sph(0.105, 8), mat(P.stone, { roughness: 0.85 }), -0.42, 0.5, 0);
    const f2 = add(g, sph(0.105, 8), mat(P.stone, { roughness: 0.85 }), 0.42, 0.5, 0);
    g.userData.height = 1.25;
    g.userData.animate = t => {
      f1.position.y = 0.5 + Math.sin(t * 0.0022) * 0.05;
      f2.position.y = 0.5 + Math.sin(t * 0.0022 + Math.PI) * 0.05;
      const p = 1.8 + Math.sin(t * 0.003) * 0.5;
      e1.material.emissiveIntensity = p;
      e2.material.emissiveIntensity = p;
    };
  }

  // ---------- Sorceress-Queen ----------
  function queen(g, P) {
    plinth(g, P, 0.27);
    const pts = [
      new THREE.Vector2(0.25, 0), new THREE.Vector2(0.22, 0.12),
      new THREE.Vector2(0.13, 0.42), new THREE.Vector2(0.095, 0.6),
      new THREE.Vector2(0.12, 0.7),
    ];
    const gown = add(g, new THREE.LatheGeometry(pts, 14), mat(P.cloth), 0, 0.16, 0);
    gown.geometry.computeVertexNormals();
    add(g, cyl(0.09, 0.115, 0.16, 10), mat(P.clothDark), 0, 0.92, 0);           // bodice
    const sh = add(g, sph(0.1), mat(P.cloth), 0, 1.03, 0);
    sh.scale.y = 0.75;
    add(g, sph(0.088), mat(P.skin), 0, 1.15, 0);                                 // head
    const hair = add(g, sph(0.094), mat(P.hair), 0, 1.18, 0.035);                // hair
    hair.scale.set(1, 1.15, 1);
    // crown
    add(g, cyl(0.075, 0.08, 0.05, 10), goldMat(P.trim), 0, 1.27, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(g, cone(0.018, 0.06, 6), goldMat(P.trim), Math.cos(a) * 0.06, 1.32, Math.sin(a) * 0.06);
    }
    add(g, sph(0.024, 6), glowMat(P.glow), 0, 1.28, -0.075);
    // scepter with floating gem
    add(g, cyl(0.011, 0.011, 0.52, 7), goldMat(P.trim), 0.18, 1.0, 0);
    const gem = add(g, new THREE.OctahedronGeometry(0.055), glowMat(P.glow), 0.18, 1.33, 0);
    g.userData.height = 1.55;
    g.userData.animate = t => {
      gem.rotation.y = t * 0.0012;
      gem.material.emissiveIntensity = 2.0 + Math.sin(t * 0.0035) * 0.6;
    };
  }

  // ---------- High King ----------
  function king(g, P) {
    plinth(g, P, 0.29);
    const pts = [
      new THREE.Vector2(0.27, 0), new THREE.Vector2(0.24, 0.14),
      new THREE.Vector2(0.17, 0.5), new THREE.Vector2(0.15, 0.72),
    ];
    const robe = add(g, new THREE.LatheGeometry(pts, 14), mat(P.cloth), 0, 0.16, 0);
    robe.geometry.computeVertexNormals();
    // cape
    add(g, box(0.36, 0.62, 0.035), mat(P.clothDark), 0, 0.62, 0.18, 0.1, 0, 0);
    const chest = add(g, sph(0.16), mat(P.body, { metalness: 0.35, roughness: 0.45 }), 0, 0.95, 0);
    chest.scale.set(1.1, 0.85, 0.95);
    add(g, sph(0.085), goldMat(P.trim), -0.17, 1.03, 0);                         // pauldrons
    add(g, sph(0.085), goldMat(P.trim), 0.17, 1.03, 0);
    add(g, sph(0.098), mat(P.skin), 0, 1.2, 0);                                  // head
    const beard = add(g, cone(0.07, 0.2, 8), mat(P.beard), 0, 1.08, -0.055);
    beard.rotation.x = Math.PI;
    // crown
    add(g, cyl(0.09, 0.098, 0.07, 10), goldMat(P.trim), 0, 1.33, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(g, cone(0.02, 0.07, 6), goldMat(P.trim), Math.cos(a) * 0.075, 1.4, Math.sin(a) * 0.075);
    }
    add(g, box(0.02, 0.11, 0.02), goldMat(P.trim), 0, 1.46, 0);                  // cross
    add(g, box(0.07, 0.02, 0.02), goldMat(P.trim), 0, 1.48, 0);
    add(g, sph(0.026, 6), glowMat(P.glow), 0, 1.33, -0.09);
    // greatsword, point down, held in front
    add(g, box(0.055, 0.58, 0.018), steelMat(P.steel), 0, 0.56, -0.26);
    const tip = add(g, cone(0.028, 0.09, 4), steelMat(P.steel), 0, 0.23, -0.26);
    tip.rotation.x = Math.PI;
    tip.rotation.y = Math.PI / 4;
    add(g, box(0.2, 0.04, 0.045), goldMat(P.trim), 0, 0.87, -0.26);              // guard
    add(g, cyl(0.02, 0.02, 0.12, 7), mat(P.clothDark), 0, 0.94, -0.26);          // grip
    add(g, sph(0.032, 6), goldMat(P.trim), 0, 1.02, -0.26);                      // pommel
    g.userData.height = 1.75;
    g.userData.animate = t => {};
  }

  const BUILDERS = { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king };

  function build(type, color) {
    const g = new THREE.Group();
    const P = palette(color);
    g.userData = { type, color, height: 1 };
    BUILDERS[type](g, P);
    if (color === "b") g.rotation.y = Math.PI;
    return g;
  }

  return { build, palette };
})();
