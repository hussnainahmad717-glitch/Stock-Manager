/* Malik Super Wholesaler – stock, sales, purchases, parties, expenses.
   All data is saved in this browser's localStorage under KEY. */
(() => {
'use strict';
const KEY = 'malik_super_wholesaler_v1';
const blank = () => ({ items: [], parties: [], sales: [], purchases: [], expenses: [], payments: [], seq: { sale: 0, purchase: 0 } });
let db;
try { db = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { db = blank(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Could not save: browser storage is blocked or full'); } };

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const J = a => a.join('');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => parseFloat(v) || 0;
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const rs = n => 'Rs ' + Math.round(n || 0).toLocaleString('en-PK');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const icon = (n, c = '') => `<img class="ico ${c}" src="icons/${n}.svg" alt="">`;
const fmtDate = ts => new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const pname = (id, d) => (db.parties.find(p => p.id === id) || {}).name || d;
const short = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : Math.round(v);
let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }

/* ---------- date ranges ---------- */
const DAY = 864e5;
const day0 = d => { d = new Date(d); d.setHours(0, 0, 0, 0); return d.getTime(); };
function range(r) {
  const t = day0(Date.now());
  if (r === 'today') return [t, t + DAY];
  if (r === 'yesterday') return [t - DAY, t];
  if (r === 'week') return [t - 6 * DAY, t + DAY];
  if (r === 'month') { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), t + DAY]; }
  return [0, Infinity];
}
const inR = (ts, r) => { const [a, b] = range(r); return ts >= a && ts < b; };

/* ---------- state ---------- */
const S = { view: 'home', range: 'today', q: '', sf: 'all', pf: 'all', lr: { sales: 'month', purchases: 'month', expenses: 'month' }, series: { sales: 1, profit: 1, expenses: 1 } };

/* ---------- calculations ---------- */
function stats(r) {
  const s = db.sales.filter(x => inR(x.date, r)), e = db.expenses.filter(x => inR(x.date, r));
  const exp = sum(e, x => x.amount);
  return { sales: sum(s, x => x.total), profit: sum(s, x => x.profit) - exp, exp, purch: sum(db.purchases.filter(x => inR(x.date, r)), x => x.total) };
}
const due = p => sum((p.type === 'customer' ? db.sales : db.purchases).filter(x => x.party === p.id), x => x.total - x.paid) - sum(db.payments.filter(x => x.party === p.id), x => x.amount);

function buckets(r) {
  const [a, b] = range(r), hourly = r === 'today' || r === 'yesterday';
  const n = hourly ? 24 : Math.round((b - a) / DAY);
  const B = Array.from({ length: n }, (_, i) => ({ l: hourly ? i : new Date(a + i * DAY).getDate(), sales: 0, profit: 0, expenses: 0 }));
  const at = ts => hourly ? new Date(ts).getHours() : Math.round((day0(ts) - a) / DAY);
  db.sales.forEach(x => { const k = inR(x.date, r) && B[at(x.date)]; if (k) { k.sales += x.total; k.profit += x.profit; } });
  db.expenses.forEach(x => { const k = inR(x.date, r) && B[at(x.date)]; if (k) k.expenses += x.amount; });
  return B;
}
function chartSVG(B) {
  const W = 640, H = 230, L = 46, R = 12, T = 14, Bm = 30, keys = ['sales', 'profit', 'expenses'].filter(k => S.series[k]);
  const max = Math.max(1, ...keys.flatMap(k => B.map(x => x[k])));
  const X = i => L + (B.length > 1 ? i * (W - L - R) / (B.length - 1) : (W - L - R) / 2), Y = v => T + (H - T - Bm) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = Y(max * i / 4); g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${short(max * i / 4)}</text>`; }
  const step = Math.ceil(B.length / 8);
  B.forEach((b, i) => { if (i % step === 0) g += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle">${b.l}</text>`; });
  keys.forEach(k => {
    g += `<polyline class="ln ${k}" points="${B.map((b, i) => X(i) + ',' + Y(b[k])).join(' ')}"/>`;
    B.forEach((b, i) => { if (b[k]) g += `<circle class="pt ${k}" cx="${X(i)}" cy="${Y(b[k])}" r="4"><title>${b.l}: ${k} ${rs(b[k])}</title></circle>`; });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales trend chart">${g}</svg>`;
}

/* ---------- small UI pieces ---------- */
const head = t => `<div class="ph"><h1>${t}</h1></div>`;
const kpi = (l, v, tone) => `<div class="kpi ${tone}"><span>${l}</span><strong>${v}</strong></div>`;
const fab = () => `<button class="fab" data-act="add" aria-label="Add new">${icon('plus')}</button>`;
const empty = (ic, t, p, btn) => `<div class="empty"><div class="eb">${icon(ic)}</div><h3>${t}</h3><p>${p}</p>${btn ? `<button class="btn" data-act="add">${icon('plus')} ${btn}</button>` : ''}</div>`;
const search = ph => `<label class="search">${icon('search')}<input type="search" data-search placeholder="${ph}" value="${esc(S.q)}" aria-label="${ph}"></label>`;
const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['all', 'All time']];
const rangeSel = k => `<select class="sel" data-sel="${k}" aria-label="Date range">${J(RANGES.map(([v, l]) => `<option value="${v}" ${S.lr[k] === v ? 'selected' : ''}>${l}</option>`))}</select>`;
const chips = (key, list) => `<div class="chips">${J(list.map(([v, l]) => `<button class="chip ${S[key] === v ? 'on' : ''}" data-act="chip" data-k="${key}" data-v="${v}">${l}</button>`))}</div>`;
const delBtn = (act, id, v = '') => `<button class="icon-btn" data-act="${act}" data-id="${id}" data-v="${v}" aria-label="Delete">${icon('trash')}</button>`;

/* ---------- lists ---------- */
function docRow(x, k) {
  const d = x.total - x.paid, sale = k === 'sale';
  return `<article class="row"><div class="row-main"><strong>${sale ? 'Invoice' : 'Purchase'} #${x.no}: ${esc(pname(x.party, sale ? 'Walk-in customer' : 'Cash supplier'))}</strong><span class="muted">${fmtDate(x.date)}</span><span class="muted">${J(x.lines.map((l, i) => (i ? ', ' : '') + esc(l.name) + ' x' + l.qty))}</span></div>
  <div class="row-end"><strong>${rs(x.total)}</strong>${sale ? `<span class="pos">Profit ${rs(x.profit)}</span>` : ''}${d > 0 ? `<span class="neg">Due ${rs(d)}</span>` : ''}</div>${delBtn('del-doc', x.id, k)}</article>`;
}
const match = (x, q, def) => !q || ('#' + x.no).includes(q) || pname(x.party, def).toLowerCase().includes(q) || x.lines.some(l => l.name.toLowerCase().includes(q));
const LIST = {
  stock() {
    const q = S.q.toLowerCase();
    const L = db.items.filter(i => (!q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q)) && (S.sf === 'all' || (S.sf === 'out' ? i.qty <= 0 : i.qty <= i.low)));
    return L.length ? J(L.map(i => `<article class="row"><button class="row-main" data-act="edit-item" data-id="${i.id}"><strong>${esc(i.name)}</strong><span class="muted">${i.sku ? esc(i.sku) + ', ' : ''}Sell ${rs(i.sell)}, buy ${rs(i.buy)}</span></button>
      <div class="row-end"><strong>${i.qty}</strong><span class="${i.qty <= 0 ? 'neg' : i.qty <= i.low ? 'warn' : 'muted'}">${i.qty <= 0 ? 'Out of stock' : i.qty <= i.low ? 'Low stock' : 'In stock'}</span></div>${delBtn('del-item', i.id)}</article>`))
      : db.items.length ? empty('search', 'No matching items', 'Try a different search or filter.') : empty('stock', 'No items yet', 'Add your first product to track stock, sales and low-stock alerts.', 'Add your first item');
  },
  sales() {
    const q = S.q.toLowerCase(), L = db.sales.filter(x => inR(x.date, S.lr.sales) && match(x, q, 'walk-in customer'));
    return L.length ? J(L.map(x => docRow(x, 'sale'))) : empty('sales', 'No sales found', 'Nothing recorded for this period. Record a sale to see it here.', 'Record a sale');
  },
  purchases() {
    const q = S.q.toLowerCase(), L = db.purchases.filter(x => inR(x.date, S.lr.purchases) && match(x, q, 'cash supplier'));
    return L.length ? J(L.map(x => docRow(x, 'purchase'))) : empty('purchases', 'No purchases found', 'Record stock you buy from suppliers and quantities update automatically.', 'Record a purchase');
  },
  parties() {
    const q = S.q.toLowerCase(), L = db.parties.filter(p => (S.pf === 'all' || p.type === S.pf) && (!q || p.name.toLowerCase().includes(q) || (p.phone || '').includes(q)));
    return L.length ? J(L.map(p => { const d = due(p); return `<article class="row"><button class="row-main" data-act="edit-party" data-id="${p.id}"><strong>${esc(p.name)}</strong><span class="muted">${esc(p.phone || 'No phone number')}</span></button>
      <div class="row-end"><span class="tag ${p.type === 'supplier' ? 'sup' : ''}">${p.type === 'supplier' ? 'Supplier' : 'Customer'}</span><span class="${d > 0 ? 'neg' : 'muted'}">${d > 0 ? (p.type === 'customer' ? 'Owes ' : 'You owe ') + rs(d) : 'Settled'}</span></div>
      ${d > 0 ? `<button class="icon-btn" data-act="pay" data-id="${p.id}" aria-label="Record payment">${icon('cash')}</button>` : ''}${delBtn('del-party', p.id)}</article>`; }))
      : empty('parties', 'No parties yet', 'Keep your customers and suppliers in one place and track what they owe.', 'Add a party');
  },
  expenses() {
    const L = db.expenses.filter(x => inR(x.date, S.lr.expenses));
    return L.length ? J(L.map(x => `<article class="row"><div class="row-main"><strong>${esc(x.title)}</strong><span class="muted">${fmtDate(x.date)}</span></div><div class="row-end"><strong>${rs(x.amount)}</strong></div>${delBtn('del-exp', x.id)}</article>`))
      : empty('expenses', 'No expenses found', 'Record rent, salaries, fuel and other costs so profit stays accurate.', 'Add an expense');
  }
};

