/* ===== CORE: pure logic shared by Code.gs and the form. No Google or DOM calls in here. ===== */

var STATUS_ = { SCHEDULED: 'Scheduled', SERVED: 'Served', CANCELLED: 'Cancelled' };
var KEEP_DAYS_ = 120;

function fail_(msg) { throw new Error(msg); }
function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/* ---- dates are plain 'YYYY-MM-DD' strings so time zones can never shift a meal to another day ---- */
function fromISO_(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function toISO_(d) { return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate()); }
function isISO_(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO_(fromISO_(s)) === s; }
function addDays_(iso, n) { var d = fromISO_(iso); d.setUTCDate(d.getUTCDate() + n); return toISO_(d); }
function dow_(iso) { return fromISO_(iso).getUTCDay(); }
function isWeekend_(iso) { var d = dow_(iso); return d === 0 || d === 6; }
function mondayOf_(iso) { return addDays_(iso, -((dow_(iso) + 6) % 7)); }

/* the next n serving days, starting on `start` when it is a serving day */
function spreadDays_(start, n, weekends) {
  var out = [], d = start, guard = 0;
  while (out.length < n && guard++ < 400) {
    if (weekends || !isWeekend_(d)) out.push(d);
    d = addDays_(d, 1);
  }
  return out;
}

/* ---- names: old rows carry "(cash)" in the name, so strip it for grouping ---- */
function baseName_(raw) {
  return String(raw == null ? '' : raw).replace(/\s*\((?:cash|transfer|bank)\)\s*/ig, ' ').replace(/\s+/g, ' ').trim();
}
function methodFromName_(raw) {
  var m = /\((cash|transfer|bank)\)/i.exec(String(raw || ''));
  return m ? (m[1].toLowerCase() === 'cash' ? 'Cash' : 'Transfer') : '';
}

function money_(v, label) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  if (!isFinite(n) || n < 0) fail_('Check the ' + label + '.');
  return Math.round(n);
}

function payable_(o) { return (o.pfood || 0) + (o.pextra || 0) - (o.disc || 0); }
function cmpMeal_(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.row || 0) - (b.row || 0); }

function indexData_(data) {
  var live = {}, byOid = {}, byRow = {};
  data.meals.forEach(function (m) {
    if (m.status !== STATUS_.CANCELLED && m.oid) (live[m.oid] = live[m.oid] || []).push(m);
  });
  Object.keys(live).forEach(function (k) { live[k].sort(cmpMeal_); });
  data.orders.forEach(function (o) { if (o.oid) byOid[o.oid] = o; byRow[o.row] = o; });
  return { live: live, byOid: byOid, byRow: byRow };
}

/* meals paid for but not yet given a day */
function credit_(ix, o) {
  if (!o || !o.oid) return 0;
  return Math.max(0, o.qty - (ix.live[o.oid] || []).length);
}

