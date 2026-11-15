/* 3D chicken burger for the home-page pop-up. Every ingredient is a separate 3D object, textured from the
   real burger photo; they lift apart in turn, hang for a few seconds, then drop back into the stack.
   Needs three.js r128. */
(function () {
  const LOOP = 11;                        // seconds per cycle
  const TEX = ['chicken', 'cheese', 'avocado'];
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => x * x * (3 - 2 * x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // cheap smooth noise from a few sines, used to roughen surfaces
  const noise = (x, z) => Math.sin(x * 5.1 + z * 2.3) * 0.5 + Math.sin(x * 11.7 - z * 7.9 + 1.3) * 0.3 + Math.sin(x * 23.1 + z * 19.7 + 2.1) * 0.2;

  function build(THREE, tex) {
    const rand = rng(7);
    const C = hex => new THREE.Color(hex).convertSRGBToLinear();
    const mat = (o, kind) => { const m = new (kind || THREE.MeshStandardMaterial)(o); m.envMapIntensity = o.envMapIntensity || 0.45; return m; };
    const canvasTex = (size, draw) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t; };
    const planarUV = (g, R) => { const p = g.attributes.position, uv = []; for (let i = 0; i < p.count; i++) uv.push(p.getX(i) / (2 * R) + 0.5, p.getZ(i) / (2 * R) + 0.5); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); };
    const shadowy = o => o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

    const root = new THREE.Group(), layers = [];
    const add = (obj, y0, y1, wobble) => { shadowy(obj); root.add(obj); layers.push({ obj, y0, y1, spin: (rand() - 0.5) * 1.1, wobble }); obj.position.y = y0; };

    /* ── buns: lathe with a slightly lumpy surface, photo texture projected from above ── */
    const bunGeo = () => {
      const pts = [[0.001, 0], [0.9, 0], [1.0, 0.03], [1.04, 0.12]];
      for (let i = 1; i <= 22; i++) { const a = i / 22 * Math.PI / 2; pts.push([Math.max(0.001, 1.04 * Math.pow(Math.cos(a), 0.8)), 0.12 + 0.56 * Math.pow(Math.sin(a), 0.9)]); }
      const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 96), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = 1 + (y > 0.02 ? 0.018 * noise(x * 1.5, z * 1.5) : 0); p.setXYZ(i, x * f, y + (y > 0.1 ? 0.012 * noise(x * 3, z * 3) : 0), z * f); }
      g.computeVertexNormals(); planarUV(g, 1.04);
      return g;
    };
    const bunTex = canvasTex(512, (x, sz) => {
      const m = sz / 2, g = x.createRadialGradient(m, m, 10, m, m, m);
      g.addColorStop(0, '#b8692a'); g.addColorStop(0.55, '#cc8038'); g.addColorStop(0.85, '#dea658'); g.addColorStop(1, '#e8c27c');
      x.fillStyle = g; x.fillRect(0, 0, sz, sz);
      for (let i = 0; i < 900; i++) { x.fillStyle = rand() < 0.5 ? 'rgba(120,60,15,.10)' : 'rgba(250,215,150,.12)'; x.beginPath(); x.arc(rand() * sz, rand() * sz, 4 + rand() * 22, 0, 7); x.fill(); }
      for (let i = 0; i < 4000; i++) { x.fillStyle = 'rgba(90,45,10,.12)'; x.fillRect(rand() * sz, rand() * sz, 2, 2); }
    });
    const bunTopMat = mat({ map: bunTex, roughness: 0.55, side: THREE.DoubleSide });
    const cutFace = mat({ color: C(0xe9cf9c), roughness: 0.9, side: THREE.DoubleSide });

    const top = new THREE.Group();
    top.add(new THREE.Mesh(bunGeo(), bunTopMat));
    const N = 240, seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat({ color: C(0xf2dfb0), roughness: 0.45 }), N);
    const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const aa = Math.min(Math.acos(1 - rand() * 0.97) * 0.95 + 0.04, 1.5), ph = rand() * 6.283;
      const r = 1.04 * Math.pow(Math.cos(aa), 0.8), y = 0.12 + 0.56 * Math.pow(Math.sin(aa), 0.9);
      const n = new THREE.Vector3(r * Math.cos(ph) / 1.08, (y - 0.12) / 0.31, r * Math.sin(ph) / 1.08).normalize();
      d.position.set(r * Math.cos(ph), y, r * Math.sin(ph)).addScaledVector(n, 0.004);
      d.quaternion.setFromUnitVectors(up, n); d.rotateY(rand() * 6.28);
      d.scale.set(0.058, 0.022, 0.03); d.updateMatrix(); seeds.setMatrixAt(i, d.matrix);
    }
    top.add(seeds);
    add(top, 1.05, 4.45, 0.16);

    const bottom = new THREE.Group();
    const bb = new THREE.Mesh(bunGeo(), bunTopMat); bb.scale.set(1, -0.62, 1); bottom.add(bb);
    const crumb = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 0.02, 64), cutFace); crumb.position.y = 0.004; bottom.add(crumb);
    const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.03, 48), mat({ color: C(0x8a2a10), roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 }, THREE.MeshPhysicalMaterial));
    sauce.position.y = 0.02; bottom.add(sauce);
    add(bottom, 0.4, 0.4, 0);

    /* ── lettuce: two ruffled leaves with veins ── */
    const leafTex = canvasTex(512, (x, sz) => {
      const m = sz / 2, g = x.createRadialGradient(m, m, 10, m, m, m);
      g.addColorStop(0, '#3f8a22'); g.addColorStop(0.6, '#5aa52c'); g.addColorStop(1, '#9ccf48');
      x.fillStyle = g; x.fillRect(0, 0, sz, sz);
      for (let i = 0; i < 70; i++) { const a = rand() * 6.283; x.strokeStyle = 'rgba(215,240,150,.45)'; x.lineWidth = 1 + rand() * 2.5; x.beginPath(); x.moveTo(m, m); x.quadraticCurveTo(m + Math.cos(a + 0.3) * 120, m + Math.sin(a + 0.3) * 120, m + Math.cos(a) * (200 + rand() * 56), m + Math.sin(a) * (200 + rand() * 56)); x.stroke(); }
      for (let i = 0; i < 600; i++) { x.fillStyle = rand() < 0.5 ? 'rgba(20,70,10,.12)' : 'rgba(210,240,130,.12)'; x.beginPath(); x.arc(rand() * sz, rand() * sz, 2 + rand() * 9, 0, 7); x.fill(); }
    });
    const leaf = (R, ph) => {
      const g = new THREE.RingGeometry(0.01, 1, 160, 22), p = g.attributes.position, col = [], c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y), th = Math.atan2(y, x), w = Math.pow(r, 2.1);
        const rr = r * (1 + w * (0.07 * Math.sin(th * 7 + ph) + 0.05 * Math.sin(th * 13 + 1) + 0.03 * Math.sin(th * 23)));
        const h = w * (0.11 * Math.sin(th * 6 + ph) + 0.08 * Math.sin(th * 11 + 2)) + 0.035 * w * Math.sin(th * 19 + r * 12);
        p.setXYZ(i, rr * Math.cos(th) * R, rr * Math.sin(th) * R, h);
        const shade = 0.72 + 0.28 * clamp(w + 0.3 * Math.max(0, Math.sin(th * 31 + r * 20))); c.setRGB(shade, shade, shade); col.push(c.r, c.g, c.b);
      }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals();
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Mesh(g, mat({ map: leafTex, bumpMap: leafTex, bumpScale: 0.8, vertexColors: true, roughness: 0.4, side: THREE.DoubleSide }));
    };
    const lettuce = new THREE.Group();
    lettuce.add(leaf(1.26, 0.5));
    const l2 = leaf(1.08, 2.4); l2.position.y = 0.07; l2.rotation.y = 0.8; lettuce.add(l2);
    add(lettuce, 0.47, 0.95, 0.05);

    /* ── chicken: lumpy lathe, grilled-spice photo texture ── */
    const cp = [[0.001, -0.15], [0.85, -0.15], [0.96, -0.1], [1.0, 0], [0.99, 0.1], [0.95, 0.14]];
    for (let i = 1; i <= 16; i++) cp.push([0.95 * (1 - i / 16) + 0.001, 0.15]);
    const cg = new THREE.LatheGeometry(cp.map(p => new THREE.Vector2(p[0], p[1])), 96), cpos = cg.attributes.position;
    for (let i = 0; i < cpos.count; i++) {
      const x = cpos.getX(i), y = cpos.getY(i), z = cpos.getZ(i), th = Math.atan2(z, x), f = 1 + 0.05 * Math.sin(3 * th + 1) + 0.03 * Math.sin(5 * th + 2) + 0.015 * Math.sin(9 * th);
      cpos.setXYZ(i, x * f, y + (y > 0.1 ? 0.05 * noise(x * 2.2, z * 2.2) + 0.02 * noise(x * 7, z * 7) : 0), z * f * 0.92);
    }
    cg.computeVertexNormals(); planarUV(cg, 1);
    { const uv = cg.attributes.uv, q = cg.attributes.position; for (let i = 0; i < uv.count; i++) if (q.getY(i) < 0.12) uv.setXY(i, 0.35 + 0.1 * Math.sin(i), 0.5); } // sides: one flat colour, no smeared edge pixels
    const chicken = new THREE.Mesh(cg, mat({ map: tex.chicken, bumpMap: tex.chicken, bumpScale: 2.2, roughness: 0.55, side: THREE.DoubleSide }));
    add(chicken, 0.68, 1.58, 0.07);

    /* ── cheese: square slice, corners droop, soft sheen ── */
    const chg = new THREE.BoxGeometry(1.62, 0.035, 1.62, 40, 1, 40), chp = chg.attributes.position;
    for (let i = 0; i < chp.count; i++) { const x = chp.getX(i), z = chp.getZ(i), dd = Math.hypot(x, z); chp.setY(i, chp.getY(i) - 0.8 * Math.pow(Math.max(0, dd - 0.6), 1.7) + 0.012 * Math.sin(x * 9 + z * 5)); }
    chg.computeVertexNormals();
    const cheese = new THREE.Mesh(chg, mat({ map: tex.cheese, color: 0xffffff, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.3 }, THREE.MeshPhysicalMaterial));
    cheese.rotation.y = 0.4;
    add(cheese, 0.86, 2.2, 0.08);

    /* ── tomato: two juicy slices ── */
    const tomTop = canvasTex(512, (x, s) => {
      const m = s / 2; x.fillStyle = '#b81c16'; x.fillRect(0, 0, s, s);
      const g = x.createRadialGradient(m, m, 20, m, m, m); g.addColorStop(0, '#ee5a40'); g.addColorStop(0.75, '#d8341f'); g.addColorStop(0.93, '#c4261a'); g.addColorStop(1, '#a51912');
      x.fillStyle = g; x.beginPath(); x.arc(m, m, m - 2, 0, 7); x.fill();
      x.strokeStyle = 'rgba(255,200,170,.35)'; x.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3; x.beginPath(); x.moveTo(m + Math.cos(a) * 30, m + Math.sin(a) * 30); x.lineTo(m + Math.cos(a) * 215, m + Math.sin(a) * 215); x.stroke(); }
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * 6.283 + 0.6; x.save(); x.translate(m + Math.cos(a) * 125, m + Math.sin(a) * 125); x.rotate(a);
        x.fillStyle = '#f58a68'; x.beginPath(); x.ellipse(0, 0, 66, 40, 0, 0, 7); x.fill();
        x.fillStyle = '#f3b494'; x.beginPath(); x.ellipse(0, 0, 50, 28, 0, 0, 7); x.fill();
        for (let j = 0; j < 7; j++) { x.fillStyle = '#e9d385'; x.beginPath(); x.ellipse(-26 + j * 9, (j % 2) * 12 - 6, 5, 3.2, 0.5, 0, 7); x.fill(); }
        x.restore();
      }
      x.fillStyle = '#f7c8b0'; x.beginPath(); x.arc(m, m, 24, 0, 7); x.fill();
    });
    const tSide = () => mat({ color: C(0xc42a1a), roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2 }, THREE.MeshPhysicalMaterial);
    const tTop = () => mat({ map: tomTop, roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2 }, THREE.MeshPhysicalMaterial);
    const tomato = new THREE.Group();
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.78, 0.11, 72), [tSide(), tTop(), tSide()]); t1.position.set(-0.28, 0, 0.1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.7, 0.11, 72), [tSide(), tTop(), tSide()]); t2.position.set(0.34, 0.08, -0.16); t2.rotation.y = 1.3;
    tomato.add(t1, t2);
    add(tomato, 0.93, 2.75, 0.08);

    /* ── avocado slices ── */
    const avo = new THREE.Group(), sph = new THREE.SphereGeometry(1, 32, 16);
    [[0.0, 0.5, 0.2, 0.9], [1.6, 0.55, 0.5, 1.0], [3.3, 0.5, -0.3, 0.9], [4.7, 0.48, 1.1, 0.8], [2.4, 0.1, 0.0, 0.7]].forEach(([a, r, rot, s], i) => {
      const g = new THREE.Group();
      const skin = new THREE.Mesh(sph, mat({ color: C(0x2f5a1c), roughness: 0.5 })); skin.scale.set(0.5 * s, 0.05, 0.21 * s);
      const flesh = new THREE.Mesh(sph, mat({ map: tex.avocado, color: 0xffffff, roughness: 0.4, clearcoat: 0.3 }, THREE.MeshPhysicalMaterial)); flesh.scale.set(0.45 * s, 0.058, 0.16 * s);
      g.add(skin, flesh); g.position.set(Math.cos(a) * r, i * 0.012, Math.sin(a) * r); g.rotation.y = rot; avo.add(g);
    });
    add(avo, 0.99, 3.3, 0.08);

    /* ── red onion rings ── */
    const onion = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const r = 0.3 + rand() * 0.6, arc = Math.PI * (0.5 + rand() * 0.9);
      const g = new THREE.TorusGeometry(r, 0.024, 8, 48, arc); g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, mat({ color: C(0x7d1f5e).lerp(C(0xe0a0c4), rand() * 0.55), roughness: 0.3, clearcoat: 0.5 }, THREE.MeshPhysicalMaterial));
      m.rotation.y = rand() * 6.28; m.position.y = rand() * 0.05; m.scale.y = 0.8; onion.add(m);
    }
    add(onion, 1.04, 3.85, 0.1);

    /* real shadow catcher under the stack */
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.16 }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -0.5; sh.receiveShadow = true; root.add(sh);
    return { root, layers, shadow: sh };
  }

  /* a small studio: bright soft boxes around a neutral room, baked into an environment map for reflections */
  function studio(THREE, renderer) {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0xcfc6b8, side: THREE.BackSide })));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(20, 24), new THREE.MeshBasicMaterial({ color: 0x6f5a40, side: THREE.DoubleSide })); floor.rotation.x = -Math.PI / 2; floor.position.y = -6; s.add(floor);
    [[8, 10, [6, 8, 7], 7], [6, 8, [-9, 4, 3], 3], [14, 3, [0, 13, 0], 4], [8, 8, [-3, 5, -10], 4]].forEach(([w, h, pos, k]) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.96, 0.9).multiplyScalar(k), side: THREE.DoubleSide }));
      p.position.set(pos[0], pos[1], pos[2]); p.lookAt(0, 0, 0); s.add(p);
    });
    const pm = new THREE.PMREMGenerator(renderer), env = pm.fromScene(s, 0.04).texture; pm.dispose();
    return env;
  }

  let raf = 0, state = null;

  function loadTextures(THREE, base) {
    const loader = new THREE.TextureLoader(), out = {};
    return Promise.all(TEX.map(k => new Promise((ok, fail) => loader.load(base + 'img/promo/tex-' + k + '.jpg', t => { t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; out[k] = t; ok(); }, undefined, fail)))).then(() => out);
  }

  function init(host, base) {
    if (!window.THREE) return Promise.resolve(false);
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: host, antialias: true, alpha: true }); } catch (e) { return Promise.resolve(false); }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return loadTextures(THREE, base).then(tex => {
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      scene.environment = studio(THREE, renderer);
      const key = new THREE.DirectionalLight(0xfff1de, 1.1); key.position.set(1.5, 9, 3.5); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.002; key.shadow.normalBias = 0.06; key.shadow.radius = 4;
      Object.assign(key.shadow.camera, { left: -4, right: 4, top: 6, bottom: -6, near: 1, far: 25 });
      const rim = new THREE.DirectionalLight(0xdbe6ff, 0.5); rim.position.set(-4, 3, -5);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a40, 0.12), key, rim);
      const b = build(THREE, tex); scene.add(b.root);
      state = { renderer, scene, camera, b, w: 0, h: 0, host };
      return true;
    }).catch(e => { console.warn('burger3d', e); return false; });
  }

  function frame(time) {
    const { renderer, scene, camera, b, host } = state;
    const w = host.clientWidth, h = host.clientHeight;
    if (w && (w !== state.w || h !== state.h)) { state.w = w; state.h = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = reduced ? 0.03 : (time / 1000 % LOOP) / LOOP;
    const K = b.layers.length;
    let G = 0;
    b.layers.forEach((L, k) => {
      const up = smooth(clamp((t - 0.08 - 0.017 * k) / 0.17));
      const down = smooth(clamp((t - 0.7 - 0.017 * (K - 1 - k)) / 0.17));
      const e = up * (1 - down);
      if (k === 3) G = e;
      L.obj.position.y = lerp(L.y0, L.y1, e);
      L.obj.rotation.y = L.spin * e * 3;
      L.obj.rotation.x = Math.sin(time / 700 + k * 1.7) * L.wobble * e;
      L.obj.rotation.z = Math.cos(time / 900 + k * 2.3) * L.wobble * e;
    });

    // whole stack: one full turn while lifting, a gentle sway while apart, another turn while closing
    let ry;
    if (t < 0.3) ry = smooth(t / 0.3) * 6.283;
    else if (t < 0.64) ry = 6.283 + Math.sin((t - 0.3) / 0.34 * 6.283) * 0.3;
    else ry = 6.283 + smooth(clamp((t - 0.64) / 0.26)) * 6.283;
    b.root.rotation.y = ry;

    b.root.position.y = -lerp(0.87, 2.55, G);
    
    const fov = camera.fov * Math.PI / 180, H = lerp(3.2, 5.6, G);
    const dist = Math.max(H / 2 / Math.tan(fov / 2), 2.9 / 2 / Math.tan(fov / 2) / camera.aspect);
    const el = 0.3;
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function loop(time) { frame(time); raf = requestAnimationFrame(loop); }

  window.LOBurger3D = {
    // resolves true once the scene is built and running
    start(host, base) {
      const go = () => {
        cancelAnimationFrame(raf);
        const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) frame(0); else raf = requestAnimationFrame(loop);
        return true;
      };
      return state ? Promise.resolve(go()) : init(host, base || '').then(ok => ok && go());
    },
    stop() { cancelAnimationFrame(raf); }
  };
})();
