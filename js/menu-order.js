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

  /* ── Delivery rules: Monday to Friday, 11am to 2pm, Vietnam time ── */
  const VN_TZ = 'Asia/Ho_Chi_Minh';
  const CUTOFF_HOUR = 14;   // deliveries end at 2pm, so today is only offered before then
  const MAX_DAYS_AHEAD = 90;
  function vnNow() {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
  }
  const addDays   = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isWeekend = s => [0, 6].includes(new Date(s + 'T00:00:00Z').getUTCDay());
  const prettyDate = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  function earliestDate() {
    const n = vnNow();
    let d = n.hour < CUTOFF_HOUR ? n.date : addDays(n.date, 1);
    while (isWeekend(d)) d = addDays(d, 1);
    return d;
  }

  /* ── Order state ─────────────────────────────────────── */
  // Chicken meal: one item requiring all 4 steps
  // extras / setMeals: quantity-based, each keyed by item value
  const ORDER = {
    protein: null, flavour: null, spiceLevel: null, carb: null, side: null,
    bflavour: null, bsides: [], btop: {},   // chicken burger: flavour, optional sides (any number), topping extras { name: price }
    meals: [], burgers: [],   // finished "Build your own" meals added with the Add to order button
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

  /* Chicken burger: ₫100,000 with lettuce, tomato and your choice of flavour; a side adds ₫20,000; toppings are extras */
  const BURGER_BASE = 100000, BURGER_SIDE = 20000;
  const burgerStarted  = () => !!(ORDER.bflavour || ORDER.bsides.length || Object.keys(ORDER.btop).length);
  const burgerComplete = () => !!ORDER.bflavour;
  const burgerPrice    = () => BURGER_BASE + ORDER.bsides.length * BURGER_SIDE + Object.values(ORDER.btop).reduce((n, p) => n + p, 0);
  const burgerToppings = () => Object.keys(ORDER.btop);
  const burgerDetail   = () => [ORDER.bflavour, burgerToppings().join(', ') || 'no extra toppings', ORDER.bsides.join(', ') || 'no side'].join(' · ');

  /* Build-your-own meals: the builder holds the one being tailored, "Add to order" files it away so another can be built */
  const mealPriceOf   = m => 130000 + (SIDE_SURCHARGE[m.side] || 0);
  const mealDetailOf  = m => [m.protein, m.flavour + (m.spice ? ` (${m.spice})` : ''), m.carb, sideText(m.side)].join(' · ');
  const burgerPriceOf = b => BURGER_BASE + b.sides.length * BURGER_SIDE + Object.values(b.top).reduce((n, p) => n + p, 0);
  const burgerDetailOf = b => [b.flavour, Object.keys(b.top).join(', ') || 'no extra toppings', b.sides.join(', ') || 'no side'].join(' · ');
  const curMeal   = () => ({ protein: ORDER.protein, flavour: ORDER.flavour, spice: ORDER.spiceLevel || '', carb: ORDER.carb, side: ORDER.side });
  const curBurger = () => ({ flavour: ORDER.bflavour, sides: ORDER.bsides.slice(), top: Object.assign({}, ORDER.btop) });
  const mealReady = () => STEPS.every(s => ORDER[s.key]) && (ORDER.flavour !== 'Peri Peri' || !!ORDER.spiceLevel);
  const allMeals   = () => ORDER.meals.concat(STEPS.every(s => ORDER[s.key]) ? [curMeal()] : []);
  const allBurgers = () => ORDER.burgers.concat(burgerComplete() ? [curBurger()] : []);

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
    n += ORDER.meals.length + ORDER.burgers.length;
    if (burgerComplete()) n += 1;
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

  /* ── "Add to order" for the build-your-own sections ─────── */
  const CHICKEN_GROUPS = ['protein', 'flavour', 'carb', 'side'];
  function setupBuilders() {
    const mk = (secId, kind) => {
      const grid = document.querySelector(`#${secId} .o-build-grid`);
      if (!grid) return;
      const row = document.createElement('div');
      row.className = 'o-addrow';
      row.id = `oAdd-${kind}`;
      row.innerHTML = (kind === 'meal'
        ? `<div class="o-heat" hidden><b>Heat level</b>${['Mild', 'Medium', 'Hot'].map(h => `<span class="o-chip" role="button" tabindex="0" data-heat="${h}">${h}</span>`).join('')}</div>` : '') +
        `<div class="o-addbar"><button type="button" class="o-addbtn" data-add="${kind}" disabled>Add to order</button><span class="o-addhint" aria-live="polite"></span></div>` +
        `<div class="o-added" hidden></div>`;
      grid.insertAdjacentElement('afterend', row);
      row.querySelector('.o-addbtn').addEventListener('click', () => addBuilt(kind));
      row.querySelectorAll('[data-heat]').forEach(c => {
        const pick = () => { ORDER.spiceLevel = ORDER.spiceLevel === c.dataset.heat ? null : c.dataset.heat; updateBar(); };
        c.addEventListener('click', pick);
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      });
      row.addEventListener('click', e => {
        const b = e.target.closest('[data-rm]');
        if (!b) return;
        (kind === 'meal' ? ORDER.meals : ORDER.burgers).splice(+b.dataset.rm, 1);
        updateBar();
      });
    };
    mk('o-chicken', 'meal');
    mk('o-burger', 'burger');
  }

  function addBuilt(kind) {
    if (kind === 'meal') {
      if (!mealReady()) return;
      ORDER.meals.push(curMeal());
      CHICKEN_GROUPS.forEach(g => { ORDER[g] = null; });
      ORDER.spiceLevel = null;
      CHICKEN_GROUPS.forEach(g => document.querySelectorAll(`[data-group="${g}"]`).forEach(el => el.classList.remove('order-selected')));
    } else {
      if (!burgerComplete()) return;
      ORDER.burgers.push(curBurger());
      ORDER.bflavour = null; ORDER.bsides = []; ORDER.btop = {};
      ['bflavour', 'btop', 'bside'].forEach(g => document.querySelectorAll(`[data-group="${g}"]`).forEach(el => el.classList.remove('order-selected')));
    }
    updateBar();
    const hint = document.querySelector(`#oAdd-${kind} .o-addhint`);
    if (hint) hint.textContent = 'Added. Build another or review your order below.';
  }

  /* Keeps the heat row, button state and added-lists in step with the current selection */
  function syncBuilders() {
    const heat = document.querySelector('#oAdd-meal .o-heat');
    if (heat) {
      heat.hidden = ORDER.flavour !== 'Peri Peri';
      heat.querySelectorAll('[data-heat]').forEach(c => {
        const on = ORDER.spiceLevel === c.dataset.heat;
        c.classList.toggle('order-selected', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    [['meal', mealReady(), ORDER.meals, mealDetailOf, mealPriceOf, 'Meal',
      () => { const m = STEPS.filter(s => !ORDER[s.key]).map(s => s.label.toLowerCase()); if (ORDER.flavour === 'Peri Peri' && !ORDER.spiceLevel) m.push('heat level'); return m; }],
     ['burger', burgerComplete(), ORDER.burgers, burgerDetailOf, burgerPriceOf, 'Burger', () => ['flavour']]
    ].forEach(([kind, ready, list, detail, price, noun, missing]) => {
      const row = $id(`oAdd-${kind}`);
      if (!row) return;
      const btn = row.querySelector('.o-addbtn'), hint = row.querySelector('.o-addhint'), box = row.querySelector('.o-added');
      btn.disabled = !ready;
      const started = kind === 'meal' ? STEPS.some(s => ORDER[s.key]) : burgerStarted();
      if (ready) hint.textContent = '';
      else if (started) hint.textContent = 'Still to choose: ' + missing().join(', ');
      else if (!list.length) hint.textContent = '';
      box.hidden = !list.length;
      box.innerHTML = list.length ? `<b>In your order (${list.length})</b>` + list.map((x, i) =>
        `<div class="o-added-row"><span>${noun} ${i + 1}: ${detail(x)}</span><span>${fmt(price(x))}</span><button type="button" data-rm="${i}" aria-label="Remove ${noun.toLowerCase()} ${i + 1}">Remove</button></div>`).join('') : '';
    });
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    injectUI();
    setupBuilders();
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
      // Keyboard and screen-reader access: chips act as toggle buttons, item cards as focusable groups
      el.tabIndex = 0;
      if (el.classList.contains('o-chip')) { el.setAttribute('role', 'button'); el.setAttribute('aria-pressed', 'false'); }
      else { el.setAttribute('role', 'group'); el.setAttribute('aria-label', (el.dataset.label || el.dataset.value || '') + (el.dataset.price ? ', ₫' + (+el.dataset.price).toLocaleString() : '')); }
      el.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); el.click(); }
      });
      if (g === 'extra' || g === 'setmeal' || g === 'topping') {
        el.addEventListener('click', handleQtySelect);
      } else if (g === 'btop') {
        el.addEventListener('click', handleBurgerTop);
      } else if (g === 'bside') {
        el.addEventListener('click', handleBurgerSide);
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

  /* Burger toppings: tap to add, tap again to remove */
  function handleBurgerTop(e) {
    const el = e.currentTarget, key = el.dataset.value;
    if (ORDER.btop[key] != null) { delete ORDER.btop[key]; el.classList.remove('order-selected'); }
    else { ORDER.btop[key] = parseInt(el.dataset.price || '0', 10); el.classList.add('order-selected'); }
    updateBar();
  }

  /* Burger sides: tap to add, tap again to remove; each one is +20,000 */
  function handleBurgerSide(e) {
    const el = e.currentTarget, key = el.dataset.value, i = ORDER.bsides.indexOf(key);
    if (i >= 0) { ORDER.bsides.splice(i, 1); el.classList.remove('order-selected'); }
    else { ORDER.bsides.push(key); el.classList.add('order-selected'); }
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
    syncBuilders();
    const bar = document.getElementById('loBar');
    if (!bar) return;

    const hasChicken = STEPS.some(s => ORDER[s.key]);
    const totalQty   = getTotalQty();
    const hasAny     = hasChicken || totalQty > 0 || burgerStarted();
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
    const burgerOK         = !burgerStarted() || burgerComplete();
    const orderComplete    = (allChickenChosen || (!hasChicken && totalQty > 0)) && burgerOK && (!hasChicken || allChickenChosen);
    const btn = document.getElementById('loBarBtn');
    if (btn) {
      btn.textContent = orderComplete ? 'Send Order →' : 'Review Order';
      btn.classList.toggle('lo-btn-ready', orderComplete);
    }
  }

  /* ── Clear everything ────────────────────────────────── */
  window.loClearSelection = function () {
    ['protein', 'flavour', 'carb', 'side', 'spiceLevel'].forEach(k => { ORDER[k] = null; });
    ORDER.bflavour = null; ORDER.bsides = []; ORDER.btop = {};
    ORDER.meals = []; ORDER.burgers = [];
    ORDER.extras = {};
    ORDER.toppings = {};
    ORDER.setMeals = {};
    document.querySelectorAll('.order-selected').forEach(el => el.classList.remove('order-selected'));
    document.querySelectorAll('.lo-qty-ctrl').forEach(el => el.remove());
    document.querySelectorAll('.o-item.has-opts').forEach(removeOpts);
    updateBar();
  };

  /* ── Modal ───────────────────────────────────────────── */
  let lastFocus = null;
  window.loOpenModal = function () {
    buildSummary();
    const modal = document.getElementById('loModal');
    if (modal) {
      modal.classList.add('lo-modal-open');
      document.body.style.overflow = 'hidden';
      document.body.classList.add('lo-open');
      lastFocus = document.activeElement;
      const x = modal.querySelector('.lo-modal-close'); if (x) x.focus();
    }
  };

  window.loCloseModal = function (e) {
    if (e && e.target !== document.getElementById('loModal')) return;
    const modal = document.getElementById('loModal');
    if (modal) {
      modal.classList.remove('lo-modal-open');
      modal.querySelector('.lo-modal').classList.remove('lo-sent');
    }
    document.body.style.overflow = '';
    document.body.classList.remove('lo-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  };

  /* After sending: clear the cart and close */
  window.loFinish = function () {
    window.loClearSelection();
    lastPosted = '';
    window.loCloseModal();
  };

  /* ── Delivery details form ───────────────────────────── */
  const $id = id => document.getElementById(id);
  const val = id => ($id(id)?.value || '').trim();
  const SAVED_KEY = 'lo-details';

  function readDetails() {
    return { name: val('loName').slice(0, 60), phone: val('loPhone').slice(0, 20), date: val('loDate'),
             address: val('loAddress').slice(0, 250), notes: val('loNotes').slice(0, 300) };
  }

  function checkDetails(d) {
    const n = vnNow(), min = earliestDate();
    if (!d.name)  return ['loName', 'Please add your name.'];
    if (d.phone.replace(/\D/g, '').length < 8) return ['loPhone', 'Please add a phone number Mika can reach you on.'];
    if (!d.date)  return ['loDate', 'Please choose a delivery date.'];
    if (isWeekend(d.date)) return ['loDate', 'We deliver Monday to Friday. Please pick a weekday.'];
    if (d.date < min) return ['loDate', d.date === n.date ? `Today's delivery window has closed. The earliest date is ${prettyDate(min)}.` : `That date has passed. The earliest date is ${prettyDate(min)}.`];
    if (d.date > addDays(n.date, MAX_DAYS_AHEAD)) return ['loDate', 'Please choose a date within the next three months.'];
    if (d.address.length < 6) return ['loAddress', 'Please add your delivery address.'];
    return null;
  }

  /* Anything half-finished that would send a confusing order */
  function orderProblem() {
    const missing = STEPS.filter(s => !ORDER[s.key]).map(s => s.label);
    if (STEPS.some(s => ORDER[s.key]) && missing.length) return `Your chicken meal still needs: ${missing.join(', ')}.`;
    if (ORDER.flavour === 'Peri Peri' && !ORDER.spiceLevel) return 'Please choose a heat level for your Peri Peri chicken.';
    if (burgerStarted() && !burgerComplete()) return 'Your burger still needs a flavour.';
    const noSide = Object.values(ORDER.setMeals).find(i => i.hasSide && !i.side);
    if (noSide) return `Please choose a side for ${noSide.label}.`;
    if (!buildItems().length) return 'Your order is empty.';
    return null;
  }

  function showErr(id, msg) {
    document.querySelectorAll('.lo-invalid').forEach(el => el.classList.remove('lo-invalid'));
    const box = $id('loErr');
    if (!box) return;
    box.hidden = !msg;
    box.textContent = msg || '';
    if (!msg) return;
    const field = id && $id(id);
    if (field) { field.classList.add('lo-invalid'); field.focus({ preventScroll: true }); }
    (field || box).scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function updateDateHint() {
    const hint = $id('loDateHint'), d = val('loDate');
    if (!hint) return;
    hint.textContent = !d ? 'Monday to Friday, delivered 11am to 2pm.'
      : d === vnNow().date ? 'Same-day orders depend on what is left. Mika will confirm.'
      : 'Delivered 11am to 2pm.';
  }

  /* Returns the details if the form and the order are good to send, otherwise shows what is wrong */
  function prepareSend() {
    const problem = orderProblem();
    if (problem) { showErr(null, problem); return null; }
    const d = readDetails(), bad = checkDetails(d);
    if (bad) { showErr(bad[0], bad[1]); return null; }
    showErr();
    try { localStorage.setItem(SAVED_KEY, JSON.stringify({ name: d.name, phone: d.phone, address: d.address })); } catch (e) { /* private mode */ }
    return d;
  }

  function showSent(how, d, retry) {
    const total = buildItems().reduce((n, i) => n + i.price * i.qty, 0);
    const box = $id('loConfirm');
    if (!box) return;
    $id('loConfirmTitle').textContent = how === 'whatsapp' ? 'One more step' : 'Order copied';
    $id('loConfirmText').textContent = how === 'whatsapp'
      ? 'WhatsApp has opened with your order typed in. Press Send there. Your order only reaches Mika once you do, and she will confirm on WhatsApp.'
      : 'Your order is copied. Paste it into the Zalo chat and press Send. Your order only reaches Mika once you do, and she will confirm on Zalo.';
    const rows = [['Delivery', `${prettyDate(d.date)}, 11am to 2pm`], ['To', d.address], ['Total', fmt(total)]];
    const card = $id('loConfirmCard');
    card.textContent = '';
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      const a = document.createElement('span'), b = document.createElement('strong');
      a.textContent = k; b.textContent = v;
      row.append(a, b);
      card.appendChild(row);
    });
    const again = $id('loConfirmAgain');
    again.textContent = how === 'whatsapp' ? 'Open WhatsApp again' : 'Open Zalo again';
    again.onclick = retry;
    document.querySelector('#loModal .lo-modal').classList.add('lo-sent');
    box.hidden = false;
    $id('loModal').scrollTop = 0;
  }

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
    const savedRow = (icon, label, detail, price, kind, i) => `<div class="lo-sum-row lo-row-done">
      <span class="lo-sum-icon">${icon}</span>
      <div class="lo-sum-text"><span class="lo-sum-label">${label}</span><span class="lo-sum-val">${detail}</span></div>
      <span class="lo-sum-tick">₫${price.toLocaleString()}</span>
      <button type="button" class="lo-sum-remove" data-remove="${kind}" data-i="${i}" aria-label="Remove ${label}">✕</button>
    </div>`;

    /* ── Chicken meals ── */
    if (hasChicken || ORDER.meals.length) {
      html += `<div class="lo-section-title">🍗 Chicken Meal${ORDER.meals.length + (hasChicken ? 1 : 0) > 1 ? 's' : ''}</div>`;
      ORDER.meals.forEach((m, i) => { html += savedRow('🍗', `Meal ${i + 1}`, mealDetailOf(m), mealPriceOf(m), 'meal', i); });
    }
    if (hasChicken) {
      if (ORDER.meals.length) html += `<div class="lo-sum-label" style="margin:.6rem 0 .2rem">Meal ${ORDER.meals.length + 1}</div>`;

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
    }
    if (allMeals().length) {
      html += `<div class="lo-sum-subtotal"><span>Chicken meal${allMeals().length > 1 ? 's × ' + allMeals().length : ''}</span><strong>₫${allMeals().reduce((n, m) => n + mealPriceOf(m), 0).toLocaleString()}</strong></div>`;
    }

    /* ── Chicken burgers ── */
    if (burgerStarted() || ORDER.burgers.length) {
      html += `<div class="lo-section-title">🍔 Chicken Burger${ORDER.burgers.length + (burgerStarted() ? 1 : 0) > 1 ? 's' : ''}</div>`;
      ORDER.burgers.forEach((b, i) => { html += savedRow('🍔', `Burger ${i + 1}`, burgerDetailOf(b), burgerPriceOf(b), 'burger', i); });
    }
    if (burgerStarted()) {
      if (ORDER.burgers.length) html += `<div class="lo-sum-label" style="margin:.6rem 0 .2rem">Burger ${ORDER.burgers.length + 1}</div>`;
      if (!burgerComplete()) html += `<div class="lo-incomplete"><span>⚠️</span> Still need: <strong>Flavour</strong></div>`;
      [['Flavour', ORDER.bflavour], ['Toppings', burgerToppings().join(', ') || 'Lettuce and tomato only'], ['Sides', ORDER.bsides.length ? ORDER.bsides.join(', ') + ' (+' + fmt(BURGER_SIDE * ORDER.bsides.length) + ')' : 'No side']].forEach(([label, val]) => {
        html += `<div class="lo-sum-row ${val ? 'lo-row-done' : 'lo-row-empty'}"><span class="lo-sum-icon">🍔</span><div class="lo-sum-text"><span class="lo-sum-label">${label}</span><span class="lo-sum-val">${val || '<em>Not chosen yet</em>'}</span></div>${val ? '<span class="lo-sum-tick">✓</span>' : ''}</div>`;
      });
    }
    if (allBurgers().length) {
      html += `<div class="lo-sum-subtotal"><span>Chicken burger${allBurgers().length > 1 ? 's × ' + allBurgers().length : ''}</span><strong>₫${allBurgers().reduce((n, b) => n + burgerPriceOf(b), 0).toLocaleString()}</strong></div>`;
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
    allMeals().forEach(m => grandTotal += mealPriceOf(m));
    allBurgers().forEach(b => grandTotal += burgerPriceOf(b));
    Object.values(ORDER.setMeals).forEach(v => grandTotal += v.price * v.qty);
    Object.values(ORDER.extras).forEach(v => grandTotal += v.price * v.qty);
    Object.values(ORDER.toppings).forEach(v => grandTotal += v.price * v.qty);
    if (grandTotal > 0) {
      html += `<div class="lo-sum-total"><span>Total</span><strong>₫${grandTotal.toLocaleString()}</strong></div>`;
    }

    el.innerHTML = html;

    el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      (b.dataset.remove === 'meal' ? ORDER.meals : ORDER.burgers).splice(+b.dataset.i, 1);
      updateBar();
      buildSummary();
    }));

    // Wire up spice buttons
    el.querySelectorAll('.lo-spice-btn').forEach(btn => {
      if (ORDER.spiceLevel === btn.dataset.spice) btn.classList.add('lo-spice-active');
      btn.addEventListener('click', () => {
        ORDER.spiceLevel = btn.dataset.spice;
        el.querySelectorAll('.lo-spice-btn').forEach(b => b.classList.remove('lo-spice-active'));
        btn.classList.add('lo-spice-active');
        const barChip = document.querySelector('[data-bar-step="flavour"]');
        if (barChip) barChip.textContent = `Peri Peri (${ORDER.spiceLevel})`;
        syncBuilders();
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
  function buildMessage(d) {
    const spice    = ORDER.spiceLevel ? ` (${ORDER.spiceLevel})` : '';
    const hasChicken = STEPS.some(s => ORDER[s.key]);
    const setKeys  = Object.keys(ORDER.setMeals);
    const extKeys  = Object.keys(ORDER.extras);
    const topKeys  = Object.keys(ORDER.toppings);

    let msg = `🍽️ New Order — Lovely Oven\n\n`;
    let grand = 0;

    const meals = allMeals(), burgers = allBurgers();
    if (hasChicken || meals.length) {
      meals.forEach((m, i) => {
        msg += `🍗 CHICKEN MEAL${meals.length > 1 ? ' ' + (i + 1) : ''}\n`;
        msg += `   Cut:      ${m.protein}\n`;
        msg += `   Marinade: ${m.flavour}${m.spice ? ` (${m.spice})` : ''}\n`;
        msg += `   Carb:     ${m.carb}\n`;
        msg += `   Side:     ${sideText(m.side)}\n`;
        msg += `   Subtotal: ₫${mealPriceOf(m).toLocaleString()}\n\n`;
        grand += mealPriceOf(m);
      });
      if (hasChicken && !STEPS.every(s => ORDER[s.key])) {
        msg += `🍗 CHICKEN MEAL (unfinished)\n`;
        msg += `   Cut:      ${ORDER.protein || '—'}\n`;
        msg += `   Marinade: ${ORDER.flavour ? ORDER.flavour + spice : '—'}\n`;
        msg += `   Carb:     ${ORDER.carb || '—'}\n`;
        msg += `   Side:     ${sideText(ORDER.side) || '—'}\n\n`;
      }
    }

    burgers.forEach((b, i) => {
      msg += `🍔 CHICKEN BURGER${burgers.length > 1 ? ' ' + (i + 1) : ''}\n`;
      msg += `   Flavour:  ${b.flavour}\n`;
      msg += `   Toppings: ${Object.keys(b.top).join(', ') || 'lettuce and tomato only'}\n`;
      msg += `   Sides:    ${b.sides.join(', ') || 'none'}\n`;
      msg += `   Subtotal: ₫${burgerPriceOf(b).toLocaleString()}\n\n`;
      grand += burgerPriceOf(b);
    });
    if (burgerStarted() && !burgerComplete()) {
      msg += `🍔 CHICKEN BURGER (unfinished)\n   Flavour:  —\n\n`;
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

    msg += `📅 Delivery: ${prettyDate(d.date)}, 11am to 2pm\n`;
    msg += `👤 Name:    ${d.name}\n`;
    msg += `📞 Phone:   ${d.phone}\n`;
    msg += `📍 Address: ${d.address}\n`;
    if (d.notes) msg += `📝 Notes:   ${d.notes}\n`;
    msg += `\n— Sent from lovelyoven.com`;
    return msg;
  }

  /* ── Itemised copy of the order for the staff dashboard ── */
  function buildItems() {
    const items = [];
    allMeals().forEach(m => {
      items.push({ g: 'chicken', value: 'chicken', label: 'Chicken meal', qty: 1, price: mealPriceOf(m), detail: mealDetailOf(m),
        opts: { protein: m.protein, flavour: m.flavour, spice: m.spice || '', carb: m.carb, side: m.side } });
    });
    allBurgers().forEach(b => {
      items.push({ g: 'burger', value: 'Chicken burger', label: 'Chicken burger', qty: 1, price: burgerPriceOf(b), detail: burgerDetailOf(b),
        opts: { flavour: b.flavour, side: b.sides.join(', '), sides: b.sides.slice(), toppings: Object.keys(b.top) } });
    });
    [['setmeal', ORDER.setMeals], ['topping', ORDER.toppings], ['extra', ORDER.extras]].forEach(([g, group]) => {
      Object.keys(group).forEach(k => {
        const it = group[k];
        items.push({ g, value: k, label: it.label, qty: it.qty, price: it.price, detail: it.detail || '', opts: { rice: it.rice || '', side: it.side || '' } });
      });
    });
    return items;
  }

  /* Reports a sent order to Google Analytics, if the visitor agreed to it */
  function track(method) {
    if (!window.gtag) return;
    const total = buildItems().reduce((n, i) => n + i.price * i.qty, 0);
    window.gtag('event', 'send_order', { method, value: total, currency: 'VND' });
  }

  let lastPosted = '';
  function postToDashboard(msg, d) {
    const items = buildItems();
    if (!items.length || msg === lastPosted) return;   // same order sent again (e.g. WhatsApp then Zalo): record it once
    lastPosted = msg;
    const total = items.reduce((n, i) => n + i.price * i.qty, 0);
    const send = body => fetch(ORDERS_URL, { method: 'POST', keepalive: true,
      headers: { apikey: ORDERS_KEY, Authorization: 'Bearer ' + ORDERS_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body) });
    // If the database does not have the delivery columns yet, fall back to the old shape with the details folded into notes.
    const legacy = { customer: d.name, items, total,
      notes: ['Deliver ' + d.date, d.phone, d.address, d.notes].filter(Boolean).join(' · ').slice(0, 300) };
    try {
      send({ customer: d.name, notes: d.notes, items, total, delivery_date: d.date, phone: d.phone, address: d.address })
        .then(r => { if (r.status === 400) return send(legacy); })
        .catch(() => {});
    } catch (e) { /* the WhatsApp/Zalo message is the order; this copy is a bonus */ }
  }

  /* ── Send actions ────────────────────────────────────── */
  window.loSendWhatsApp = function () {
    const d = prepareSend();
    if (!d) return;
    const msg = buildMessage(d);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    postToDashboard(msg, d);
    track('whatsapp');
    window.open(url, '_blank');
    showSent('whatsapp', d, () => window.open(url, '_blank'));
  };

  window.loSendZalo = function () {
    const d = prepareSend();
    if (!d) return;
    const msg = buildMessage(d);
    postToDashboard(msg, d);
    track('zalo');
    const open = () => window.open(`https://zalo.me/${ZALO_NUMBER}`, '_blank');
    const again = () => { navigator.clipboard.writeText(msg).catch(() => {}); open(); };

    navigator.clipboard.writeText(msg).catch(() => {
      window.prompt('Copy this message and paste it into Zalo:', msg);
    }).finally(() => {
      showSent('zalo', d, again);
      setTimeout(open, 400);
    });
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
      <label class="lo-label" for="loName">Your name</label>
      <input  type="text" id="loName" class="lo-input" autocomplete="name" maxlength="60" />
      <label class="lo-label" for="loPhone">Phone (WhatsApp or Zalo)</label>
      <input  type="tel" id="loPhone" class="lo-input" autocomplete="tel" inputmode="tel" maxlength="20" />
      <label class="lo-label" for="loDate">Delivery date</label>
      <input  type="date" id="loDate" class="lo-input" />
      <small class="lo-field-hint" id="loDateHint">Monday to Friday, delivered 11am to 2pm.</small>
      <label class="lo-label" for="loAddress">Delivery address</label>
      <textarea id="loAddress" class="lo-textarea" rows="2" maxlength="250" autocomplete="street-address"></textarea>
      <small class="lo-field-hint">Free delivery in the FPT Urban area. Elsewhere in Danang or Hoi An, please order on Grab.</small>
      <label class="lo-label" for="loNotes">Anything else <span>(optional)</span></label>
      <textarea id="loNotes" class="lo-textarea" rows="2" maxlength="300" placeholder="Allergies, special requests…"></textarea>
    </div>

    <p class="lo-err" id="loErr" role="alert" hidden></p>

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

    <div class="lo-confirm" id="loConfirm" hidden>
      <div class="lo-confirm-tick" aria-hidden="true">✓</div>
      <h3 class="lo-modal-title" id="loConfirmTitle"></h3>
      <p id="loConfirmText"></p>
      <div class="lo-confirm-card" id="loConfirmCard"></div>
      <button type="button" class="lo-send-btn lo-again" id="loConfirmAgain"></button>
      <button type="button" class="lo-confirm-done" onclick="loFinish()">Done, clear my order</button>
    </div>

  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', barHTML + modalHTML);

    const sync = el => el.setAttribute('aria-pressed', el.classList.contains('order-selected') ? 'true' : 'false');
    const watch = new MutationObserver(list => list.forEach(m => { if (m.target.matches('.o-chip[data-group]')) sync(m.target); }));
    document.querySelectorAll('.o-chip[data-group]').forEach(el => watch.observe(el, { attributes: true, attributeFilter: ['class'] }));

    // Order dialog: announced as a dialog, Escape closes it, focus moves in and returns
    const box = document.querySelector('#loModal .lo-modal');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'loTitle');
    box.querySelector('.lo-modal-title').id = 'loTitle';
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $id('loModal').classList.contains('lo-modal-open')) window.loCloseModal(); });

    const date = $id('loDate');
    date.min = earliestDate();
    date.max = addDays(vnNow().date, MAX_DAYS_AHEAD);
    date.addEventListener('input', updateDateHint);
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
      if (saved) { $id('loName').value = saved.name || ''; $id('loPhone').value = saved.phone || ''; $id('loAddress').value = saved.address || ''; }
    } catch (e) { /* private mode */ }
    document.querySelectorAll('#loModal .lo-input, #loModal .lo-textarea').forEach(el => el.addEventListener('input', () => el.classList.remove('lo-invalid')));
  }

  /* ── Kick off ────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