/* ---- what the form sees ---- */
function buildState_(data) {
  var today = data.today, ix = indexData_(data);
  var cutoff = addDays_(today, -KEEP_DAYS_), mealCut = addDays_(today, -30), recentCut = addDays_(today, -21), priceCut = addDays_(today, -90);
  var cust = {}, priceCount = {}, orders = [];

  var sorted = data.orders.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row;
  });
  sorted.forEach(function (o) {
    var name = baseName_(o.name), key = name.toLowerCase();
    var c = cust[key] || (cust[key] = { name: name, orders: 0, recent: 0, last: '', unitPrice: 0, food: '', method: '', credit: 0, owed: 0, upcoming: 0, served: 0 });
    var pay = payable_(o), owed = Math.max(0, pay - (o.paid || 0)), credit = credit_(ix, o);
    var unit = o.pfood > 0 ? Math.round(o.pfood / o.qty) : 0;
    var method = o.method || methodFromName_(o.name);
    c.name = name; c.orders++; c.last = o.date;
    if (unit) c.unitPrice = unit;
    if (o.food) c.food = o.food;
    if (method) c.method = method;
    c.credit += credit; c.owed += owed;
    if (o.date >= recentCut) c.recent++;
    if (unit && o.date >= priceCut) priceCount[unit] = (priceCount[unit] || 0) + 1;
    if (o.date >= cutoff || owed > 0 || credit > 0) {
      orders.push({ row: o.row, date: o.date, name: name, qty: o.qty, food: o.food || '', notes: o.notes || '', payable: pay, paid: o.paid || 0, owed: owed, oid: o.oid || '', credit: credit, method: method });
    }
  });

  var meals = [];
  data.meals.forEach(function (m) {
    if (m.status === STATUS_.CANCELLED) return;
    var c = cust[baseName_(m.name).toLowerCase()];
    if (c) {
      if (m.status === STATUS_.SERVED) c.served++;
      else if (m.date >= today) c.upcoming++;
    }
    if (m.date >= mealCut || m.status === STATUS_.SCHEDULED) {
      var list = ix.live[m.oid] || [], o = ix.byOid[m.oid];
      meals.push({ id: m.id, date: m.date, name: baseName_(m.name), status: m.status, oid: m.oid || '', n: list.indexOf(m) + 1 || null, of: o ? o.qty : list.length, note: m.note || '' });
    }
  });

  var customers = Object.keys(cust).map(function (k) { return cust[k]; }).sort(function (a, b) {
    return a.last < b.last ? 1 : a.last > b.last ? -1 : a.name < b.name ? -1 : 1;
  });
  var byFreq = Object.keys(priceCount).map(Number).sort(function (a, b) { return priceCount[b] - priceCount[a] || a - b; });
  var prices = byFreq.slice(0, 4).sort(function (a, b) { return a - b; });
  return { today: today, orders: orders.reverse(), meals: meals, customers: customers, prices: prices, topPrice: byFreq[0] || 0 };
}

/* validates a list of {date,count}, merges repeats, returns it sorted */
function cleanSchedule_(list, minDate, maxMeals) {
  var by = {}, total = 0;
  (list || []).forEach(function (s) {
    var n = Number(s.count);
    if (!isISO_(s.date)) fail_('One of the meal days is not a valid date.');
    if (!isFinite(n) || Math.floor(n) !== n || n < 1) return;
    if (s.date < minDate) fail_('A meal is dated before the order.');
    by[s.date] = (by[s.date] || 0) + n; total += n;
  });
  if (total > maxMeals) fail_('You have scheduled ' + total + ' meals but only ' + maxMeals + (maxMeals === 1 ? ' is' : ' are') + ' available.');
  return Object.keys(by).sort().map(function (d) { return { date: d, count: by[d] }; });
}

function expandMeals_(sched, name, oid, note, nonce, startIdx) {
  var out = [], i = startIdx || 0;
  sched.forEach(function (s) {
    for (var k = 0; k < s.count; k++) {
      i++;
      out.push({ date: s.date, name: name, status: STATUS_.SCHEDULED, oid: oid, id: 'M' + nonce + '-' + i, note: note || '' });
    }
  });
  return out;
}

/* ---- every change is planned here first, then written to the sheet (or the preview) ---- */
function planSaveOrder_(p, data) {
  var name = baseName_(p.name);
  if (!name) fail_('Enter the customer name.');
  if (name.length > 60) fail_('That name is too long.');
  data.orders.some(function (o) {
    if (baseName_(o.name).toLowerCase() === name.toLowerCase()) { name = baseName_(o.name); return true; }
    return false;
  });
  var qty = Number(p.qty);
  if (!isFinite(qty) || Math.floor(qty) !== qty || qty < 1 || qty > 60) fail_('Meals must be a whole number from 1 to 60.');
  if (!isISO_(p.date)) fail_('Pick the order date.');
  var unit = money_(p.unitPrice, 'price per meal'), ep = money_(p.extraPrice, 'extra price');
  var disc = money_(p.discount, 'discount'), paid = money_(p.paid, 'amount paid');
  if (unit <= 0) fail_('Enter the price per meal.');
  var pfood = unit * qty, pay = pfood + ep - disc;
  if (pay < 0) fail_('The discount is bigger than the order.');
  if (paid > pay) fail_('The amount paid is more than the total.');
  var method = p.method === 'Cash' || p.method === 'Transfer' ? p.method : '';
  var sched = cleanSchedule_(p.schedule, p.date, qty);
  var oid = 'O' + data.nonce, food = String(p.food || '').trim().slice(0, 80), notes = String(p.notes || '').trim().slice(0, 200);
  var meals = expandMeals_(sched, name, oid, food, data.nonce, 0);
  return {
    order: { date: p.date, name: name, qty: qty, food: food, pfood: pfood, extra: String(p.extra || '').trim().slice(0, 80), pextra: ep, disc: disc, paid: paid, notes: notes, oid: oid, method: method },
    meals: meals,
    info: { oid: oid, name: name, qty: qty, scheduled: meals.length, credit: qty - meals.length, days: sched.map(function (s) { return s.date; }), payable: pay, owed: pay - paid }
  };
}

