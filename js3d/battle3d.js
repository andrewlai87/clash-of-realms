"use strict";

/*
 * battle3d.js — cinematic capture battles fought ON the board.
 * The camera swoops down to the action, the attacker charges the defender,
 * strikes (melee / spell / golem slam), the defender topples and sinks,
 * and the attacker claims the square. Click anywhere to skip.
 */
const Battle3D = (() => {

  let skipped = false;

  const tw = (obj, props, opts) =>
    skipped ? (Object.assign(obj, props), opts?.onUpdate?.(1), Promise.resolve()) : Tween.to(obj, props, opts);
  const pause = ms => (skipped ? Promise.resolve() : Tween.wait(ms));

  function skip() {
    if (skipped) return;
    skipped = true;
    Tween.skipAll();
  }

  function fighterName(piece) {
    return `${piece[0] === "w" ? "Ivory" : "Obsidian"} ${Pieces.TITLES[piece[1]]}`;
  }

  function faceYaw(g, targetYaw, duration = 220) {
    const cur = g.rotation.y;
    let delta = (targetYaw - cur) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return tw(g.rotation, { y: cur + delta }, { duration, easing: "inOut" });
  }

  async function meleeStrike(atk, def, dir, glowColor) {
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

  async function magicStrike(atk, def, dir, glowColor) {
    const armR = atk.userData.parts && atk.userData.parts.armR;
    Sound.magic();
    await Promise.all([
      tw(atk.rotation, { x: 0.14 }, { duration: 300, easing: "out" }),
      armR ? tw(armR.rotation, { x: 2.9 }, { duration: 300, easing: "out" }) : null,
    ].filter(Boolean));
    // conjure orb above the mage
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x111118, emissive: glowColor, emissiveIntensity: 3 })
    );
    const start = atk.position.clone().add(new THREE.Vector3(0, (atk.userData.height || 1.2) + 0.15, 0));
    orb.position.copy(start);
    Board3D.scene.add(orb);
    const glow = new THREE.PointLight(glowColor, 0, 4);
    glow.position.copy(start);
    Board3D.scene.add(glow);
    const grow = { r: 0.02, i: 0 };
    await tw(grow, { r: 0.11, i: 1.6 }, {
      duration: 340, easing: "out",
      onUpdate: () => { orb.scale.setScalar(grow.r / 0.02); glow.intensity = grow.i; },
    });
    // arc to the defender
    const end = hitPoint(def);
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.9, 0));
    const s = { t: 0 };
    await tw(s, { t: 1 }, {
      duration: 380, easing: "in",
      onUpdate: () => {
        const a = start.clone().lerp(mid, s.t);
        const b = mid.clone().lerp(end, s.t);
        orb.position.copy(a.lerp(b, s.t));
        glow.position.copy(orb.position);
      },
    });
    Board3D.scene.remove(orb);
    Sound.boom();
    Board3D.spawnBurst(end, glowColor, 22, 3.2);
    Board3D.shake(0.1);
    flashHit(def);
    const fade = { i: 2.4 };
    tw(fade, { i: 0 }, { duration: 400, easing: "out", onUpdate: () => { glow.intensity = fade.i; } })
      .then(() => Board3D.scene.remove(glow));
    await pause(150);
    tw(atk.rotation, { x: 0 }, { duration: 250, easing: "out" });
    if (armR) tw(armR.rotation, { x: atk.userData.restArmR || 0 }, { duration: 250, easing: "out" });
  }

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
    Board3D.shake(0.16);
    flashHit(def);
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

  // brief red emissive flash on every mesh of the defender
  function flashHit(def) {
    def.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        const orig = o.material.emissive.getHex();
        const origI = o.material.emissiveIntensity;
        o.material.emissive.setHex(0xff2222);
        o.material.emissiveIntensity = 0.9;
        setTimeout(() => {
          o.material.emissive.setHex(orig);
          o.material.emissiveIntensity = origI;
        }, 180);
      }
    });
  }

  async function death(def) {
    Sound.death();
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

    const banner = document.getElementById("battle3d-banner");
    banner.innerHTML = `<span>${fighterName(attackerPiece)}</span><span class="bt-vs">⚔</span><span>${fighterName(defenderPiece)}</span>`;
    banner.hidden = false;

    Board3D.onSkip(skip);

    const A = atk.position.clone();
    const D = def.position.clone();
    const dir = D.clone().sub(A).setY(0).normalize();

    // camera: swoop to a low side view
    const mid = A.clone().lerp(D, 0.55).setY(0);
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    if (perp.dot(Board3D.camera.position.clone().sub(mid)) < 0) perp.negate();
    const camPos = mid.clone().add(perp.multiplyScalar(3.8)).add(new THREE.Vector3(0, 1.9, 0));
    const camRestore = Board3D.cinematicRestore;
    if (!skipped) await Board3D.cinematicTo(camPos, mid.clone().add(new THREE.Vector3(0, 0.55, 0)), 620);

    // square off
    await Promise.all([faceYaw(atk, Board3D.yawFor(dir)), faceYaw(def, Board3D.yawFor(dir.clone().negate()))]);

    // approach: stop short of the defender
    const stop = D.clone().sub(dir.clone().multiplyScalar(0.95));
    const type = attackerPiece[1];
    const approachDist = Math.hypot(stop.x - A.x, stop.z - A.z);
    if (approachDist > 0.35) {
      if (type === "n") {
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
    if (type === "b" || type === "q") await magicStrike(atk, def, dir, glowColor);
    else if (type === "r") await golemStrike(atk, def, dir, glowColor);
    else await meleeStrike(atk, def, dir, glowColor);

    await death(def);
    Board3D.scene.remove(def);

    // claim the square
    await Promise.all([
      tw(atk.position, { x: D.x, z: D.z, y: 0 }, { duration: 320, easing: "inOut" }),
      faceYaw(atk, Board3D.factionYaw(atk.userData.color), 320),
    ]);
    await pause(skipped ? 0 : 240);

    banner.hidden = true;
    Board3D.onSkip(null);
    await camRestore(skipped ? 0 : 650);
  }

  return { play, skip };
})();
