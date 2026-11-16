'use strict';

/* ---------- Dane ---------- */

const KEY = 'lisiapraca.v1';
const $app = document.getElementById('app');

let db = load();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.shifts)) {
      return { shifts: d.shifts, rides: d.rides || [], fuels: d.fuels || [] };
    }
  } catch (e) { /* brak lub uszkodzone dane */ }
  return { shifts: [], rides: [], fuels: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    alert('Nie udało się zapisać danych: ' + e.message);
  }
}

// Poproś przeglądarkę, żeby nie czyściła danych przy braku miejsca.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- Pomocnicze ---------- */

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nowIso = () => new Date().toISOString();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Akceptuje "42,50", "42.50", "1 200,5". Zwraca null dla pustego, NaN dla błędnego.
function parseNum(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN;
  return Number(s);
}

const fmtMoney = (n) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const fmtInputNum = (n) => (n == null ? '' : String(n).replace('.', ','));
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDur = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
};
// Polska odmiana: 1 kurs, 2 kursy, 5 kursów.
function plural(n, one, few, many) {
  const w = n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
  return n + ' ' + w;
}
const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const csvDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- Zapytania ---------- */

const activeShift = () => db.shifts.find((s) => !s.end) || null;
const activeRide = () => db.rides.find((r) => r.depart && !r.arrive) || null;
const byTime = (a, b) => (a || '').localeCompare(b || '');
const ridesOf = (id) => db.rides.filter((r) => r.shiftId === id).sort((a, b) => byTime(a.depart, b.depart));
const fuelsOf = (id) => db.fuels.filter((f) => f.shiftId === id).sort((a, b) => byTime(a.at, b.at));
const shiftsDesc = () => [...db.shifts].sort((a, b) => byTime(b.start, a.start));

function stats(shift) {
  const rides = ridesOf(shift.id);
  const fuels = fuelsOf(shift.id);
  const revenue = rides.reduce((s, r) => s + (r.amount || 0), 0);
  const fuel = fuels.reduce((s, f) => s + (f.amount || 0), 0);
  const ms = new Date(shift.end || Date.now()) - new Date(shift.start);
  const hours = ms / 3600000;
  return { rides, fuels, revenue, fuel, net: revenue - fuel, ms, perHour: hours >= 0.25 ? revenue / hours : null };
}

// Ostatnio używane miejsca do podpowiedzi przy wpisywaniu.
function recentPlaces() {
  const seen = new Set();
  const out = [];
  [...db.rides].sort((a, b) => byTime(b.depart, a.depart)).forEach((r) => {
    [r.from, r.to].forEach((p) => {
      const k = (p || '').trim();
      if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); }
    });
  });
  return out.slice(0, 40);
}

/* ---------- Nawigacja ---------- */

function go(hash) {
  const i = (history.state && history.state.i) || 0;
  history.pushState({ i: i + 1 }, '', hash);
  route();
}

// Powrót po zapisaniu: cofnij, jeśli przyszliśmy z aplikacji, inaczej przejdź na start.
function done(target = '#/') {
  if (history.state && history.state.i > 0) history.back();
  else { history.replaceState({ i: 0 }, '', target); route(); }
}

window.addEventListener('popstate', route);

function route() {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let html;
  switch (page) {
    case 'kurs': html = id ? viewRideEdit(id) : viewRideNew(); break;
    case 'tankowanie': html = viewFuel(id); break;
    case 'historia': html = viewHistory(); break;
    case 'zmiana': html = viewShift(id); break;
    default: html = viewHome();
  }
  if (html == null) { history.replaceState({ i: 0 }, '', '#/'); html = viewHome(); }
  $app.innerHTML = html;
  window.scrollTo(0, 0);
  const f = $app.querySelector('[data-autofocus]');
  if (f) f.focus();
}

/* ---------- Widoki ---------- */