function planSchedule_(p, data) {
  var ix = indexData_(data), o = ix.byOid[p.oid];
  if (!o) fail_('Could not find that order. Refresh and try again.');
  var credit = credit_(ix, o), sched = cleanSchedule_(p.schedule, o.date, credit);
  if (!sched.length) fail_('Pick at least one day.');
  var meals = expandMeals_(sched, baseName_(o.name), o.oid, o.food, data.nonce, (ix.live[o.oid] || []).length + 100);
  return { meals: meals, info: { name: baseName_(o.name), scheduled: meals.length, credit: credit - meals.length } };
}

function findMeal_(data, id) {
  for (var i = 0; i < data.meals.length; i++) if (data.meals[i].id === id) return data.meals[i];
  return fail_('Could not find that meal. Refresh and try again.');
}

function planMealStatus_(p, data) {
  var m = findMeal_(data, p.id), to = p.status, from = m.status;
  var ok = (from === STATUS_.SCHEDULED && (to === STATUS_.SERVED || to === STATUS_.CANCELLED)) || (from === STATUS_.SERVED && to === STATUS_.SCHEDULED);
  if (!ok) fail_('That meal is already ' + from.toLowerCase() + '.');
  return { id: m.id, status: to, info: { name: baseName_(m.name), status: to } };
}

function planMove_(p, data) {
  var m = findMeal_(data, p.id), ix = indexData_(data), o = ix.byOid[m.oid];
  if (m.status !== STATUS_.SCHEDULED) fail_('Only a scheduled meal can be moved.');
  if (!isISO_(p.date)) fail_('Pick a valid day.');
  if (o && p.date < o.date) fail_('That is before the order was placed.');
  return { id: m.id, date: p.date, info: { name: baseName_(m.name), date: p.date } };
}

function planPayment_(p, data) {
  var ix = indexData_(data), o = ix.byRow[p.row];
  if (!o || baseName_(o.name) !== baseName_(p.name) || o.date !== p.date) fail_('That order has changed. Refresh and try again.');
  var amount = money_(p.amount, 'amount');
  if (amount <= 0) fail_('Enter the amount received.');
  var owed = Math.max(0, payable_(o) - (o.paid || 0));
  if (amount > owed) fail_('That is more than the ' + owed.toLocaleString('en-US') + ' still owed.');
  return { row: o.row, paid: (o.paid || 0) + amount, info: { name: baseName_(o.name), amount: amount, owed: owed - amount } };
}


/* ===== SHEET LAYER: reads and writes the spreadsheet, nothing else ===== */

var SPREADSHEET_ID = '1gGX_TTaDoZvPgKUhOhL4s6BRcyLk3b5JBRZLPEMUrCw';
var ORDERS_SHEET_ = 'Orders';
var MEALS_SHEET_ = 'Meals';
var ORDER_COLS_ = 13;   // A..M on Orders (K = Notes, L = Order ID, M = Payment method; K..M are added by the form)

/* The form lives on the website (orders.html) and talks to this script over POST.
   Set the passcode under Project Settings > Script properties as API_KEY.
   Deploy as: Execute as me, Who has access: Anyone. The passcode is the only lock. */
function doGet() {
  return ContentService.createTextOutput('Lovely Oven API');
}

