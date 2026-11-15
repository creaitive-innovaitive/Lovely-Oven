/* ── Burger offer pop-up: every page load, only while the November price is running ── */
(function () {
  const el = document.getElementById('promo');
  if (!el) return;
  if (new Date() > new Date(2026, 10, 30, 23, 59, 59)) return;

  // One clip per burger. Both point at the same file for now; drop a Normal clip in and change its path.
  const SIZES = {
    normal: { price: '₫100,000', video: 'img/promo/burger-full.mp4', ing: 'Bun, sauce, lettuce, cheese, tomato, grilled chicken' },
    full:   { price: '₫150,000', video: 'img/promo/burger-full.mp4', ing: 'Bun, sauce, lettuce, cheese, tomato, grilled chicken, red onion garnish, egg, bacon, avocado' }
  };
  const vid = document.getElementById('promo-video');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = key => {
    const o = SIZES[key];
    document.getElementById('promo-price').textContent = o.price;
    document.getElementById('promo-ing').innerHTML = '<strong>' + (key === 'full' ? 'Full burger' : 'Normal burger') + ':</strong> ' + o.ing + '.';
    el.querySelectorAll('.promo-opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === key)));
    if (!vid.src.endsWith(o.video)) vid.src = o.video;   // same file: keep playing, no restart
    if (!still) vid.play().catch(() => {});
  };

  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => {
    el.classList.remove('show');
    vid.pause();
    setTimeout(() => { el.classList.remove('open'); }, 400);
    document.removeEventListener('keydown', onKey);
  };
  setTimeout(() => {
    el.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    document.addEventListener('keydown', onKey);
    pick('full');
  }, 700);
  el.addEventListener('click', e => {
    const opt = e.target.closest('.promo-opt');
    if (opt) return pick(opt.dataset.size);
    if (e.target === el || e.target.closest('[data-promo-close]')) close();
  });
})();
