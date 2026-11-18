/* ============================================================
   A Taste of Home — Main JavaScript
   ============================================================ */

/* ── Scroll to Top Button ── */
window.addEventListener('scroll', () => {
  const btn = document.getElementById('scrollTop');
  if (btn) btn.classList.toggle('visible', window.scrollY > 400);
});

/* ── Cookie Banner ── */
(function() {
  if (localStorage.getItem('cookieDismissed')) {
    const banner = document.getElementById('cookieBanner');
    if (banner) banner.style.display = 'none';
  }
})();

function dismissCookie() {
  localStorage.setItem('cookieDismissed', '1');
  const banner = document.getElementById('cookieBanner');
  const scrollBtn = document.getElementById('scrollTop');
  if (banner) banner.style.display = 'none';
  if (scrollBtn) scrollBtn.style.bottom = '1.5rem';
}

/* ── Navigation Popup ── */
function openPopup(e) {
  e.preventDefault();
  const popup = document.getElementById('popup');
  if (popup) {
    popup.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closePopup() {
  const popup = document.getElementById('popup');
  if (popup) {
    popup.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// Close popup when clicking the backdrop
const popup = document.getElementById('popup');
if (popup) {
  popup.addEventListener('click', function (e) {
    if (e.target === this) closePopup();
  });
}

/* ── Mobile Menu ── */
function toggleMobile() {
  const menu = document.getElementById('mobileMenu');
  if (!menu) return;
  const open = menu.classList.toggle('open');
  const btn = document.getElementById('hamburger');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) { const first = menu.querySelector('a, button'); if (first) first.focus(); }
  else if (btn) btn.focus();
}
document.addEventListener('keydown', e => {
  const menu = document.getElementById('mobileMenu');
  if (e.key === 'Escape' && menu && menu.classList.contains('open')) toggleMobile();
});

/* ── Scroll Entrance Animations for Cards ── */
const animObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.style.animationDelay = (i * 0.1) + 's';
      entry.target.style.animation = 'fadeUp 0.6s ease both';
      animObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.card, .phil-card').forEach(el => animObserver.observe(el));

/* ── Keep the hero labels clear of the cookie banner ── */
(function () {
  const banner = document.getElementById('cookieBanner');
  const set = () => {
    const h = banner && banner.style.display !== 'none' ? banner.offsetHeight : 0;
    document.documentElement.style.setProperty('--banner-h', h + 'px');
  };
  set();
  window.addEventListener('resize', set);
  document.addEventListener('click', () => setTimeout(set, 0));
})();

/* ── Gallery diamonds: whole-pixel, even sizes so neighbouring diamonds keep an exact gap ── */
(function () {
  const gal = document.querySelector('.food-gallery');
  if (!gal) return;
  const size = () => {
    const w = document.documentElement.clientWidth;
    const s = w <= 900 ? (w - 12 - 3 * 10) / 4 : Math.min(300, Math.max(210, w * 0.21));
    gal.style.setProperty('--s', Math.floor(s / 2) * 2 + 'px');
  };
  size();
  window.addEventListener('resize', size);
})();


/* ── Reviews slider: advances every 3s, swipe/dots to move manually ── */
(function () {
  const root = document.getElementById('reviewsSlider');
  if (!root) return;
  const track = root.querySelector('.reviews-track');
  const dotsEl = root.querySelector('.reviews-dots');
  const slides = Array.from(track.children);
  const n = slides.length;
  track.appendChild(slides[0].cloneNode(true)).setAttribute('aria-hidden', 'true');
  let i = 0, timer = null;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  slides.forEach((_, k) => {
    const d = document.createElement('button');
    d.setAttribute('aria-label', 'Comment ' + (k + 1));
    d.addEventListener('click', () => { go(k); restart(); });
    dotsEl.appendChild(d);
  });
  const dots = Array.from(dotsEl.children);

  function show() {
    track.style.transform = 'translateX(' + (-100 * i) + '%)';
    dots.forEach((d, k) => d.classList.toggle('on', k === i % n));
  }
  function go(k) {
    if (k < 0) { track.classList.add('no-anim'); i = n; show(); void track.offsetWidth; track.classList.remove('no-anim'); k = n - 1; }
    i = k; show();
  }
  track.addEventListener('transitionend', () => {
    if (i >= n) { track.classList.add('no-anim'); i = 0; show(); void track.offsetWidth; track.classList.remove('no-anim'); }
  });
  function restart() { clearInterval(timer); if (!still) timer = setInterval(() => go(i + 1), 3000); }

  let x0 = null;
  root.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; clearInterval(timer); }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 !== null) {
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) go(dx < 0 ? i + 1 : i - 1);
    }
    x0 = null; restart();
  });
  root.addEventListener('mouseenter', () => clearInterval(timer));
  root.addEventListener('mouseleave', restart);

  show();
  restart();
})();

/* ── Staff links: only shown while a staff member is signed in on this browser.
   The pages themselves still check the login, so this only decides what is visible. ── */
(function () {
  try {
    const raw = localStorage.getItem('sb-drkebbkyipipxwcclihc-auth-token');
    const session = raw && JSON.parse(raw);
    if (!session || !session.access_token) return;
    const links = [['Orders', '/orders']];
    if (localStorage.getItem('lo-admin') === '1') links.push(['Admin', '/admin']);
    const list = document.querySelector('.nav-links');
    const menu = document.getElementById('mobileMenu');
    links.forEach(([label, href]) => {
      if (list) { const li = document.createElement('li'); li.innerHTML = '<a></a>'; li.firstChild.textContent = label; li.firstChild.href = href; list.appendChild(li); }
      if (menu) { const a = document.createElement('a'); a.textContent = label; a.href = href; menu.appendChild(a); }
    });
  } catch (e) { /* ignore */ }
})();

/* ── Merry Peri burger pop-up: once per visitor every 3 days, until the offer ends on 31 December ── */
(function () {
  const el = document.getElementById('promo');
  if (!el) return;
  if (new Date() > new Date(2026, 11, 31, 23, 59, 59)) return;
  const KEY = 'promoSeen', GAP = 3 * 864e5;
  try { const t = +localStorage.getItem(KEY); if (t && Date.now() - t < GAP) return; } catch (e) { /* private mode: show it */ }

  // The strip under the artwork follows the launch date (18 November 2026)
  const strip = el.querySelector('.xm-launch');
  const now = new Date(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate()), launch = new Date(2026, 10, 18);
  if (strip && day >= launch) strip.innerHTML = day.getTime() === launch.getTime() ? 'Official launch <strong>today</strong>' : '<strong>Now on the menu</strong>';

  const closeBtn = el.querySelector('[data-promo-close]'), cta = el.querySelector('.xm-cta');
  let opener = null;
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {   // keep focus inside the pop-up while it is open
      const first = closeBtn, last = cta;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const close = () => {
    el.classList.remove('show');
    setTimeout(() => { el.classList.remove('open'); }, 400);
    document.removeEventListener('keydown', onKey);
    if (opener && opener.focus) opener.focus();
  };
  setTimeout(() => {
    opener = document.activeElement;
    el.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    document.addEventListener('keydown', onKey);
    if (closeBtn) closeBtn.focus();
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* ignore */ }
  }, 700);
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-promo-close]')) close(); });
})();