var API_FUNCS_ = { getState: getState, saveOrder: saveOrder, scheduleMeals: scheduleMeals, setMealStatus: setMealStatus, moveMeal: moveMeal, recordPayment: recordPayment };

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ error: 'Bad request.' }); }
  var key = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!key || req.key !== key) { Utilities.sleep(1500); return json_({ error: 'Wrong passcode.', auth: true }); }
  var fn = Object.prototype.hasOwnProperty.call(API_FUNCS_, req.fn) ? API_FUNCS_[req.fn] : null;
  if (!fn) return json_({ error: 'Unknown action.' });
  try { return json_(fn(req.p)); } catch (x) { return json_({ error: String(x && x.message || x) }); }
}

/* ---- public API, called from the form with google.script.run ---- */
function getState() {
  return { state: buildState_(readData_()) };
}

function saveOrder(p) {
  return withLock_(function () {
    var d = readData_(); d.nonce = nonce_();
    var plan = planSaveOrder_(p, d);
    appendOrder_(plan.order);
    appendMeals_(plan.meals);
    return { state: buildState_(readData_()), info: plan.info };
  });
}

function scheduleMeals(p) {
  return withLock_(function () {
    var d = readData_(); d.nonce = nonce_();
    var plan = planSchedule_(p, d);
    appendMeals_(plan.meals);
    return { state: buildState_(readData_()), info: plan.info };
  });
}

function setMealStatus(p) {
  return withLock_(function () {
    var d = readData_();
    var plan = planMealStatus_(p, d);
    writeMealCell_(plan.id, 3, plan.status);
    return { state: buildState_(readData_()), info: plan.info };
  });
}

function moveMeal(p) {
  return withLock_(function () {
    var d = readData_();
    var plan = planMove_(p, d);
    writeMealCell_(plan.id, 1, dateObj_(plan.date));
    return { state: buildState_(readData_()), info: plan.info };
  });
}

function recordPayment(p) {
  return withLock_(function () {
    var d = readData_();
    var plan = planPayment_(p, d);
    var cell = book_().getSheetByName(ORDERS_SHEET_).getRange(plan.row, 10);
    cell.setValue(plan.paid);
    cell.setNumberFormat('#,##0');
    return { state: buildState_(readData_()), info: plan.info };
  });
}

/* ---- helpers ---- */
function book_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function nonce_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/* a date cell becomes noon on that day, so a small time zone mismatch can never move it to another day */
function dateObj_(iso) { var p = iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }

function isoOf_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
  if (m) { var iso = m[3] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[1]); return isISO_(iso) ? iso : ''; }
  return '';
}

