"use strict";

/*
 * gfx3d.js — the "rich graphics" layer for the 3D board.
 *   - image-based lighting from a small procedural torch-lit hall
 *   - photo-scanned PBR textures (CC0, Poly Haven) for board, frame and floor
 *   - post-processing: ambient occlusion, bloom, battle depth-of-field,
 *     vignette and filmic tone mapping
 * Rich mode can be switched off (and switches itself off if the GPU can't
 * do HDR render targets); the plain forward render in board3d.js remains.
 */
const Gfx3D = (() => {

  let renderer, scene, camera;
  let rich = false, supported = false;
  let sceneRT, depthRT, aoRT, postRT;
  let aoQuad, combineQuad, finalQuad, bloom;
  let depthOverride;
  let hideInDepth = [];      // groups (markers) that shouldn't occlude
  const EXPOSURE = 1.25;

  // ---------- textures ----------

  const texLoader = new THREE.TextureLoader();

  function tex(file, srgb) {
    const t = texLoader.load("assets/textures/" + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    return t;
  }

  // one PBR material from a Poly Haven set (diffuse + GL normal + AO/rough/metal)
  function pbr(id, opts = {}) {
    return new THREE.MeshStandardMaterial({
      map: tex(id + "_diff.jpg", true),
      normalMap: tex(id + "_nor_gl.jpg", false),
      roughnessMap: tex(id + "_arm.jpg", false),
      color: opts.color ?? 0xffffff,
      roughness: opts.roughness ?? 1,
      metalness: 0,
      normalScale: new THREE.Vector2(opts.normal ?? 1, opts.normal ?? 1),
      envMapIntensity: opts.env ?? 1,
    });
  }

  // remap a geometry's UVs: optional u/v swap, then scale + offset
  function remapUV(geo, su, sv, ou = 0, ov = 0, swap = false) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = swap ? uv.getY(i) : uv.getX(i);
      const v = swap ? uv.getX(i) : uv.getY(i);
      uv.setXY(i, u * su + ou, v * sv + ov);
    }
    uv.needsUpdate = true;
    return geo;
  }

  // ---------- image-based lighting ----------

  function buildEnvironment() {
    const env = new THREE.Scene();
    const lit = (hex, k) => {
      const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, toneMapped: false });
      m.color.multiplyScalar(k);
      return m;
    };
    // dim stone hall
    env.add(new THREE.Mesh(new THREE.BoxGeometry(44, 22, 44), lit(0x2c2830, 0.5)));
    // cool skylight overhead
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), lit(0xc4c8e8, 0.9));
    sky.position.y = 10.5;
    sky.rotation.x = Math.PI / 2;
    env.add(sky);
    // warm key window, matching the directional light's side
    const win = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), lit(0xffdcae, 5));
    win.position.set(14, 11, 11);
    win.lookAt(0, 0, 0);
    env.add(win);
    // torch glows at the four corners
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 8), lit(0xff8a3a, 4));
      g.position.set(x * 12, 1.2, z * 12);
      env.add(g);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  }

  // ---------- post-processing shaders ----------

  const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

  const DEPTH_FNS = `
    uniform sampler2D tDepth;
    uniform float uNear, uFar;
    uniform mat4 uProjInv;
    float linDepth(vec2 uv) {              // positive distance along the view axis
      float d = texture2D(tDepth, uv).x;
      float z = d * 2.0 - 1.0;
      return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
    }
    vec3 viewPos(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  `;

  // Scalable ambient obscurance (McGuire et al.) from depth alone;
  // normals are reconstructed from depth derivatives.
  const AO_FRAG = `
    varying vec2 vUv;
    ${DEPTH_FNS}
    uniform float uRadius, uIntensity, uProjScale, uAspect;
    void main() {
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = viewPos(vUv);
      vec3 n = normalize(cross(dFdx(p), dFdy(p)));
      float rUv = uRadius * uProjScale / -p.z;
      float rot = ign(gl_FragCoord.xy) * 6.2831853;
      float r2 = uRadius * uRadius;
      float occ = 0.0;
      for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float a = rot + fi * 2.3999632;
        float rr = sqrt((fi + 0.5) / 12.0) * rUv;
        vec2 uv = vUv + vec2(cos(a) / uAspect, sin(a)) * rr;
        vec3 v = viewPos(uv) - p;
        float vv = dot(v, v);
        float vn = dot(v, n) - 0.02 - 0.004 * -p.z;
        float f = max(r2 - vv, 0.0);
        occ += f * f * f * max(vn / (vv + 0.01), 0.0);
      }
      float ao = max(0.0, 1.0 - occ * uIntensity * 5.0 / (r2 * r2 * r2 * 12.0));
      gl_FragColor = vec4(vec3(ao), 1.0);
    }
  `;

  // scene colour x blurred AO
  const COMBINE_FRAG = `
    varying vec2 vUv;
    uniform sampler2D tScene, tAO;
    uniform vec2 uAoTexel;
    void main() {
      float ao = 0.0;
      for (int x = -1; x <= 2; x++) for (int y = -1; y <= 2; y++)
        ao += texture2D(tAO, vUv + (vec2(float(x), float(y)) - 0.5) * uAoTexel).r;
      ao /= 16.0;
      vec3 c = texture2D(tScene, vUv).rgb;
      // don't dim things that are glowing
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      ao = mix(ao, 1.0, smoothstep(0.9, 2.0, lum));
      gl_FragColor = vec4(c * ao, 1.0);
    }
  `;

  // depth of field (battle close-ups) + vignette + ACES filmic + sRGB
  const FINAL_FRAG = `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    ${DEPTH_FNS}
    uniform vec2 uTexel;
    uniform float uDof, uFocus, uMaxBlur, uExposure;
    float coc(vec2 uv) {
      float z = linDepth(uv);
      return clamp((abs(z - uFocus) - 0.9) / (uFocus * 1.1), 0.0, 1.0) * uDof;
    }
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 aces(vec3 c) {
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= uExposure / 0.6;
      return clamp(outM * RRTAndODTFit(inM * c), 0.0, 1.0);
    }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      if (uDof > 0.01) {
        float c0 = coc(vUv);
        float rot = ign(gl_FragCoord.xy) * 6.2831853;
        float wsum = 1.0;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float a = rot + fi * 2.3999632;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * sqrt((fi + 0.5) / 16.0) * c0 * uMaxBlur * uTexel;
          float w = 0.15 + coc(uv);          // sharp neighbours bleed less into the blur
          col += texture2D(tDiffuse, uv).rgb * w;
          wsum += w;
        }
        col /= wsum;
      }
      vec2 q = vUv - 0.5;
      col *= 1.0 - 0.55 * smoothstep(0.25, 0.95, dot(q, q) * 2.0);
      col = aces(col);
      col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
      col += (ign(gl_FragCoord.xy + 17.0) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function quad(frag, uniforms) {
    return new THREE.FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, uniforms,
      depthTest: false, depthWrite: false, toneMapped: false,
      extensions: { derivatives: true },
    }));
  }

  function depthUniforms() {
    return {
      tDepth: { value: depthRT.depthTexture },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uProjInv: { value: camera.projectionMatrixInverse },
    };
  }

  function buildPipeline() {
    const caps = renderer.capabilities, ext = renderer.extensions;
    const hdr = caps.isWebGL2 &&
      (ext.has("EXT_color_buffer_half_float") || ext.has("EXT_color_buffer_float"));
    if (!hdr || !THREE.UnrealBloomPass || !THREE.FullScreenQuad) return false;

    sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    postRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
    depthRT = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    depthRT.depthTexture = new THREE.DepthTexture(4, 4);
    aoRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    depthOverride = new THREE.MeshBasicMaterial({ color: 0x000000 });

    aoQuad = quad(AO_FRAG, Object.assign(depthUniforms(), {
      uRadius: { value: 0.5 }, uIntensity: { value: 1.1 },
      uProjScale: { value: 1 }, uAspect: { value: 1 },
    }));
    combineQuad = quad(COMBINE_FRAG, {
      tScene: { value: sceneRT.texture }, tAO: { value: aoRT.texture },
      uAoTexel: { value: new THREE.Vector2() },
    });
    finalQuad = quad(FINAL_FRAG, Object.assign(depthUniforms(), {
      tDiffuse: { value: postRT.texture },
      uTexel: { value: new THREE.Vector2() },
      uDof: { value: 0 }, uFocus: { value: 10 }, uMaxBlur: { value: 9 },
      uExposure: { value: EXPOSURE },
    }));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(4, 4), 0.55, 0.6, 1.0);
    return true;
  }

  // ---------- public ----------

  function init(r, s, c, opts = {}) {
    renderer = r; scene = s; camera = c;
    hideInDepth = opts.hideInDepth || [];
    buildEnvironment();
    try { supported = buildPipeline(); }
    catch (err) { supported = false; console.warn("Rich graphics unavailable:", err); }
    let want = true;
    try { want = localStorage.getItem("cor-gfx") !== "plain"; } catch (e) {}
    rich = supported && want;
  }

  function resize(w, h) {
    if (!supported) return;
    const pr = renderer.getPixelRatio();
    const W = Math.max(2, Math.round(w * pr)), H = Math.max(2, Math.round(h * pr));
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
    sceneRT.setSize(W, H);
    postRT.setSize(W, H);
    depthRT.setSize(hw, hh);
    aoRT.setSize(hw, hh);
    bloom.setSize(W, H);
    combineQuad.material.uniforms.uAoTexel.value.set(1 / hw, 1 / hh);
    finalQuad.material.uniforms.uTexel.value.set(1 / W, 1 / H);
    finalQuad.material.uniforms.uMaxBlur.value = 4.5 * pr;
    aoQuad.material.uniforms.uAspect.value = w / h;
  }

  // dof: 0..1 blur amount; focus: distance from the camera kept sharp
  function render(dof, focus) {
    if (!rich) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    try {
      renderer.toneMapping = THREE.NoToneMapping;     // tone-mapped in the final pass
      // 1. beauty (HDR, multisampled)
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      // 2. depth-only prepass at half resolution
      const vis = hideInDepth.map(g => g.visible);
      hideInDepth.forEach(g => { g.visible = false; });
      scene.overrideMaterial = depthOverride;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(depthRT);
      camera.layers.disable(1);                       // layer 1: light and haze, which occlude nothing
      renderer.render(scene, camera);
      camera.layers.enable(1);
      renderer.shadowMap.autoUpdate = true;
      scene.overrideMaterial = null;
      hideInDepth.forEach((g, i) => { g.visible = vis[i]; });
      // 3. ambient occlusion
      aoQuad.material.uniforms.uProjScale.value = camera.projectionMatrix.elements[5] * 0.5;
      renderer.setRenderTarget(aoRT);
      aoQuad.render(renderer);
      // 4. beauty x AO, then bloom added on top
      renderer.setRenderTarget(postRT);
      combineQuad.render(renderer);
      bloom.render(renderer, null, postRT, 0, false);
      // 5. depth of field, vignette, tone mapping -> screen
      const u = finalQuad.material.uniforms;
      u.uDof.value = dof;
      u.uFocus.value = focus;
      renderer.setRenderTarget(null);
      finalQuad.render(renderer);
    } catch (err) {
      console.warn("Rich graphics failed, falling back:", err);
      camera.layers.enable(1);
      scene.overrideMaterial = null;
      renderer.shadowMap.autoUpdate = true;
      rich = false;
    }
  }

  function setRich(on) {
    rich = supported && !!on;
    try { localStorage.setItem("cor-gfx", on ? "rich" : "plain"); } catch (e) {}
    return rich;
  }

  return {
    init, resize, render, setRich, pbr, remapUV,
    get rich() { return rich; },
    get supported() { return supported; },
  };
})();
