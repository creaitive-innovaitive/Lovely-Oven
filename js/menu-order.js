/* ============================================================
   Lovely Oven — Order Builder
   Handles selection, floating order bar, modal, and sending
   via WhatsApp (pre-filled) or Zalo (clipboard + open chat).
   ============================================================ */

(function () {

  /* ── Config ─────────────────────────────────────────── */
  const WHATSAPP_NUMBER = '84987390140';
  const ZALO_NUMBER     = '0987390140';
  // Public values: the table only accepts new rows from here and cannot be read without a staff login.
  const ORDERS_URL = 'https://drkebbkyipipxwcclihc.supabase.co/rest/v1/web_orders';
  const ORDERS_KEY = 'sb_publishable_x2cn9JVmEk5eCUJ3CtiAgA_5zLN4XqM';

  /* ── Order state ─────────────────────────────────────── */
  // Chicken meal: one item requiring all 4 steps
  // extras / setMeals: quantity-based, each keyed by item value
  const ORDER = {
    protein: null, flavour: null, spiceLevel: null, carb: null, side: null,
    extras:   {},  // { key: { label, price, qty } }
    toppings: {},  // soup-only options, only orderable alongside a soup
    setMeals: {}   // { key: { label, price, qty } }
  };

  const STEPS = [
    { key: 'protein', label: 'Cut',      icon: '🍗' },
    { key: 'flavour', label: 'Marinade', icon: '🔥' },
    { key: 'carb',    label: 'Carb',     icon: '🍚' },
    { key: 'side',    label: 'Side',     icon: '🥗' },
  ];

  /* Per-item options: rice yes/no (+10k) and a choice of side from Add-ons & Extras.
     A side is included in the price; wedges and cauliflower mash carry a surcharge. */
  const RICE_PRICE = 10000;
  const SIDE_OPTIONS = [
    { value: 'Coleslaw',         extra: 0 },
    { value: 'Rice',             extra: 0 },
    { value: 'Potato wedges',    extra: 10000 },
    { value: 'Cauliflower mash', extra: 20000 },
    { value: 'Fried egg',        extra: 0 },
    { value: 'Boiled egg',       extra: 0 }
  ];
  const sideExtra = v => (SIDE_OPTIONS.find(o => o.value === v) || {}).extra || 0;
  const fmt = n => '₫' + n.toLocaleString();

  function recalc(item) {
    item.price = item.base + (item.rice === 'Yes' ? RICE_PRICE : 0) + sideExtra(item.side);
    const bits = [];
    if (item.hasRice) bits.push(`Rice: ${item.rice}`);
    if (item.hasSide) bits.push(`Side: ${item.side ? item.side + (sideExtra(item.side) ? ` (+${fmt(sideExtra(item.side))})` : '') : 'not chosen'}`);
    item.detail = bits.join(' · ');
  }

  function renderOpts(el, item) {
    let box = el.querySelector('.o-opts');
    if (box) return;
    box = document.createElement('div');
    box.className = 'o-opts';
    box.addEventListener('click', e => e.stopPropagation());
    if (item.hasRice) {
      box.innerHTML += `<div class="o-opt-row" data-opt="rice"><b>Add rice +${fmt(RICE_PRICE)}?</b>` +
        `<button type="button" class="o-opt" data-v="Yes">Yes</button><button type="button" class="o-opt active" data-v="No">No</button></div>`;
    }
    if (item.hasSide) {
      box.innerHTML += `<div class="o-opt-row" data-opt="side"><b>Choose 1 side</b>` +
        SIDE_OPTIONS.map(o => `<button type="button" class="o-opt" data-v="${o.value}">${o.value}<small>${o.extra ? '+' + fmt(o.extra) : 'included'}</small></button>`).join('') + `</div>`;
    }
    box.addEventListener('click', e => {
      const b = e.target.closest('.o-opt');
      if (!b) return;
      const kind = b.parentElement.dataset.opt;
      item[kind] = b.dataset.v;
      b.parentElement.querySelectorAll('.o-opt').forEach(x => x.classList.toggle('active', x === b));
      recalc(item);
      updateBar();
    });
    el.classList.add('has-opts');
    el.appendChild(box);
  }

  function removeOpts(el) {
    const box = el.querySelector('.o-opts');
    if (box) box.remove();
    el.classList.remove('has-opts');
  }

  /* ── Helpers ──────────────────────────────────────────── */
  function getTotalQty() {
    let n = 0;
    Object.values(ORDER.extras).forEach(v => n += v.qty);
    Object.values(ORDER.setMeals).forEach(v => n += v.qty);
    Object.values(ORDER.toppings).forEach(v => n += v.qty);
    return n;
  }

  /* Soup toppings can only be ordered with a soup */
  function soupCount() {
    return Object.values(ORDER.setMeals).reduce((n, v) => n + (v.soup ? v.qty : 0), 0);
  }

  function syncToppings() {
    const locked = soupCount() === 0;
    if (locked && Object.keys(ORDER.toppings).length) {
      ORDER.toppings = {};
      document.querySelectorAll('[data-group="topping"]').forEach(el => {
        el.classList.remove('order-selected');
        const ctrl = el.querySelector('.lo-qty-ctrl');
        if (ctrl) ctrl.remove();
      });
    }
    document.querySelectorAll('[data-group="topping"]').forEach(el => el.classList.toggle('o-locked', locked));
    document.querySelectorAll('.o-topping-note').forEach(el => el.classList.toggle('o-topping-note-open', !locked));
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectUI();
    attachHandlers();
    updateBar();
  }

  /* Sides that add to the ₫130,000 chicken meal price */
  const SIDE_SURCHARGE = { 'Cauliflower Mash': 10000 };
  const chickenPrice = () => 130000 + (SIDE_SURCHARGE[ORDER.side] || 0);
  const sideText = v => v && SIDE_SURCHARGE[v] ? `${v} (+₫${SIDE_SURCHARGE[v].toLocaleString()})` : v;

  /* ── Attach click handlers to all selectable items ───── */
  function attachHandlers() {
    document.querySelectorAll('[data-group]').forEach(el => {
      const g = el.dataset.group;
      if (g === 'extra' || g === 'setmeal' || g === 'topping') {
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
    const store = group === 'setmeal' ? ORDER.setMeals : group === 'topping' ? ORDER.toppings : ORDER.extras;
    if (group === 'topping' && soupCount() === 0) return;

    if (!store[key]) {
      store[key] = { label, price, base: price, qty: 0, soup: el.dataset.soup === '1',
        hasRice: el.dataset.rice === '1', hasSide: el.dataset.side === '1', rice: 'No', side: null };
      recalc(store[key]);
    }
    store[key].qty += 1;
    el.classList.add('order-selected');
    renderQtyCtrl(el, store[key].qty, group, key, store);
    if (store[key].hasRice || store[key].hasSide) renderOpts(el, store[key]);
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
      removeOpts(el);
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
    syncToppings();
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

  /* ── Clear everything ────────────────────────────────── */
  window.loClearSelection = function () {
    ['protein', 'flavour', 'carb', 'side', 'spiceLevel'].forEach(k => { ORDER[k] = null; });
    ORDER.extras = {};
    ORDER.toppings = {};
    ORDER.setMeals = {};
    document.querySelectorAll('.order-selected').forEach(el => el.classList.remove('order-selected'));
    document.querySelectorAll('.lo-qty-ctrl').forEach(el => el.remove());
    document.querySelectorAll('.o-item.has-opts').forEach(removeOpts);
    updateBar();
  };

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
    const topKeys    = Object.keys(ORDER.toppings);

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
              <span class="lo-sum-val">${val ? (s.key === 'side' ? sideText(val) : val) + spice : '<em>Not chosen yet</em>'}</span>
            </div>
            ${val ? '<span class="lo-sum-tick">✓</span>' : ''}
          </div>
          ${s.key === 'flavour' && val === 'Peri Peri' ? spicePicker() : ''}`;
      });

      if (allChosen) {
        html += `<div class="lo-sum-subtotal"><span>Chicken meal</span><strong>₫${chickenPrice().toLocaleString()}</strong></div>`;
      }
    }

    /* ── Main Meals ── */
    if (setKeys.length > 0) {
      html += `<div class="lo-section-title">🍲 Main Meals</div>`;
      let setTotal = 0;
      setKeys.forEach(k => {
        const item = ORDER.setMeals[k];
        const line = item.price * item.qty;
        setTotal += line;
        html += `<div class="lo-sum-row lo-row-done">
          <span class="lo-sum-icon">🍲</span>
          <div class="lo-sum-text">
            <span class="lo-sum-label">${item.label}</span>
            <span class="lo-sum-val">× ${item.qty}${item.detail ? ' · ' + item.detail : ''}</span>
          </div>
          <span class="lo-sum-tick">₫${line.toLocaleString()}</span>
        </div>`;
      });
      html += `<div class="lo-sum-subtotal"><span>Main Meals</span><strong>₫${setTotal.toLocaleString()}</strong></div>`;
    }

    /* ── Soup toppings ── */
    if (topKeys.length > 0) {
      html += `<div class="lo-section-title">🥣 Soup Toppings</div>`;
      let topTotal = 0;
      topKeys.forEach(k => {
        const item = ORDER.toppings[k];
        const line = item.price * item.qty;
        topTotal += line;
        html += `<div class="lo-sum-row lo-row-done">
          <span class="lo-sum-icon">🥣</span>
          <div class="lo-sum-text">
            <span class="lo-sum-label">${item.label}</span>
            <span class="lo-sum-val">× ${item.qty}</span>
          </div>
          <span class="lo-sum-tick">₫${line.toLocaleString()}</span>
        </div>`;
      });
      html += `<div class="lo-sum-subtotal"><span>Soup Toppings</span><strong>₫${topTotal.toLocaleString()}</strong></div>`;
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
    if (allChosen) grandTotal += chickenPrice();
    Object.values(ORDER.setMeals).forEach(v => grandTotal += v.price * v.qty);
    Object.values(ORDER.extras).forEach(v => grandTotal += v.price * v.qty);
    Object.values(ORDER.toppings).forEach(v => grandTotal += v.price * v.qty);
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
    const topKeys  = Object.keys(ORDER.toppings);

    let msg = `🍽️ New Order — Lovely Oven\n\n`;
    let grand = 0;

    if (hasChicken) {
      msg += `🍗 CHICKEN MEAL\n`;
      msg += `   Cut:      ${ORDER.protein || '—'}\n`;
      msg += `   Marinade: ${ORDER.flavour ? ORDER.flavour + spice : '—'}\n`;
      msg += `   Carb:     ${ORDER.carb || '—'}\n`;
      msg += `   Side:     ${sideText(ORDER.side) || '—'}\n`;
      if (STEPS.every(s => ORDER[s.key])) { msg += `   Subtotal: ₫${chickenPrice().toLocaleString()}\n`; grand += chickenPrice(); }
      msg += '\n';
    }

    if (setKeys.length > 0) {
      msg += `🍲 MAIN MEALS\n`;
      let total = 0;
      setKeys.forEach(k => {
        const item = ORDER.setMeals[k];
        const line = item.price * item.qty;
        total += line;
        msg += `   ${item.label} × ${item.qty}  ₫${line.toLocaleString()}\n`;
        if (item.detail) msg += `      ${item.detail}\n`;
      });
      msg += `   Subtotal: ₫${total.toLocaleString()}\n\n`;
      grand += total;
    }

    if (topKeys.length > 0) {
      msg += `🥣 SOUP TOPPINGS\n`;
      let total = 0;
      topKeys.forEach(k => {
        const item = ORDER.toppings[k];
        const line = item.price * item.qty;
        total += line;
        msg += `   ${item.label} × ${item.qty}  ₫${line.toLocaleString()}\n`;
      });
      msg += `   Subtotal: ₫${total.toLocaleString()}\n\n`;
      grand += total;
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
      grand += total;
    }

    msg += `━━━━━━━━━━━━━━━━\n`;
    msg += `💰 FINAL TOTAL: ₫${grand.toLocaleString()}\n`;
    msg += `━━━━━━━━━━━━━━━━\n\n`;

    if (name)  msg += `👤 Name:   ${name}\n`;
    if (notes) msg += `📝 Notes:  ${notes}\n`;
    msg += `\n— Sent from lovelyoven.com`;
    return msg;
  }

  /* ── Itemised copy of the order for the staff dashboard ── */
  function buildItems() {
    const items = [];
    if (STEPS.every(s => ORDER[s.key])) {
      items.push({ g: 'chicken', value: 'chicken', label: 'Chicken meal', qty: 1, price: chickenPrice(),
        detail: [ORDER.protein, ORDER.flavour + (ORDER.spiceLevel ? ` (${ORDER.spiceLevel})` : ''), ORDER.carb, sideText(ORDER.side)].join(' · '),
        opts: { protein: ORDER.protein, flavour: ORDER.flavour, spice: ORDER.spiceLevel || '', carb: ORDER.carb, side: ORDER.side } });
    }
    [['setmeal', ORDER.setMeals], ['topping', ORDER.toppings], ['extra', ORDER.extras]].forEach(([g, group]) => {
      Object.keys(group).forEach(k => {
        const it = group[k];
        items.push({ g, value: k, label: it.label, qty: it.qty, price: it.price, detail: it.detail || '', opts: { rice: it.rice || '', side: it.side || '' } });
      });
    });
    return items;
  }

  let lastPosted = '';
  function postToDashboard(msg) {
    const items = buildItems();
    if (!items.length || msg === lastPosted) return;   // same order sent again (e.g. WhatsApp then Zalo): record it once
    lastPosted = msg;
    const total = items.reduce((n, i) => n + i.price * i.qty, 0);
    const name = (document.getElementById('loName')?.value || '').trim().slice(0, 60);
    const notes = (document.getElementById('loNotes')?.value || '').trim().slice(0, 300);
    try {
      fetch(ORDERS_URL, { method: 'POST', keepalive: true,
        headers: { apikey: ORDERS_KEY, Authorization: 'Bearer ' + ORDERS_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ customer: name, notes, items, total }) }).catch(() => {});
    } catch (e) { /* the WhatsApp/Zalo message is the order; this copy is a bonus */ }
  }

  /* ── Send actions ────────────────────────────────────── */
  window.loSendWhatsApp = function () {
    const msg = buildMessage();
    postToDashboard(msg);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  window.loSendZalo = function () {
    const msg = buildMessage();
    postToDashboard(msg);
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
    <div class="lo-chip" data-bar-step="carb"><span class="lo-chip-icon">🍚</span>Carb</div>
    <div class="lo-chip" data-bar-step="side"><span class="lo-chip-icon">🥗</span>Side</div>
    <div class="lo-chip lo-chip-extras" data-bar-step="extras" style="display:none"></div>
  </div>
  <button class="lo-bar-clear" onclick="loClearSelection()">Clear selection</button>
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
