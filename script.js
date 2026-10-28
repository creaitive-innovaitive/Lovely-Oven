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
  if (menu) menu.classList.toggle('open');
}

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

/* ── Food carousel ── */
(function () {
  const car = document.getElementById('foodCarousel');
  if (!car) return;
  const track = car.querySelector('.food-track');
  const slides = Array.from(track.children);
  let i = 0, timer;
  const go = n => {
    i = (n + slides.length) % slides.length;
    const s = slides[i];
    track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.clientWidth) / 2, behavior: 'smooth' });
  };
  const start = () => { stop(); timer = setInterval(() => go(i + 1), 4500); };
  const stop = () => clearInterval(timer);
  car.querySelector('.food-prev').onclick = () => { go(i - 1); start(); };
  car.querySelector('.food-next').onclick = () => { go(i + 1); start(); };
  track.addEventListener('scroll', () => {
    const mid = track.scrollLeft + track.clientWidth / 2;
    i = slides.reduce((b, s, k) => Math.abs(s.offsetLeft + s.clientWidth / 2 - mid) < Math.abs(slides[b].offsetLeft + slides[b].clientWidth / 2 - mid) ? k : b, 0);
  }, { passive: true });
  car.addEventListener('mouseenter', stop);
  car.addEventListener('mouseleave', start);
  car.addEventListener('touchstart', stop, { passive: true });
  car.addEventListener('touchend', start, { passive: true });
  start();
})();

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
