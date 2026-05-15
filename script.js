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