function header(title, { back = false, right = '' } = {}) {
  return `<header>
    ${back ? '<button class="nav" data-act="back" aria-label="Wróć">‹ Wróć</button>' : '<span></span>'}
    <h1>${esc(title)}</h1>
    ${right || '<span></span>'}
  </header>`;
}

function statsGrid(st) {
  return `<div class="stats">
    <div class="stat"><div class="k">Kursy</div><div class="v">${st.rides.length}</div></div>
    <div class="stat"><div class="k">Zarobek</div><div class="v">${fmtMoney(st.revenue)}</div></div>
    <div class="stat"><div class="k">Paliwo</div><div class="v">${fmtMoney(st.fuel)}</div></div>
    <div class="stat"><div class="k">Na czysto</div><div class="v ${st.net < 0 ? 'neg' : ''}">${fmtMoney(st.net)}</div></div>
    <div class="stat wide"><div class="k">Czas w aplikacji · zarobek na godzinę</div>
      <div class="v"><span data-dur="${st.ms}">${fmtDur(st.ms)}</span>${st.perHour != null ? ' · ' + fmtMoney(st.perHour) + '/h' : ''}</div></div>
  </div>`;
}

function timeline(st) {
  const items = [
    ...st.rides.map((r) => ({ t: r.depart, html: rideItem(r) })),
    ...st.fuels.map((f) => ({ t: f.at, html: fuelItem(f) })),
  ].sort((a, b) => byTime(b.t, a.t));
  if (!items.length) return '<p class="muted">Brak kursów i tankowań.</p>';
  return `<div class="list">${items.map((i) => i.html).join('')}</div>`;
}

function rideItem(r) {
  const open = !r.arrive;
  return `<button class="item ${open ? 'open' : ''}" data-go="#/kurs/${r.id}">
    <span class="t">${esc(r.from || '?')} → ${esc(r.to || '?')}</span>
    <span class="a">${r.amount != null ? fmtMoney(r.amount) : '—'}</span>
    <span class="s">${fmtTime(r.depart)}–${open ? 'w trasie' : fmtTime(r.arrive)}</span>
  </button>`;
}

function fuelItem(f) {
  const perL = f.liters ? ' · ' + fmtMoney(f.amount / f.liters) + '/l' : '';
  return `<button class="item fuel" data-go="#/tankowanie/${f.id}">
    <span class="t">${esc(f.type)}${f.liters ? ' · ' + fmtInputNum(f.liters) + ' l' : ''}</span>
    <span class="a">${fmtMoney(f.amount)}</span>
    <span class="s">${fmtTime(f.at)}${perL}</span>
  </button>`;
}

function shiftCard(s) {
  const st = stats(s);
  return `<button class="item" data-go="#/zmiana/${s.id}">
    <span class="t">${fmtDay(s.start)}, ${fmtTime(s.start)}–${s.end ? fmtTime(s.end) : 'trwa'}</span>
    <span class="a">${fmtMoney(st.net)}</span>
    <span class="s">${fmtDur(st.ms)} · ${plural(st.rides.length, 'kurs', 'kursy', 'kursów')} ·${fmtMoney(st.revenue)} − paliwo ${fmtMoney(st.fuel)}</span>
  </button>`;
}

const historyBtn = '<button class="nav" data-go="#/historia">Historia</button>';

