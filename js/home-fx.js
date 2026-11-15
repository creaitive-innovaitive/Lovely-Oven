/* Home page parallax + scroll reveals. Layout reads are cached per frame; transforms use
   compositor-friendly properties only. Bails out entirely for prefers-reduced-motion. */
(function () {
  if (!document.documentElement.classList.contains('fx')) return;
  const $ = (q, c) => Array.from((c || document).querySelectorAll(q));
  const hero = document.querySelector('.hero');
  if (!hero) return;

  /* progress bar */
  const bar = document.createElement('div');
  bar.className = 'fx-progress';
  document.body.appendChild(bar);

  /* gold dust */
  const dust = $('.hero-dust')[0];
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('i');
    const s = 3 + Math.random() * 7;
    d.style.cssText = `--x:${Math.random() * 100}%;--s:${s}px;--t:${9 + Math.random() * 12}s;--dl:${-Math.random() * 20}s;` +
      `--dx:${(Math.random() - 0.5) * 120}px;--o:${0.25 + s / 14}`;
    dust.appendChild(d);
  }

  /* reveals */
  const add = (sel, cls, stagger, ctx) => $(sel, ctx).forEach((el, i) => {
    el.classList.add(...cls.split(' '));
    if (stagger) el.style.setProperty('--d', i * stagger + 'ms');
  });
  add('.section-label', 'rv rv-label');
  add('.home-title', 'rv-clip');
  add('.story-copy p:not(.section-label)', 'rv');
  add('.story-photo', 'rv-curtain');
  add('.reviews-intro', 'rv');
  add('.reviews-slider', 'rv');
  add('.loc-info', 'rv-left');
  add('.loc-map', 'rv-curtain');
  add('.pay-card', 'rv-tilt', 140);
  add('.contact-zalo', 'rv-pop');
  add('.contact-links li', 'rv-right', 140);
  add('.footer-top > *', 'rv', 120);
  $('.g-row').forEach((row, r) => $('.g-item', row).forEach((it, i) => {
    it.classList.add('rv-diamond');
    it.style.setProperty('--d', (r * 160 + i * 110) + 'ms');
  }));

  /* clipped elements never intersect while hidden, so their parent is what gets observed */
  const targets = new Map();
  $('.rv, .rv-clip, .rv-curtain, .rv-left, .rv-right, .rv-tilt, .rv-diamond, .rv-pop').forEach((el) => {
    const clipped = el.matches('.rv-clip, .rv-curtain, .rv-diamond');
    const key = clipped ? el.parentElement : el;
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push(el);
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      targets.get(e.target).forEach((el) => {
        el.classList.add('in');
        if (el.classList.contains('rv-tilt')) setTimeout(() => el.classList.add('live'), 1500);
      });
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  targets.forEach((_, el) => io.observe(el));

  /* parallax targets: [element, reference (untransformed), mode, speed] */
  const items = [];
  const par = (sel, refSel, mode, speed) => $(sel).forEach((el, i) => {
    const ref = refSel ? el.closest(refSel) || el : el;
    items.push({ el, ref, mode, speed: typeof speed === 'function' ? speed(i) : speed });
  });
  par('.story-photo img', '.story-photo', 'y', -0.1);
  par('.g-item:not(.nz) img', '.food-gallery', 'y', -0.03);
  par('.g-row', '.food-gallery', 'x', (i) => (i % 2 ? 0.09 : -0.09));
  par('.pay-card', '.pay-sec', 'y', (i) => -0.02 - i * 0.03);
  par('.contact-zalo', '.contact-sec', 'y', -0.05);
  par('.loc-info', '.loc-sec', 'y', -0.03);
  $('.home-sec').forEach((sec) => items.push({ el: sec, ref: sec, mode: 'ghost', speed: 0.12 }));

  /* hero pointer drift */
  let tx = 0, ty = 0, cx = 0, cy = 0;
  if (matchMedia('(hover: hover)').matches) {
    hero.addEventListener('pointermove', (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
    });
    hero.addEventListener('pointerleave', () => { tx = ty = 0; });
  }

  const marquee = $('.fx-marquee')[0];
  let lastY = scrollY, skew = 0, vh = innerHeight, heroH = hero.offsetHeight;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function frame() {
    const y = scrollY;
    const doc = document.documentElement;
    bar.style.setProperty('--sp', clamp(y / (doc.scrollHeight - vh), 0, 1).toFixed(4));

    const p = clamp(y / heroH, 0, 1);
    cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
    if (p < 1) {
      hero.style.setProperty('--p', p.toFixed(4));
      hero.style.setProperty('--mx', cx.toFixed(4));
      hero.style.setProperty('--my', cy.toFixed(4));
    }

    if (marquee) {
      skew += (clamp((y - lastY) * -0.35, -8, 8) - skew) * 0.15;
      marquee.style.setProperty('--skew', skew.toFixed(2) + 'deg');
    }
    lastY = y;

    for (const it of items) {
      const r = it.ref.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const d = clamp(r.top + r.height / 2 - vh / 2, -600, 600);
      if (it.mode === 'y') it.el.style.translate = `0 ${(d * it.speed).toFixed(1)}px`;
      else if (it.mode === 'x') it.el.style.translate = `${(d * it.speed).toFixed(1)}px 0`;
      else { it.el.style.setProperty('--gx', (-d * it.speed - 10).toFixed(1) + 'px'); }
    }
    ticking = false;
  }

  let ticking = false;
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { vh = innerHeight; heroH = hero.offsetHeight; req(); });
  /* pointer drift needs a steady loop only while the hero is on screen */
  (function loop() { if (scrollY < heroH && (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001)) req(); requestAnimationFrame(loop); })();
  frame();

  /* gentle tilt on payment cards */
  if (matchMedia('(hover: hover)').matches) {
    $('.pay-card').forEach((c) => {
      c.addEventListener('pointermove', (e) => {
        if (!c.classList.contains('live')) return;
        const b = c.getBoundingClientRect();
        c.style.setProperty('--ry', (((e.clientX - b.left) / b.width - 0.5) * 8).toFixed(2) + 'deg');
        c.style.setProperty('--rx', (-((e.clientY - b.top) / b.height - 0.5) * 8).toFixed(2) + 'deg');
      });
      c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
    });
  }
})();
