/* ============================================================
   Lovely Oven — Order Builder
   Handles selection, floating order bar, modal, and sending
   via WhatsApp (pre-filled) or Zalo (clipboard + open chat).
   ============================================================ */

(function () {

  /* ── Config ─────────────────────────────────────────── */
  const WHATSAPP_NUMBER = '84987390140';
  const ZALO_NUMBER     = '0987390140';

  /* ── Order state ─────────────────────────────────────── */
  // Chicken meal: one item requiring all 4 steps
  // extras / setMeals: quantity-based, each keyed by item value
  const ORDER = {
    protein: null, flavour: null, spiceLevel: null, carb: null, side: null,
    extras:   {},  // { key: { label, price, qty } }
    setMeals: {}   // { key: { label, price, qty } }
  };

  const STEPS = [
    { key: 'protein', label: 'Cut',      icon: '🍗' },
    { key: 'flavour', label: 'Marinade', icon: '🔥' },
    { key: 'carb',    label: 'Carb',     icon: '🌾' },
    { key: 'side',    label: 'Side',     icon: '🥗' },
  ];

  /* ── Helpers ──────────────────────────────────────────── */
  function getTotalQty() {
    let n = 0;
    Object.values(ORDER.extras).forEach(v => n += v.qty);
    Object.values(ORDER.setMeals).forEach(v => n += v.qty);
    return n;
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectUI();
    attachHandlers();
    updateBar();
  }

  /* ── Attach click handlers to all selectable items ───── */
  function attachHandlers() {
    document.querySelectorAll('[data-group]').forEach(el => {
      const g = el.dataset.group;
      if (g === 'extra' || g === 'setmeal') {
        el.addEventListener('click', handleQtySelect);
      } else {
        el.addEventListener('click', handleSelect);
      }
    });
  }

  /* Radio-style handler for chicken 4-step flow */
  function handleSelect(e) {
    if (e.target.closest('.lo-qty-ctrl')) return;
    const el    = e.currentTarget;
    const group = el.dataset.group;
    const value = el.dataset.value;

    document.querySelectorAll(`[data-group="${group}"]`).forEach(item => {
      item.classList.remove('order-selected');
    });

    if (ORDER[group] === value) {
      ORDER[group] = null;
      if (group === 'flavour') ORDER.spiceLevel = null;
    } else {
      ORDER[group] = value;
      el.classList.add('order-selected');
      if (group === 'flavour' && value !== 'Peri Peri') {
        ORDER.spiceLevel = null;
      }
    }

    updateBar();
  }

  /* Quantity-style handler for extras and set meals */
  function handleQtySelect(e) {
    if (e.target.closest('.lo-qty-ctrl')) return;
    const el    = e.currentTarget;
    const group = el.dataset.group;
    const key   = el.dataset.value;
    const label = el.dataset.label || key;
    const price = parseInt(el.dataset.price || '0', 10);
    const store = group === 'setmeal' ? ORDER.setMeals : ORDER.extras;

    if (!store[key]) store[key] = { label, price, qty: 0 };
    store[key].qty += 1;
    el.classList.add('order-selected');
    renderQtyCtrl(el, store[key].qty, group, key, store);
    updateBar();
  }

  function changeQty(el, group, key, store, delta) {
    if (!store[key]) return;
    store[key].qty = Math.max(0, store[key].qty + delta);
    if (store[key].qty === 0) {
      delete store[key];
      el.classList.remove('order-selected');
      const ctrl = el.querySelector('.lo-qty-ctrl');
      if (ctrl) ctrl.remove();
    } else {
      const num = el.querySelector('.lo-qty-num');
      if (num) num.textContent = store[key].qty;
    }
    updateBar();
  }

  function renderQtyCtrl(el, qty, group, key, store) {
    let ctrl = el.querySelector('.lo-qty-ctrl');
    if (!ctrl) {
      ctrl = document.createElement('div');
      ctrl.className = 'lo-qty-ctrl';
      ctrl.innerHTML =
        `<button class="lo-qty-btn" aria-label="Remove one">−</button>` +
        `<span class="lo-qty-num">${qty}</span>` +
        `<button class="lo-qty-btn" aria-label="Add one">+</button>`;
      ctrl.children[0].addEventListener('click', e => { e.stopPropagation(); changeQty(el, group, key, store, -1); });
      ctrl.children[2].addEventListener('click', e => { e.stopPropagation(); changeQty(el, group, key, store, +1); });
      el.appendChild(ctrl);
    } else {
      ctrl.querySelector('.lo-qty-num').textContent = qty;
    }
  }

  /* ── Floating order bar ──────────────────────────────── */
  function updateBar() {
    const bar = document.getElementById('loBar');
    if (!bar) return;

    const hasChicken = STEPS.some(s => ORDER[s.key]);
    const totalQty   = getTotalQty();
    const hasAny     = hasChicken || totalQty > 0;
    bar.classList.toggle('lo-bar-visible', hasAny);

    STEPS.forEach(s => {
      const chip = bar.querySelector(`[data-bar-step="${s.key}"]`);
      if (!chip) return;
      if (ORDER[s.key]) {
        let text = ORDER[s.key];
        if (s.key === 'flavour' && ORDER.spiceLevel) text += ` (${ORDER.spiceLevel})`;
        if (text.length > 18) text = text.substring(0, 16) + '…';
        chip.textContent = text;
        chip.classList.add('lo-chip-filled');
      } else {
        chip.innerHTML = `<span class="lo-chip-icon">${s.icon}</span>${s.label}`;
        chip.classList.remove('lo-chip-filled');
      }
    });

    // Extras/setmeal count chip — only shows when items are selected
    const extChip = bar.querySelector('[data-bar-step="extras"]');
    if (extChip) {
      if (totalQty > 0) {
        extChip.innerHTML = `<span class="lo-chip-icon">🛒</span>+${totalQty}`;
        extChip.classList.add('lo-chip-filled');
        extChip.style.display = '';
      } else {
        extChip.style.display = 'none';
      }
    }

    const allChickenChosen = STEPS.every(s => ORDER[s.key]);
    const orderComplete    = allChickenChosen || (!hasChicken && totalQty > 0);
    const btn = document.getElementById('loBarBtn');
    if (btn) {
      btn.textContent = orderComplete ? 'Send Order →' : 'Review Order';
      btn.classList.toggle('lo-btn-ready', orderComplete);
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
    if (e && e.target !== document.getElementById('loModal')) return;
    const modal = document.getElementById('loModal');
    if (modal) modal.classList.remove('lo-modal-open');
    document.body.style.overflow = '';
  };

  function buildSummary() {
    const el = document.getElementById('loSummary');
    if (!el) return;

    const allChosen  = STEPS.every(s => ORDER[s.key]);
    const hasChicken = STEPS.some(s => ORDER[s.key]);
    const missing    = STEPS.filter(s => !ORDER[s.key]).map(s => s.label);
    const setKeys    = Object.keys(ORDER.setMeals);
    const extKeys    = Object.keys(ORDER.extras);

    let html = '';

    /* ── Chicken meal ── */
    if (hasChicken) {
      html += `<div class="lo-section-title">🍗 Chicken Meal</div>`;

      if (!allChosen) {
        html += `<div class="lo-incomplete">
          <span>⚠️</span> Still need: <strong>${missing.join(', ')}</strong>
        </div>`;
      }

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

      if (allChosen) {
        html += `<div class="lo-sum-subtotal"><span>Chicken meal</span><strong>₫130,000</strong></div>`;
      }
    }

    /* ── Set Meals ── */
    if (setKeys.length > 0) {
      html += `<div class="lo-section-title">🍲 Set Meals</div>`;
      let setTotal = 0;
      setKeys.forEach(k => {
        const item = ORDER.setMeals[k];
        const line = item.price * item.qty;
        setTotal += line;
        html += `<div class="lo-sum-row lo-row-done">
          <span class="lo-sum-icon">🍲</span>
          <div class="lo-sum-text">
            <span class="lo-sum-label">${item.label}</span>
            <span class="lo-sum-val">× ${item.qty}</span>
          </div>
          <span class="lo-sum-tick">₫${line.toLocaleString()}</span>
        </div>`;
      });
      html += `<div class="lo-sum-subtotal"><span>Set Meals</span><strong>₫${setTotal.toLocaleString()}</strong></div>`;
    }

    /* ── Extras ── */
    if (extKeys.length > 0) {
      html += `<div class="lo-section-title">➕ Extras</div>`;
      let extTotal = 0;
      extKeys.forEach(k => {
        const item = ORDER.extras[k];
        const line = item.price * item.qty;
        extTotal += line;
        html += `<div class="lo-sum-row lo-row-done">
          <span class="lo-sum-icon">➕</span>
          <div class="lo-sum-text">
            <span class="lo-sum-label">${item.label}</span>
            <span class="lo-sum-val">× ${item.qty}</span>
          </div>
          <span class="lo-sum-tick">₫${line.toLocaleString()}</span>
        </div>`;
      });
      html += `<div class="lo-sum-subtotal"><span>Extras</span><strong>₫${extTotal.toLocaleString()}</strong></div>`;
    }

    /* ── Grand total ── */
    let grandTotal = 0;
    if (allChosen) grandTotal += 130000;
    Object.values(ORDER.setMeals).forEach(v => grandTotal += v.price * v.qty);
    Object.values(ORDER.extras).forEach(v => grandTotal += v.price * v.qty);
    if (grandTotal > 0) {
      html += `<div class="lo-sum-total"><span>Total</span><strong>₫${grandTotal.toLocaleString()}</strong></div>`;
    }

    el.innerHTML = html;

    // Wire up spice buttons
    el.querySelectorAll('.lo-spice-btn').forEach(btn => {
      if (ORDER.spiceLevel === btn.dataset.spice) btn.classList.add('lo-spice-active');
      btn.addEventListener('click', () => {
        ORDER.spiceLevel = btn.dataset.spice;
        el.querySelectorAll('.lo-spice-btn').forEach(b => b.classList.remove('lo-spice-active'));
        btn.classList.add('lo-spice-active');
        const barChip = document.querySelector('[data-bar-step="flavour"]');
        if (barChip) barChip.textContent = `Peri Peri (${ORDER.spiceLevel})`;
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
    const name     = (document.getElementById('loName')?.value  || '').trim();
    const notes    = (document.getElementById('loNotes')?.value || '').trim();
    const spice    = ORDER.spiceLevel ? ` (${ORDER.spiceLevel})` : '';
    const hasChicken = STEPS.some(s => ORDER[s.key]);
    const setKeys  = Object.keys(ORDER.setMeals);
    const extKeys  = Object.keys(ORDER.extras);

    let msg = `🍽️ New Order — Lovely Oven\n\n`;

    if (hasChicken) {
      msg += `🍗 CHICKEN MEAL\n`;
      msg += `   Cut:      ${ORDER.protein || '—'}\n`;
      msg += `   Marinade: ${ORDER.flavour ? ORDER.flavour + spice : '—'}\n`;
      msg += `   Carb:     ${ORDER.carb || '—'}\n`;
      msg += `   Side:     ${ORDER.side || '—'}\n`;
      if (STEPS.every(s => ORDER[s.key])) msg += `   Subtotal: ₫130,000\n`;
      msg += '\n';
    }

    if (setKeys.length > 0) {
      msg += `🍲 SET MEALS\n`;
      let total = 0;
      setKeys.forEach(k => {
        const item = ORDER.setMeals[k];
        const line = item.price * item.qty;
        total += line;
        msg += `   ${item.label} × ${item.qty}  ₫${line.toLocaleString()}\n`;
      });
      msg += `   Subtotal: ₫${total.toLocaleString()}\n\n`;
    }

    if (extKeys.length > 0) {
      msg += `➕ EXTRAS\n`;
      let total = 0;
      extKeys.forEach(k => {
        const item = ORDER.extras[k];
        const line = item.price * item.qty;
        total += line;
        msg += `   ${item.label} × ${item.qty}  ₫${line.toLocaleString()}\n`;
      });
      msg += `   Subtotal: ₫${total.toLocaleString()}\n\n`;
    }

    if (name)  msg += `👤 Name:   ${name}\n`;
    if (notes) msg += `📝 Notes:  ${notes}\n`;
    msg += `\n— Sent from lovelyoven.com`;
    return msg;
  }

  /* ── Send actions ────────────────────────────────────── */
  window.loSendWhatsApp = function () {
    const msg = buildMessage();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  window.loSendZalo = function () {
    const msg = buildMessage();
    const btn = document.getElementById('loZaloBtn');

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
      window.prompt('Copy this message and paste it into Zalo:', msg);
    });

    setTimeout(() => {
      window.open(`https://zalo.me/${ZALO_NUMBER}`, '_blank');
    }, 400);
  };

  /* ── Inject HTML ─────────────────────────────────────── */
  function injectUI() {

    const barHTML = `
<div class="lo-bar" id="loBar">
  <div class="lo-bar-chips">
    <div class="lo-chip" data-bar-step="protein"><span class="lo-chip-icon">🍗</span>Cut</div>
    <div class="lo-chip" data-bar-step="flavour"><span class="lo-chip-icon">🔥</span>Marinade</div>
    <div class="lo-chip" data-bar-step="carb"><span class="lo-chip-icon">🌾</span>Carb</div>
    <div class="lo-chip" data-bar-step="side"><span class="lo-chip-icon">🥗</span>Side</div>
    <div class="lo-chip lo-chip-extras" data-bar-step="extras" style="display:none"></div>
  </div>
  <button class="lo-bar-btn" id="loBarBtn" onclick="loOpenModal()">Review Order</button>
</div>`;

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