/* ---------- views ---------- */
const VIEWS = {
  home() {
    const s = stats(S.range), low = db.items.filter(i => i.qty <= i.low).length, lab = { today: 'Today, by hour', yesterday: 'Yesterday, by hour', week: 'Last 7 days', month: 'This month' }[S.range];
    const cols = { sales: '#0E7490', profit: '#0B8A5F', expenses: '#D97706' };
    return `${chips('range', [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Week'], ['month', 'Month']])}
    <div class="kpis">${kpi('Total sales', rs(s.sales), 'cyan')}${kpi('Profit after expenses', rs(s.profit), 'green')}${kpi('Purchases', rs(s.purch), 'navy')}${kpi('Expenses', rs(s.exp), 'amber')}</div>
    <section class="card"><div class="card-h"><h2>Sales trend</h2><span class="muted">${lab}</span></div><div class="chart">${chartSVG(buckets(S.range))}</div>
      <div class="legend">${J(['sales', 'profit', 'expenses'].map(k => `<button class="lg ${S.series[k] ? '' : 'off'}" style="--c:${cols[k]}" data-act="series" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`))}</div></section>
    <div class="tiles">
      <button class="tile" style="--t:#DDEFF4" data-act="new" data-v="sale">${icon('plus')}New sale</button>
      <button class="tile" style="--t:#E4ECF7" data-act="new" data-v="purchase">${icon('purchases')}Purchase</button>
      <button class="tile" style="--t:#EFE9FB" data-act="go" data-v="parties">${icon('parties')}Parties</button>
      <button class="tile" style="--t:#FDF0DC" data-act="go" data-v="expenses">${icon('expenses')}Expenses</button></div>
    ${low ? `<button class="banner" data-act="lowgo">${icon('alert')}<span>${low} item${low > 1 ? 's are' : ' is'} low or out of stock. Review stock.</span></button>` : ''}
    <section><div class="card-h"><h2>Recent sales</h2></div>${db.sales.length ? J(db.sales.slice(0, 5).map(x => docRow(x, 'sale'))) : '<p class="muted">No sales yet. Tap New sale to record your first one.</p>'}</section>`;
  },
  stock() {
    const low = db.items.filter(i => i.qty <= i.low).length;
    return head('Stock') + `<div class="kpis three">${kpi('Total items', db.items.length, 'navy')}${kpi('Stock value', rs(sum(db.items, i => i.qty * i.buy)), 'cyan')}${kpi('Low stock', low, 'amber')}</div>
    <div class="bar">${search('Search by name or SKU')}</div>${chips('sf', [['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock']])}<div id="list">${LIST.stock()}</div>${fab()}`;
  },
  sales() {
    const r = S.lr.sales, s = db.sales.filter(x => inR(x.date, r));
    return head('Sales') + `<div class="kpis two">${kpi('Sale value', rs(sum(s, x => x.total)), 'cyan')}${kpi('Gross profit', rs(sum(s, x => x.profit)), 'green')}</div>
    <div class="bar">${search('Search by customer, item or invoice')}${rangeSel('sales')}</div><div id="list">${LIST.sales()}</div>${fab()}`;
  },
  purchases() {
    const p = db.purchases.filter(x => inR(x.date, S.lr.purchases));
    return head('Purchases') + `<div class="kpis two">${kpi('Purchase value', rs(sum(p, x => x.total)), 'navy')}${kpi('Unpaid to suppliers', rs(sum(p, x => x.total - x.paid)), 'amber')}</div>
    <div class="bar">${search('Search by supplier, item or number')}${rangeSel('purchases')}</div><div id="list">${LIST.purchases()}</div>${fab()}`;
  },
  parties() {
    const rec = sum(db.parties.filter(p => p.type === 'customer'), p => Math.max(0, due(p))), pay = sum(db.parties.filter(p => p.type === 'supplier'), p => Math.max(0, due(p)));
    return head('Parties') + `<div class="kpis two">${kpi('To receive', rs(rec), 'green')}${kpi('To pay', rs(pay), 'amber')}</div>
    <div class="bar">${search('Search by name or phone')}</div>${chips('pf', [['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers']])}<div id="list">${LIST.parties()}</div>${fab()}`;
  },
  expenses() {
    return head('Expenses') + `<div class="kpis two">${kpi('Total expenses', rs(sum(db.expenses.filter(x => inR(x.date, S.lr.expenses)), x => x.amount)), 'amber')}</div>
    <div class="bar" style="justify-content:flex-end">${rangeSel('expenses')}</div><div id="list">${LIST.expenses()}</div>${fab()}`;
  }
};
function render() {
  $('#view').innerHTML = VIEWS[S.view]();
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
}
function go(v) { S.view = v; S.q = ''; render(); window.scrollTo(0, 0); }
function commit(msg) { save(); closeModal(); render(); if (msg) toast(msg); }

