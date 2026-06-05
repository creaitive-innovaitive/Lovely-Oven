/* ============================================================
   Lovely Oven — Order Builder
   Handles selection, floating order bar, modal, and sending
   via WhatsApp (pre-filled) or Zalo (clipboard + open chat).
   ============================================================ */

(function () {

  /* ── Config ─────────────────────────────────────────── */
  const WHATSAPP_NUMBER = '84987390140';   // international, no +
  const ZALO_NUMBER     = '0987390140';    // local format

  /* ── Order state ─────────────────────────────────────── */
  const ORDER = { protein: null, flavour: null, spiceLevel: null, carb: null, side: null };

  const STEPS = [
    { key: 'protein', label: 'Protein', icon: '🍗' },
    { key: 'flavour', label: 'Flavour', icon: '🔥' },
    { key: 'carb',    label: 'Carb',    icon: '🌾' },
    { key: 'side',    label: 'Side',    icon: '🥗' },
  ];

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectUI();
    attachHandlers();
    updateBar();
  }

  /* ── Attach click handlers to all selectable items ───── */
  function attachHandlers() {
    document.querySelectorAll('[data-group]').forEach(el => {
      el.addEventListener('click', handleSelect);
    });
  }

  function handleSelect(e) {
    const el   = e.currentTarget;
    const group = el.dataset.group;
    const value = el.dataset.value;

    // Deselect all siblings in this group
    document.querySelectorAll(`[data-group="${group}"]`).forEach(item => {
      item.classList.remove('order-selected');
    });

    // Toggle: clicking again deselects
    if (ORDER[group] === value) {
      ORDER[group] = null;
      if (group === 'flavour') ORDER.spiceLevel = null;
    } else {
      ORDER[group] = value;
      el.classList.add('order-selected');
      // Clear spice level if switching away from Peri Peri
      if (group === 'flavour' && value !== 'Peri Peri') {
        ORDER.spiceLevel = null;
      }
    }

    updateBar();
  }

  /* ── Floating order bar ──────────────────────────────── */
  function updateBar() {
    const bar = document.getElementById('loBar');
    if (!bar) return;

    const hasAny = STEPS.some(s => ORDER[s.key]);
    bar.classList.toggle('lo-bar-visible', hasAny);

    STEPS.forEach(s => {
      const chip = bar.querySelector(`[data-bar-step="${s.key}"]`);
      if (!chip) return;
      if (ORDER[s.key]) {
        let text = ORDER[s.key];
        if (s.key === 'flavour' && ORDER.spiceLevel) text += ` (${ORDER.spiceLevel})`;
        // Shorten long names for the bar
        if (text.length > 18) text = text.substring(0, 16) + '…';
        chip.textContent = text;
        chip.classList.add('lo-chip-filled');
      } else {
        chip.innerHTML = `<span class="lo-chip-icon">${s.icon}</span>${s.label}`;
        chip.classList.remove('lo-chip-filled');
      }
    });

    const allChosen = STEPS.every(s => ORDER[s.key]);
    const btn = document.getElementById('loBarBtn');
    if (btn) {
      btn.textContent = allChosen ? 'Send Order →' : 'Review Order';
      btn.classList.toggle('lo-btn-ready', allChosen);
    }
  }

  /* ── Modal ───────────────────────────────────────────── */
  window.loOpenModal = function () {
    buildSummary();
    const modal = document.getElementById('loModal');
    if (modal) {
      modal.classList.add('lo-modal-open');
      document.body.style.overflow = 'hidden';
    }
  };

  window.loCloseModal = function (e) {
    // Called directly (close btn) or by overlay click
    if (e && e.target !== document.getElementById('loModal')) return;
    const modal = document.getElementById('loModal');
    if (modal) modal.classList.remove('lo-modal-open');
    document.body.style.overflow = '';
  };

  function buildSummary() {
    const el = document.getElementById('loSummary');
    if (!el) return;

    const allChosen = STEPS.every(s => ORDER[s.key]);
    const missing   = STEPS.filter(s => !ORDER[s.key]).map(s => s.label);

    let html = '';

    // Incomplete warning
    if (!allChosen) {
      html += `<div class="lo-incomplete">
        <span>⚠️</span> You haven't chosen a <strong>${missing.join(', ')}</strong> yet — you can still send a partial order or a question.
      </div>`;
    }

    // Summary rows
    STEPS.forEach(s => {
      const val   = ORDER[s.key];
      const spice = (s.key === 'flavour' && ORDER.spiceLevel) ? ` (${ORDER.spiceLevel})` : '';
      html += `
        <div class="lo-sum-row ${val ? 'lo-row-done' : 'lo-row-empty'}">
          <span class="lo-sum-icon">${s.icon}</span>
          <div class="lo-sum-text">
            <span class="lo-sum-label">${s.label}</span>
            <span class="lo-sum-val">${val ? val + spice : '<em>Not chosen yet</em>'}</span>
          </div>
          ${val ? '<span class="lo-sum-tick">✓</span>' : ''}
        </div>
        ${s.key === 'flavour' && val === 'Peri Peri' ? spicePicker() : ''}`;
    });

    // Price total
    html += `<div class="lo-sum-total">
      <span>Full meal</span>
      <strong>₫130,000</strong>
    </div>`;

    el.innerHTML = html;

    // Wire up spice buttons
    el.querySelectorAll('.lo-spice-btn').forEach(btn => {
      if (ORDER.spiceLevel === btn.dataset.spice) btn.classList.add('lo-spice-active');
      btn.addEventListener('click', () => {
        ORDER.spiceLevel = btn.dataset.spice;
        el.querySelectorAll('.lo-spice-btn').forEach(b => b.classList.remove('lo-spice-active'));
        btn.classList.add('lo-spice-active');
        // Update bar chip
        const barChip = document.querySelector('[data-bar-step="flavour"]');
        if (barChip) {
          barChip.textContent = `Peri Peri (${ORDER.spiceLevel})`;
        }
      });
    });
  }

  function spicePicker() {
    return `<div class="lo-spice-row">
      <span class="lo-spice-label">Heat level:</span>
      <button class="lo-spice-btn" data-spice="Mild">🌶 Mild</button>
      <button class="lo-spice-btn" data-spice="Medium">🌶🌶 Medium</button>
      <button class="lo-spice-btn" data-spice="Hot">🌶🌶🌶 Hot</button>
    </div>`;
  }

  /* ── Build the message text ──────────────────────────── */
  function buildMessage() {
    const name  = (document.getElementById('loName')?.value  || '').trim();
    const notes = (document.getElementById('loNotes')?.value || '').trim();
    const spice = ORDER.spiceLevel ? ` (${ORDER.spiceLevel})` : '';

    let msg = `🍽️ New Order — Lovely Oven\n\n`;
    msg += `🍗 Protein:  ${ORDER.protein || '—'}\n`;
    msg += `🔥 Flavour:  ${ORDER.flavour  ? ORDER.flavour + spice : '—'}\n`;
    msg += `🌾 Carb:     ${ORDER.carb     || '—'}\n`;
    msg += `🥗 Side:     ${ORDER.side     || '—'}\n`;
    msg += `\n💰 Total:  ₫130,000\n`;
    if (name)  msg += `\n👤 Name:   ${name}`;
    if (notes) msg += `\n📝 Notes:  ${notes}`;
    msg += `\n\n— Sent from lovelyoven.com`;
    return msg;
  }

  /* ── Send actions ────────────────────────────────────── */
  window.loSendWhatsApp = function () {
    const msg = buildMessage();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  window.loSendZalo = function () {
    const msg  = buildMessage();
    const btn  = document.getElementById('loZaloBtn');

    // Copy to clipboard
    navigator.clipboard.writeText(msg).then(() => {
      if (btn) {
        btn.innerHTML = '<span class="lo-send-icon">✓</span> Copied! Opening Zalo…';
        btn.disabled = true;
        setTimeout(() => {
          btn.innerHTML = '<span class="lo-send-icon">📱</span> Send via Zalo';
          btn.disabled = false;
        }, 3500);
      }
    }).catch(() => {
      // Fallback: show message in a prompt so they can copy manually
      window.prompt('Copy this message and paste it into Zalo:', msg);
    });

    // Open Zalo chat after a short delay so the copy toast shows first
    setTimeout(() => {
      window.open(`https://zalo.me/${ZALO_NUMBER}`, '_blank');
    }, 400);
  };

  /* ── Inject HTML ─────────────────────────────────────── */
  function injectUI() {

    /* Floating order bar */
    const barHTML = `
<div class="lo-bar" id="loBar">
  <div class="lo-bar-chips">
    <div class="lo-chip" data-bar-step="protein"><span class="lo-chip-icon">🍗</span>Protein</div>
    <div class="lo-chip" data-bar-step="flavour"><span class="lo-chip-icon">🔥</span>Flavour</div>
    <div class="lo-chip" data-bar-step="carb"><span class="lo-chip-icon">🌾</span>Carb</div>
    <div class="lo-chip" data-bar-step="side"><span class="lo-chip-icon">🥗</span>Side</div>
  </div>
  <button class="lo-bar-btn" id="loBarBtn" onclick="loOpenModal()">Review Order</button>
</div>`;

    /* Order modal */
    const modalHTML = `
<div class="lo-modal-overlay" id="loModal" onclick="loCloseModal(event)">
  <div class="lo-modal">

    <button class="lo-modal-close" onclick="loCloseModal()" aria-label="Close">✕</button>

    <div class="lo-modal-header">
      <span class="lo-modal-eyebrow">Lovely Oven</span>
      <h3 class="lo-modal-title">Your Order</h3>
    </div>

    <div id="loSummary" class="lo-summary"></div>

    <div class="lo-modal-fields">
      <input  type="text" id="loName"  class="lo-input"    placeholder="Your name (optional)" />
      <textarea           id="loNotes" class="lo-textarea" placeholder="Special requests, delivery address, anything else…" rows="3"></textarea>
    </div>

    <div class="lo-modal-actions">
      <button class="lo-send-btn lo-whatsapp-btn" onclick="loSendWhatsApp()">
        <span class="lo-send-icon">💬</span> Send via WhatsApp
      </button>
      <button class="lo-send-btn lo-zalo-btn" id="loZaloBtn" onclick="loSendZalo()">
        <span class="lo-send-icon">📱</span> Send via Zalo
      </button>
    </div>

    <p class="lo-modal-hint">
      WhatsApp opens with your order pre-typed. Zalo copies it to your clipboard — just paste when the chat opens.
    </p>

  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', barHTML + modalHTML);
  }

  /* ── Kick off ────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