/* adds the extra Orders columns (Notes, Order ID, Payment method) and the Meals sheet the first time the form runs */
function ensureSetup_(ss) {
  var os = ss.getSheetByName(ORDERS_SHEET_);
  if (!os) throw new Error('The spreadsheet needs a sheet called "' + ORDERS_SHEET_ + '".');
  var heads = os.getRange(1, 11, 1, 3).getValues()[0];
  if (heads[0] === 'Order ID') {
    // older layout without Notes: slot a Notes column in right after Total paid
    os.insertColumnAfter(10);
    heads = os.getRange(1, 11, 1, 3).getValues()[0];
  }
  if (!heads[0] || !heads[1] || !heads[2]) {
    if (!heads[0]) os.getRange(1, 11).setValue('Notes');
    if (!heads[1]) os.getRange(1, 12).setValue('Order ID');
    if (!heads[2]) os.getRange(1, 13).setValue('Payment method');
    os.getRange(1, 10).copyTo(os.getRange(1, 11, 1, 3), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  if (!ss.getSheetByName(MEALS_SHEET_)) {
    var ms = ss.insertSheet(MEALS_SHEET_);
    ms.getRange(1, 1, 1, 6).setValues([['Meal date', 'Customer', 'Status', 'Order ID', 'Meal ID', 'Food / note']]);
    os.getRange(1, 1).copyTo(ms.getRange(1, 1, 1, 6), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    ms.setFrozenRows(1);
    ms.getRange(2, 1, ms.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
    ms.getRange(2, 3, ms.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList([STATUS_.SCHEDULED, STATUS_.SERVED, STATUS_.CANCELLED], true).build());
    ms.setColumnWidth(1, 110); ms.setColumnWidth(2, 160); ms.setColumnWidth(4, 150); ms.setColumnWidth(5, 170); ms.setColumnWidth(6, 220);
  }
}

function readData_() {
  var ss = book_(), tz = ss.getSpreadsheetTimeZone();
  ensureSetup_(ss);
  var os = ss.getSheetByName(ORDERS_SHEET_), ms = ss.getSheetByName(MEALS_SHEET_);
  var orders = [], meals = [], i, r, iso;

  var ol = os.getLastRow();
  if (ol >= 2) {
    var ov = os.getRange(2, 1, ol - 1, ORDER_COLS_).getValues();
    for (i = 0; i < ov.length; i++) {
      r = ov[i]; iso = isoOf_(r[0], tz);
      if (!iso || !String(r[1]).trim()) continue;
      orders.push({
        row: i + 2, date: iso, name: String(r[1]).trim(),
        qty: Math.max(1, Math.round(num_(r[2])) || 1),
        food: String(r[3] || ''), pfood: num_(r[4]), extra: String(r[5] || ''), pextra: num_(r[6]), disc: num_(r[7]),
        paid: num_(r[9]), notes: String(r[10] || ''), oid: String(r[11] || ''), method: String(r[12] || '')
      });
    }
  }
  var ml = ms.getLastRow();
  if (ml >= 2) {
    var mv = ms.getRange(2, 1, ml - 1, 6).getValues();
    for (i = 0; i < mv.length; i++) {
      r = mv[i]; iso = isoOf_(r[0], tz);
      if (!iso || !r[4]) continue;
      meals.push({ row: i + 2, date: iso, name: String(r[1]), status: String(r[2] || STATUS_.SCHEDULED), oid: String(r[3] || ''), id: String(r[4]), note: String(r[5] || '') });
    }
  }
  return { orders: orders, meals: meals, today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') };
}

/* Orders column I (Total price payable) is a formula that fills itself, so it is never written here */
function appendOrder_(o) {
  var os = book_().getSheetByName(ORDERS_SHEET_);
  var colA = os.getRange(1, 1, os.getMaxRows(), 1).getValues(), last = 1, i;
  for (i = colA.length - 1; i >= 1; i--) { if (colA[i][0] !== '') { last = i + 1; break; } }
  var row = last + 1;
  if (row > os.getMaxRows()) os.insertRowsAfter(os.getMaxRows(), 50);
  os.getRange(row, 1, 1, 8).setValues([[dateObj_(o.date), o.name, o.qty, o.food, o.pfood, o.extra, o.pextra, o.disc]]);
  os.getRange(row, 10, 1, 4).setValues([[o.paid, o.notes || '', o.oid, o.method]]);
  os.getRange(row, 1).setNumberFormat('dd/mm/yyyy');
  os.getRange(row, 5).setNumberFormat('#,##0');
  os.getRange(row, 7, 1, 2).setNumberFormat('#,##0');
  os.getRange(row, 10).setNumberFormat('#,##0');
}

function appendMeals_(meals) {
  if (!meals.length) return;
  var ms = book_().getSheetByName(MEALS_SHEET_), first = ms.getLastRow() + 1;
  var rows = meals.map(function (m) { return [dateObj_(m.date), m.name, m.status, m.oid, m.id, m.note]; });
  if (first + rows.length - 1 > ms.getMaxRows()) ms.insertRowsAfter(ms.getMaxRows(), rows.length + 50);
  ms.getRange(first, 1, rows.length, 6).setValues(rows);
  ms.getRange(first, 1, rows.length, 1).setNumberFormat('dd/mm/yyyy');
}

function writeMealCell_(id, col, value) {
  var ms = book_().getSheetByName(MEALS_SHEET_), n = ms.getLastRow() - 1;
  if (n < 1) throw new Error('Could not find that meal. Refresh and try again.');
  var ids = ms.getRange(2, 5, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      var c = ms.getRange(i + 2, col);
      c.setValue(value);
      if (col === 1) c.setNumberFormat('dd/mm/yyyy');
      return;
    }
  }
  throw new Error('Could not find that meal. Refresh and try again.');
}