function viewHome() {
  const s = activeShift();
  if (!s) {
    const last = shiftsDesc()[0];
    return header('Lisia Praca', { right: historyBtn }) + `<main>
      <button class="big go" data-act="startShift">Włączam aplikację</button>
      <p class="hint center">Naciśnij, gdy włączasz aplikację Ubera. Zapiszę godzinę startu zmiany.</p>
      <div class="row2"><button class="btn secondary" data-go="#/tankowanie">+ Tankowanie</button>
        <button class="btn secondary" data-go="#/historia">Historia</button></div>
      ${last ? '<h2>Ostatnia zmiana</h2>' + statsGrid(stats(last)) + '<div style="margin-top:10px">' + shiftCard(last) + '</div>' : ''}
    </main>`;
  }

  const st = stats(s);
  const r = activeRide();
  const rideBlock = r
    ? `<section class="card ride-live">
        <div class="label">W trasie od ${fmtTime(r.depart)}</div>
        <div class="route">${esc(r.from || '?')} → ${esc(r.to || '?')}</div>
        <form class="arrive" data-form="arrive" novalidate>
          <label>Kwota (zł)<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(fmtInputNum(r.amount))}"></label>
          <button class="btn go">Dotarłem</button>
        </form>
        <button class="edit-link" data-go="#/kurs/${r.id}">Popraw kurs</button>
      </section>
      <div class="row2"><span></span><button class="btn secondary" data-go="#/tankowanie">+ Tankowanie</button></div>`
    : `<div class="row2">
        <button class="btn primary" data-go="#/kurs">+ Kurs</button>
        <button class="btn secondary" data-go="#/tankowanie">+ Tankowanie</button>
      </div>`;

  return header('Moja zmiana', { right: historyBtn }) + `<main>
    <button class="big stop" data-act="endShift">Wyłączam aplikację</button>
    <p class="since">Aplikacja włączona od <strong>${fmtTime(s.start)}</strong></p>
    ${rideBlock}
    ${statsGrid(st)}
    <h2>Na tej zmianie</h2>
    ${timeline(st)}
  </main>`;
}

