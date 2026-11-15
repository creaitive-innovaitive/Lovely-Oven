/* 3D chicken burger for the home-page pop-up. Every ingredient is a separate 3D object;
   they lift apart in turn, hang for a few seconds, then drop back into the stack. Needs three.js (r128). */
(function () {
  const LOOP = 11;                        // seconds per cycle
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = x => x * x * (3 - 2 * x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  function canvasTex(THREE, size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return new THREE.CanvasTexture(c);
  }

  function build(THREE) {
    const rand = rng(7);
    const root = new THREE.Group();
    const layers = [];                    // top to bottom
    const add = (obj, y0, y1, wobble) => { root.add(obj); layers.push({ obj, y0, y1, spin: (rand() - 0.5) * 1.1, wobble }); obj.position.y = y0; };

    /* ── buns ── */
    const bunGeo = () => {
      const pts = [[0.001, 0], [0.9, 0], [1.0, 0.03], [1.04, 0.12]];
      for (let i = 1; i <= 16; i++) { const a = i / 16 * Math.PI / 2; pts.push([Math.max(0.001, 1.04 * Math.pow(Math.cos(a), 0.8)), 0.12 + 0.56 * Math.pow(Math.sin(a), 0.9)]); }
      const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 56);
      const pos = g.attributes.position, col = [];
      const pale = new THREE.Color(0xecd2a0), lo = new THREE.Color(0xdca55c), hi = new THREE.Color(0xa85f22), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < 0.005) c.copy(pale); else c.copy(lo).lerp(hi, clamp(y / 0.68)).offsetHSL(0, 0, (rand() - 0.5) * 0.03);
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const bunMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });

    const top = new THREE.Group();
    top.add(new THREE.Mesh(bunGeo(), bunMat));
    const N = 190, seeds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf6e8c0, roughness: 0.5 }), N);
    const d = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const a = Math.acos(1 - rand() * 0.97) * 0.95 + 0.04, ph = rand() * Math.PI * 2;
      const aa = Math.min(a, 1.5), r = 1.04 * Math.pow(Math.cos(aa), 0.8), y = 0.12 + 0.56 * Math.pow(Math.sin(aa), 0.9);
      const n = new THREE.Vector3(r * Math.cos(ph) / 1.08, (y - 0.12) / 0.31, r * Math.sin(ph) / 1.08).normalize();
      d.position.set(r * Math.cos(ph), y, r * Math.sin(ph)).addScaledVector(n, 0.006);
      d.quaternion.setFromUnitVectors(up, n); d.rotateY(rand() * 6.28);
      d.scale.set(0.05, 0.02, 0.026); d.updateMatrix(); seeds.setMatrixAt(i, d.matrix);
    }
    top.add(seeds);
    add(top, 1.05, 4.45, 0.16);

    const bottom = new THREE.Group();
    const bb = new THREE.Mesh(bunGeo(), bunMat); bb.scale.set(1, -0.62, 1); bottom.add(bb);
    const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.03, 48), new THREE.MeshStandardMaterial({ color: 0x74280f, roughness: 0.35 }));
    sauce.position.y = 0.012; bottom.add(sauce);
    add(bottom, 0.4, 0.4, 0);

    /* ── lettuce: two ruffled leaves ── */
    const leaf = (R, ph) => {
      const g = new THREE.RingGeometry(0.01, 1, 130, 18), p = g.attributes.position, col = [];
      const c = new THREE.Color(), dark = new THREE.Color(0x4a9528), light = new THREE.Color(0xa6d34c);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y), th = Math.atan2(y, x), w = Math.pow(r, 2.1);
        const rr = r * (1 + w * (0.07 * Math.sin(th * 7 + ph) + 0.05 * Math.sin(th * 13 + 1)));
        const h = w * (0.11 * Math.sin(th * 6 + ph) + 0.08 * Math.sin(th * 11 + 2)) + 0.06 * w * Math.sin(th * 31 + r * 20);
        p.setXYZ(i, rr * Math.cos(th) * R, rr * Math.sin(th) * R, h);
        c.copy(dark).lerp(light, clamp(w * 1.1 + 0.25 * Math.max(0, Math.sin(th * 31 + r * 20)))); col.push(c.r, c.g, c.b);
      }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals();
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
    };
    const lettuce = new THREE.Group();
    lettuce.add(leaf(1.26, 0.5));
    const l2 = leaf(1.08, 2.4); l2.position.y = 0.07; l2.rotation.y = 0.8; lettuce.add(l2);
    add(lettuce, 0.47, 0.95, 0.05);

    /* ── chicken ── */
    const chickenTop = canvasTex(THREE, 256, (x, s) => {
      x.fillStyle = '#c8682b'; x.fillRect(0, 0, s, s);
      for (let i = 0; i < 700; i++) { x.fillStyle = rand() < 0.5 ? 'rgba(235,160,90,.45)' : 'rgba(110,45,15,.4)'; x.beginPath(); x.arc(rand() * s, rand() * s, 1 + rand() * 5, 0, 7); x.fill(); }
      for (let i = 0; i < 70; i++) { x.fillStyle = 'rgba(40,20,10,.75)'; x.fillRect(rand() * s, rand() * s, 2, 2); }
    });
    const cg = new THREE.CylinderGeometry(1, 0.95, 0.3, 80, 1), cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), z = cp.getZ(i), th = Math.atan2(z, x), f = 1 + 0.05 * Math.sin(3 * th + 1) + 0.03 * Math.sin(5 * th + 2); cp.setXYZ(i, x * f, cp.getY(i), z * f * 0.92); }
    cg.computeVertexNormals();
    const chicken = new THREE.Mesh(cg, [
      new THREE.MeshStandardMaterial({ color: 0xe0b27a, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ map: chickenTop, bumpMap: chickenTop, bumpScale: 1.2, roughness: 0.65 }),
      new THREE.MeshStandardMaterial({ color: 0xe0b27a, roughness: 0.75 })]);
    add(chicken, 0.66, 1.58, 0.07);

    /* ── cheese: a square slice whose corners droop ── */
    const chg = new THREE.BoxGeometry(1.62, 0.035, 1.62, 30, 1, 30), chp = chg.attributes.position;
    for (let i = 0; i < chp.count; i++) { const x = chp.getX(i), z = chp.getZ(i), dd = Math.hypot(x, z); chp.setY(i, chp.getY(i) - 0.8 * Math.pow(Math.max(0, dd - 0.6), 1.7) + 0.012 * Math.sin(x * 9 + z * 5)); }
    chg.computeVertexNormals();
    const cheese = new THREE.Mesh(chg, new THREE.MeshStandardMaterial({ color: 0xf5a31a, roughness: 0.3 }));
    cheese.rotation.y = 0.4;
    add(cheese, 0.86, 2.2, 0.08);

    /* ── tomato: two slices ── */
    const tomTop = canvasTex(THREE, 256, (x, s) => {
      const m = s / 2; x.fillStyle = '#c4211a'; x.fillRect(0, 0, s, s);
      const g = x.createRadialGradient(m, m, 10, m, m, m); g.addColorStop(0, '#e9503b'); g.addColorStop(0.8, '#dc3626'); g.addColorStop(1, '#bd1f18'); x.fillStyle = g; x.beginPath(); x.arc(m, m, m, 0, 7); x.fill();
      for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + 0.3; x.save(); x.translate(m + Math.cos(a) * 62, m + Math.sin(a) * 62); x.rotate(a); x.fillStyle = '#f27a5e'; x.beginPath(); x.ellipse(0, 0, 34, 20, 0, 0, 7); x.fill();
        for (let j = 0; j < 4; j++) { x.fillStyle = '#ecd78a'; x.beginPath(); x.ellipse(-10 + j * 8, (j % 2) * 6 - 3, 3.2, 2, 0, 0, 7); x.fill(); } x.restore(); }
      x.fillStyle = '#f4b49c'; x.beginPath(); x.arc(m, m, 12, 0, 7); x.fill();
    });
    const tomatoMats = [new THREE.MeshStandardMaterial({ color: 0xcb2a1d, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: tomTop, roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: 0xcb2a1d, roughness: 0.3 })];
    const tomato = new THREE.Group();
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.11, 64), tomatoMats); t1.position.set(-0.28, 0, 0.1);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.11, 64), tomatoMats); t2.position.set(0.34, 0.08, -0.16); t2.rotation.y = 1.3;
    tomato.add(t1, t2);
    add(tomato, 0.93, 2.75, 0.08);

    /* ── avocado slices ── */
    const avo = new THREE.Group(), sph = new THREE.SphereGeometry(1, 28, 14);
    [[0.0, 0.5, 0.2, 0.9], [1.6, 0.55, 0.5, 1.0], [3.3, 0.5, -0.3, 0.9], [4.7, 0.48, 1.1, 0.8], [2.4, 0.1, 0.0, 0.7]].forEach(([a, r, rot, s], i) => {
      const g = new THREE.Group();
      const skin = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: 0x3f6b22, roughness: 0.5 })); skin.scale.set(0.5 * s, 0.05, 0.21 * s);
      const flesh = new THREE.Mesh(sph, new THREE.MeshStandardMaterial({ color: 0xb9d054, roughness: 0.45 })); flesh.scale.set(0.45 * s, 0.058, 0.16 * s);
      g.add(skin, flesh); g.position.set(Math.cos(a) * r, i * 0.012, Math.sin(a) * r); g.rotation.y = rot; avo.add(g);
    });
    add(avo, 0.99, 3.3, 0.08);

    /* ── red onion rings ── */
    const onion = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const r = 0.3 + rand() * 0.6, arc = Math.PI * (0.5 + rand() * 0.9);
      const g = new THREE.TorusGeometry(r, 0.022, 6, 40, arc); g.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: new THREE.Color(0x7d1f5e).lerp(new THREE.Color(0xd08ab4), rand() * 0.6), roughness: 0.4 }));
      m.rotation.y = rand() * 6.28; m.position.y = rand() * 0.05; m.scale.y = 0.8; onion.add(m);
    }
    add(onion, 1.04, 3.85, 0.1);

    /* soft shadow under the stack */
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(THREE, 128, (x, s) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }) }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -0.5; root.add(sh);
    return { root, layers, shadow: sh };
  }

  let raf = 0, state = null;

  function init(host) {
    if (!window.THREE) return false;
    const THREE = window.THREE;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: host, antialias: true, alpha: true }); } catch (e) { return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3), new THREE.HemisphereLight(0xffffff, 0x8a6a40, 0.3));
    const key = new THREE.DirectionalLight(0xfff0dc, 0.8); key.position.set(3, 6, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde8ff, 0.35); fill.position.set(-4, 2, -3); scene.add(fill);
    const b = build(THREE); scene.add(b.root);
    state = { renderer, scene, camera, b, w: 0, h: 0, host };
    return true;
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
    b.shadow.scale.setScalar(lerp(1, 1.15, G)); b.shadow.material.opacity = lerp(1, 0.6, G);

    const fov = camera.fov * Math.PI / 180, H = lerp(3.2, 5.6, G);
    const dist = Math.max(H / 2 / Math.tan(fov / 2), 2.9 / 2 / Math.tan(fov / 2) / camera.aspect);
    const el = 0.3;
    camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function loop(time) { frame(time); raf = requestAnimationFrame(loop); }

  window.LOBurger3D = {
    start(host) {
      if (!state && !init(host)) return false;
      cancelAnimationFrame(raf);
      const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) frame(0); else raf = requestAnimationFrame(loop);
      return true;
    },
    stop() { cancelAnimationFrame(raf); }
  };
})();