/* ---------- modal + forms ---------- */
function modal(title, body, onSave, label = 'Save') {
  const m = $('#modal');
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-h"><h2>${title}</h2><button class="icon-btn" data-act="close" aria-label="Close">${icon('close')}</button></div>
  <form>${body}${onSave ? `<div class="actions"><button type="button" class="btn ghost" data-act="close">Cancel</button><button class="btn">${label}</button></div>` : ''}</form></div>`;
  m.hidden = false;
  const f = $('form', m);
  f.onsubmit = e => { e.preventDefault(); if (onSave) onSave(f); };
  const first = $('input,select', f); if (first) first.focus();
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; delete m.dataset.kind; }
const fld = (label, name, val = '', extra = '') => `<label class="f"><span>${label}</span><input name="${name}" value="${esc(val)}" ${/type=/.test(extra) ? '' : 'type="text"'} ${extra}></label>`;
const numAttr = 'type="number" min="0" step="any" inputmode="decimal"';
const val = (f, n) => f.elements[n].value.trim();

function itemForm(id) {
  const it = db.items.find(x => x.id === id) || {};
  modal(id ? 'Edit item' : 'Add item',
    fld('Item name', 'name', it.name, 'required') + fld('SKU or barcode (optional)', 'sku', it.sku) +
    `<div class="row2">${fld('Buying price (Rs)', 'buy', it.buy, numAttr + ' required')}${fld('Selling price (Rs)', 'sell', it.sell, numAttr + ' required')}</div>
     <div class="row2">${fld('Quantity in stock', 'qty', it.qty ?? 0, numAttr + ' required')}${fld('Low-stock alert at', 'low', it.low ?? 5, numAttr)}</div>`,
    f => {
      const o = { name: val(f, 'name'), sku: val(f, 'sku'), buy: num(val(f, 'buy')), sell: num(val(f, 'sell')), qty: num(val(f, 'qty')), low: num(val(f, 'low')) };
      if (!o.name) return toast('Enter the item name');
      if (id) Object.assign(it, o); else db.items.unshift({ id: uid(), ...o });
      commit('Item saved');
    });
}
function partyForm(id) {
  const p = db.parties.find(x => x.id === id) || {};
  modal(id ? 'Edit party' : 'Add party',
    fld('Name', 'name', p.name, 'required') + fld('Phone number (optional)', 'phone', p.phone, 'type="tel"') +
    `<label class="f"><span>Type</span><select name="type"><option value="customer" ${(p.type || (S.pf !== 'supplier' ? 'customer' : '')) === 'customer' ? 'selected' : ''}>Customer</option><option value="supplier" ${(p.type || S.pf) === 'supplier' ? 'selected' : ''}>Supplier</option></select></label>`,
    f => {
      const o = { name: val(f, 'name'), phone: val(f, 'phone'), type: f.elements.type.value };
      if (!o.name) return toast('Enter the name');
      if (id) Object.assign(p, o); else db.parties.unshift({ id: uid(), ...o });
      commit('Party saved');
    });
}
function payForm(id) {
  const p = db.parties.find(x => x.id === id), cust = p.type === 'customer';
  modal(cust ? 'Payment received' : 'Payment made', `<p class="muted">${esc(p.name)} ${cust ? 'owes' : 'is owed'} ${rs(due(p))}</p>` + fld('Amount (Rs)', 'amt', due(p), numAttr + ' required'),
    f => { const a = num(val(f, 'amt')); if (a <= 0) return toast('Enter an amount'); db.payments.push({ id: uid(), party: id, amount: a, date: Date.now() }); commit('Payment recorded'); }, 'Save payment');
}
function expForm() {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  modal('Add expense', fld('What was it for?', 'title', '', 'required placeholder="Rent, salary, fuel..."') + fld('Amount (Rs)', 'amt', '', numAttr + ' required') + fld('Date', 'date', today, 'type="date"'),
    f => {
      const t = val(f, 'title'), a = num(val(f, 'amt')), d = val(f, 'date') || today;
      if (!t || a <= 0) return toast('Enter what it was for and the amount');
      db.expenses.unshift({ id: uid(), title: t, amount: a, date: d === today ? Date.now() : new Date(d + 'T12:00').getTime() });
      commit('Expense saved');
    });
}

/* sale / purchase form with item lines */
function docForm(kind) {
  const sale = kind === 'sale';
  if (!db.items.length) { toast('Add an item in Stock first'); return go('stock'); }
  const parties = db.parties.filter(p => p.type === (sale ? 'customer' : 'supplier'));
  modal(sale ? 'New sale' : 'New purchase',
    `<label class="f"><span>${sale ? 'Customer' : 'Supplier'}</span><select name="party"><option value="">${sale ? 'Walk-in customer' : 'Cash supplier'}</option>${J(parties.map(p => `<option value="${p.id}">${esc(p.name)}</option>`))}</select></label>
     <div class="lines-h"><span>Item</span><span>Qty</span><span>${sale ? 'Price' : 'Cost'}</span><span></span></div><div id="lines"></div>
     <button type="button" class="btn ghost sm" data-act="addline">${icon('plus')} Add another item</button>
     <div class="total"><span>Total</span><strong id="tot">Rs 0</strong></div>` + fld('Amount paid now (Rs)', 'paid', '', numAttr + ' placeholder="Leave empty if paid in full"'),
    f => {
      const rows = $$('.line', f).map(r => ({ id: $('.li-item', r).value, qty: num($('.li-qty', r).value), price: num($('.li-price', r).value) })).filter(r => r.qty > 0);
      if (!rows.length) return toast('Add at least one item with a quantity');
      const need = {}; rows.forEach(r => need[r.id] = (need[r.id] || 0) + r.qty);
      if (sale) for (const id in need) { const it = db.items.find(i => i.id === id); if (need[id] > it.qty) return toast(`Only ${it.qty} of ${it.name} in stock`); }
      const lines = rows.map(r => { const it = db.items.find(i => i.id === r.id); return { id: it.id, name: it.name, qty: r.qty, price: r.price, cost: it.buy }; });
      const total = sum(lines, l => l.qty * l.price), pv = val(f, 'paid');
      const rec = { id: uid(), no: ++db.seq[kind], date: Date.now(), party: f.elements.party.value, lines, total, paid: pv === '' ? total : Math.min(num(pv), total) };
      lines.forEach(l => { const it = db.items.find(i => i.id === l.id); if (sale) it.qty -= l.qty; else { it.qty += l.qty; it.buy = l.price; } });
      if (sale) { rec.profit = sum(lines, l => (l.price - l.cost) * l.qty); db.sales.unshift(rec); } else db.purchases.unshift(rec);
      commit(sale ? 'Sale saved' : 'Purchase saved');
    }, sale ? 'Save sale' : 'Save purchase');
  $('#modal').dataset.kind = kind;
  addLine();
}
function addLine() {
  const sale = $('#modal').dataset.kind === 'sale', d = document.createElement('div');
  d.className = 'line';
  d.innerHTML = `<select class="li-item" aria-label="Item">${J(db.items.map(i => `<option value="${i.id}">${esc(i.name)}${sale ? ` (${i.qty} left)` : ''}</option>`))}</select><input class="li-qty" type="number" min="0" step="any" value="1" aria-label="Quantity"><input class="li-price" type="number" min="0" step="any" aria-label="Price"><button type="button" class="icon-btn" data-act="rmline" aria-label="Remove item">${icon('trash')}</button>`;
  $('#lines').appendChild(d); setPrice(d);
}
function setPrice(d) {
  const it = db.items.find(i => i.id === $('.li-item', d).value), sale = $('#modal').dataset.kind === 'sale';
  $('.li-price', d).value = it ? (sale ? it.sell : it.buy) : 0; calcTotal();
}
const calcTotal = () => { const t = $('#tot'); if (t) t.textContent = rs(sum($$('.line'), r => num($('.li-qty', r).value) * num($('.li-price', r).value))); };

/* ---------- settings / backup ---------- */
function settings() {
  modal('Backup and settings', `<div class="stack"><p class="muted">Your data is stored only in this browser. Download a backup regularly so you never lose it.</p>
    <button type="button" class="btn ghost" data-act="export">${icon('download')} Download backup file</button>
    <button type="button" class="btn danger" data-act="wipe">${icon('trash')} Delete all data</button></div>`, null);
}

/* ---------- actions ---------- */
const A = {
  go: v => go(v), close: closeModal, settings,
  chip(v, id, b) { S[b.dataset.k] = v; render(); },
  series(v) { S.series[v] = S.series[v] ? 0 : 1; render(); },
  new: v => docForm(v),
  lowgo() { S.sf = 'low'; go('stock'); },
  add() { ({ stock: () => itemForm(), sales: () => docForm('sale'), purchases: () => docForm('purchase'), parties: () => partyForm(), expenses: expForm })[S.view](); },
  'edit-item': (v, id) => itemForm(id), 'edit-party': (v, id) => partyForm(id), pay: (v, id) => payForm(id),
  addline: addLine, rmline: (v, id, b) => { if ($$('.line').length > 1) { b.closest('.line').remove(); calcTotal(); } },
  'del-item'(v, id) { if (confirm('Delete this item? Past sales keep their records.')) { db.items = db.items.filter(x => x.id !== id); commit('Item deleted'); } },
  'del-party'(v, id) { if (confirm('Delete this party? Past records stay in your sales and purchases.')) { db.parties = db.parties.filter(x => x.id !== id); db.payments = db.payments.filter(x => x.party !== id); commit('Party deleted'); } },
  'del-exp'(v, id) { if (confirm('Delete this expense?')) { db.expenses = db.expenses.filter(x => x.id !== id); commit('Expense deleted'); } },
  'del-doc'(k, id) {
    if (!confirm(`Delete this ${k}? Stock quantities will be adjusted back.`)) return;
    const list = k === 'sale' ? db.sales : db.purchases, x = list.find(r => r.id === id);
    x.lines.forEach(l => { const it = db.items.find(i => i.id === l.id); if (it) it.qty = Math.max(0, it.qty + (k === 'sale' ? l.qty : -l.qty)); });
    db[k === 'sale' ? 'sales' : 'purchases'] = list.filter(r => r.id !== id); commit(k === 'sale' ? 'Sale deleted' : 'Purchase deleted');
  },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
    a.download = 'malik-wholesaler-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  },
  wipe() { if (confirm('Delete ALL items, sales, purchases, parties and expenses from this browser? This cannot be undone.')) { db = blank(); commit('All data deleted'); } }
};
document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const b = e.target.closest('[data-act]'); if (!b || !A[b.dataset.act]) return;
  A[b.dataset.act](b.dataset.v, b.dataset.id, b);
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-search]')) { S.q = t.value; $('#list').innerHTML = LIST[S.view](); }
  else if (t.matches('.li-qty,.li-price')) calcTotal();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('.li-item')) setPrice(t.closest('.line'));
  else if (t.matches('[data-sel]')) { S.lr[t.dataset.sel] = t.value; render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

render();
})();