function placesList() {
  return `<datalist id="places">${recentPlaces().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;
}

function viewRideNew() {
  if (!activeShift()) return null;
  const r = activeRide();
  if (r) return viewRideEdit(r.id);
  return header('Nowy kurs', { back: true }) + `<main>
    <form class="stack" data-form="rideNew" novalidate>
      <label>Skąd<input name="from" list="places" autocomplete="off" enterkeyhint="next" data-autofocus></label>
      <label>Dokąd<input name="to" list="places" autocomplete="off" enterkeyhint="next"></label>
      <label>Kwota (zł) <span class="opt">można wpisać też po dojeździe</span>
        <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" enterkeyhint="go"></label>
      <button class="big go">Ruszam</button>
    </form>
    ${placesList()}
  </main>`;
}

function viewRideEdit(id) {
  const r = db.rides.find((x) => x.id === id);
  if (!r) return null;
  return header('Kurs', { back: true }) + `<main>
    <form class="stack" data-form="rideEdit" data-id="${r.id}" novalidate>
      <label>Skąd<input name="from" list="places" autocomplete="off" value="${esc(r.from)}"></label>
      <label>Dokąd<input name="to" list="places" autocomplete="off" value="${esc(r.to)}"></label>
      <label>Kwota (zł)<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(fmtInputNum(r.amount))}"></label>
      <label>Wyjazd<input type="datetime-local" name="depart" value="${toLocalInput(r.depart)}"></label>
      <label>Dojazd <span class="opt">puste = jeszcze w trasie</span><input type="datetime-local" name="arrive" value="${toLocalInput(r.arrive)}"></label>
      <button class="btn accent">Zapisz</button>
      <button type="button" class="btn danger" data-act="deleteRide" data-id="${r.id}">Usuń kurs</button>
    </form>
    ${placesList()}
  </main>`;
}

function viewFuel(id) {
  const f = id ? db.fuels.find((x) => x.id === id) : null;
  if (id && !f) return null;
  const type = f ? f.type : 'LPG';
  const opt = (v) => `<label><input type="radio" name="type" value="${v}" ${type === v ? 'checked' : ''}><span>${v}</span></label>`;
  return header(f ? 'Tankowanie' : 'Nowe tankowanie', { back: true }) + `<main>
    <form class="stack" data-form="fuel" data-id="${f ? f.id : ''}" novalidate>
      <fieldset class="seg"><legend>Paliwo</legend>${opt('LPG')}${opt('Benzyna')}</fieldset>
      <label>Kwota (zł)<input name="amount" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(fmtInputNum(f && f.amount))}" ${f ? '' : 'data-autofocus'}></label>
      <label>Litry <span class="opt">opcjonalnie</span><input name="liters" inputmode="decimal" autocomplete="off" placeholder="0,0" value="${esc(fmtInputNum(f && f.liters))}"></label>
      ${f ? `<label>Kiedy<input type="datetime-local" name="at" value="${toLocalInput(f.at)}"></label>` : ''}
      <button class="big go">Zapisz</button>
      ${f ? `<button type="button" class="btn danger" data-act="deleteFuel" data-id="${f.id}">Usuń tankowanie</button>` : ''}
    </form>
  </main>`;
}

function viewShift(id) {
  const s = db.shifts.find((x) => x.id === id);
  if (!s) return null;
  const st = stats(s);
  return header(fmtDay(s.start), { back: true }) + `<main>
    ${statsGrid(st)}
    <h2>Kursy i tankowania</h2>
    ${timeline(st)}
    <h2>Godziny zmiany</h2>
    <form class="stack" data-form="shift" data-id="${s.id}" novalidate>
      <label>Włączenie aplikacji<input type="datetime-local" name="start" value="${toLocalInput(s.start)}"></label>
      <label>Wyłączenie aplikacji <span class="opt">puste = zmiana trwa</span><input type="datetime-local" name="end" value="${toLocalInput(s.end)}"></label>
      <button class="btn accent">Zapisz godziny</button>
      <button type="button" class="btn danger" data-act="deleteShift" data-id="${s.id}">Usuń zmianę z kursami i tankowaniami</button>
    </form>
  </main>`;
}

function viewHistory() {
  const shifts = shiftsDesc();
  const now = new Date();
  const monthShifts = shifts.filter((s) => {
    const d = new Date(s.start);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const month = monthShifts.reduce((acc, s) => {
    const st = stats(s);
    acc.rides.push(...st.rides); acc.revenue += st.revenue; acc.fuel += st.fuel; acc.ms += st.ms;
    return acc;
  }, { rides: [], fuels: [], revenue: 0, fuel: 0, ms: 0 });
  month.net = month.revenue - month.fuel;
  month.perHour = month.ms >= 900000 ? month.revenue / (month.ms / 3600000) : null;
  const loose = db.fuels.filter((f) => !f.shiftId).sort((a, b) => byTime(b.at, a.at));
  const monthName = now.toLocaleDateString('pl-PL', { month: 'long' });

  return header('Historia', { back: true }) + `<main>
    <h2>${esc(monthName)} · ${plural(monthShifts.length, 'zmiana', 'zmiany', 'zmian')}</h2>
    ${statsGrid(month)}
    <h2>Zmiany</h2>
    ${shifts.length ? `<div class="list">${shifts.map(shiftCard).join('')}</div>` : '<p class="muted">Jeszcze nie ma żadnej zmiany.</p>'}
    ${loose.length ? `<h2>Tankowania poza zmianą</h2><div class="list">${loose.map(fuelItem).join('')}</div>` : ''}
    <h2>Dane</h2>
    <div class="tools">
      <button class="btn secondary" data-act="exportCsv">Eksportuj do Excela (CSV)</button>
      <button class="btn secondary" data-act="exportJson">Zrób kopię zapasową</button>
      <label class="btn secondary file-btn center" style="justify-content:center">Przywróć z kopii
        <input type="file" accept="application/json,.json" data-act="importJson"></label>
    </div>
    <p class="hint">Dane są zapisane tylko na tym telefonie. Rób kopię zapasową co jakiś czas, np. raz w tygodniu.</p>
  </main>`;
}

/* ---------- Akcje ---------- */

const actions = {
  back: () => done(),

  startShift() {
    if (activeShift()) return route();
    db.shifts.push({ id: uid(), start: nowIso(), end: null });
    save();
    route();
  },

  endShift() {
    const s = activeShift();
    if (!s) return route();
    const r = activeRide();
    const msg = r
      ? 'Masz kurs w trasie. Zakończyć go teraz i wyłączyć aplikację?'
      : 'Wyłączasz aplikację i kończysz zmianę?';
    if (!confirm(msg)) return;
    const t = nowIso();
    if (r) r.arrive = t;
    s.end = t;
    save();
    route();
  },

  deleteRide(el) {
    if (!confirm('Usunąć ten kurs?')) return;
    db.rides = db.rides.filter((r) => r.id !== el.dataset.id);
    save();
    done();
  },

  deleteFuel(el) {
    if (!confirm('Usunąć to tankowanie?')) return;
    db.fuels = db.fuels.filter((f) => f.id !== el.dataset.id);
    save();
    done();
  },

  deleteShift(el) {
    const id = el.dataset.id;
    if (!confirm('Usunąć całą zmianę razem z jej kursami i tankowaniami? Tego nie da się cofnąć.')) return;
    db.shifts = db.shifts.filter((s) => s.id !== id);
    db.rides = db.rides.filter((r) => r.shiftId !== id);
    db.fuels = db.fuels.filter((f) => f.shiftId !== id);
    save();
    done();
  },

  exportCsv() {
    const num = (n) => (n == null ? '' : n.toFixed(2).replace('.', ','));
    const cell = (v) => {
      const s = String(v ?? '');
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['Typ', 'Zmiana', 'Początek', 'Koniec', 'Czas (h)', 'Skąd', 'Dokąd', 'Kwota (zł)', 'Paliwo', 'Litry']];
    [...db.shifts].sort((a, b) => byTime(a.start, b.start)).forEach((s) => {
      const st = stats(s);
      const day = csvDate(s.start).slice(0, 10);
      rows.push(['Zmiana', day, csvDate(s.start), csvDate(s.end), s.end ? num(st.ms / 3600000) : '', '', '', '', '', '']);
      st.rides.forEach((r) => rows.push(['Kurs', day, csvDate(r.depart), csvDate(r.arrive), '', r.from, r.to, num(r.amount), '', '']));
      st.fuels.forEach((f) => rows.push(['Tankowanie', day, csvDate(f.at), '', '', '', '', num(f.amount), f.type, num(f.liters)]));
    });
    db.fuels.filter((f) => !f.shiftId).forEach((f) =>
      rows.push(['Tankowanie', '', csvDate(f.at), '', '', '', '', num(f.amount), f.type, num(f.liters)]));
    const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
    shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `lisia-praca-${csvDate(nowIso()).slice(0, 10)}.csv`);
  },

  exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'LisiaPraca', version: 1, exported: nowIso(), ...db }, null, 1)], { type: 'application/json' });
    shareOrDownload(blob, `lisia-praca-kopia-${csvDate(nowIso()).slice(0, 10)}.json`);
  },
};

async function shareOrDownload(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- Formularze ---------- */

// Odczytuje pole liczbowe; zaznacza błąd i zwraca undefined, gdy wpis jest niepoprawny.
function numField(form, name, { required = false } = {}) {
  const input = form.elements[name];
  const v = parseNum(input.value);
  const bad = Number.isNaN(v) || (required && v == null) || (v != null && v < 0);
  input.classList.toggle('bad', bad);
  if (bad) { input.focus(); toast(required && v == null ? 'Wpisz kwotę.' : 'Niepoprawna liczba. Użyj np. 42,50'); return undefined; }
  return v;
}

const forms = {
  rideNew(f) {
    const shift = activeShift();
    if (!shift) return done();
    const amount = numField(f, 'amount');
    if (amount === undefined) return;
    db.rides.push({
      id: uid(), shiftId: shift.id,
      from: f.elements.from.value.trim(), to: f.elements.to.value.trim(),
      amount, depart: nowIso(), arrive: null,
    });
    save();
    done();
  },

  arrive(f) {
    const r = activeRide();
    if (!r) return route();
    const amount = numField(f, 'amount');
    if (amount === undefined) return;
    if (amount != null) r.amount = amount;
    r.arrive = nowIso();
    save();
    toast('Kurs zapisany');
    route();
  },

  rideEdit(f) {
    const r = db.rides.find((x) => x.id === f.dataset.id);
    if (!r) return done();
    const amount = numField(f, 'amount');
    if (amount === undefined) return;
    const depart = fromLocalInput(f.elements.depart.value) || r.depart;
    const arrive = fromLocalInput(f.elements.arrive.value);
    if (arrive && arrive < depart) { toast('Dojazd nie może być przed wyjazdem.'); return; }
    if (!arrive && db.rides.some((x) => x !== r && !x.arrive)) { toast('Inny kurs jest już w trasie.'); return; }
    Object.assign(r, { from: f.elements.from.value.trim(), to: f.elements.to.value.trim(), amount, depart, arrive });
    save();
    done();
  },

  fuel(f) {
    const amount = numField(f, 'amount', { required: true });
    if (amount === undefined) return;
    const liters = numField(f, 'liters');
    if (liters === undefined) return;
    const type = f.elements.type.value || 'LPG';
    const existing = f.dataset.id && db.fuels.find((x) => x.id === f.dataset.id);
    if (existing) {
      Object.assign(existing, { type, amount, liters, at: fromLocalInput(f.elements.at.value) || existing.at });
    } else {
      const s = activeShift();
      db.fuels.push({ id: uid(), shiftId: s ? s.id : null, type, amount, liters, at: nowIso() });
    }
    save();
    toast('Tankowanie zapisane');
    done();
  },

  shift(f) {
    const s = db.shifts.find((x) => x.id === f.dataset.id);
    if (!s) return done();
    const start = fromLocalInput(f.elements.start.value);
    const end = fromLocalInput(f.elements.end.value);
    if (!start) { toast('Podaj godzinę włączenia.'); return; }
    if (end && end < start) { toast('Wyłączenie nie może być przed włączeniem.'); return; }
    if (!end && db.shifts.some((x) => x !== s && !x.end)) { toast('Inna zmiana już trwa.'); return; }
    Object.assign(s, { start, end });
    save();
    toast('Zapisano');
    route();
  },
};

/* ---------- Zdarzenia ---------- */

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  if (el.dataset.go) { go(el.dataset.go); return; }
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const fn = forms[e.target.dataset.form];
  if (fn) fn(e.target);
});

$app.addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'importJson' || !e.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.shifts) || !Array.isArray(d.rides) || !Array.isArray(d.fuels)) throw new Error('To nie jest kopia Lisiej Pracy.');
      const msg = `Kopia zawiera ${d.shifts.length} zmian, ${d.rides.length} kursów i ${d.fuels.length} tankowań. Zastąpić nią obecne dane?`;
      if (!confirm(msg)) return;
      db = { shifts: d.shifts, rides: d.rides, fuels: d.fuels };
      save();
      toast('Przywrócono kopię');
      route();
    } catch (err) {
      alert('Nie udało się wczytać kopii: ' + err.message);
    }
  };
  reader.readAsText(e.target.files[0]);
  e.target.value = '';
});

// Odświeżaj czas trwania zmiany co 30 s, gdy nikt nic nie wpisuje.
setInterval(() => {
  const s = activeShift();
  const editing = document.activeElement && document.activeElement.tagName === 'INPUT';
  if (s && !editing && (location.hash === '' || location.hash === '#/')) route();
}, 30000);

/* ---------- Start ---------- */

history.replaceState({ i: 0 }, '', location.hash || '#/');
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
