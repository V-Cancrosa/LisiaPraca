'use strict';

/* =========================================================
   Dane
   ========================================================= */

const KEY = 'lisiapraca.v1';
const $app = document.getElementById('app');

const DEFAULTS = {
  commission: 25,     // prowizja Ubera od ceny przejazdu, % (tylko do szacunku, zanim będą własne kursy)
  vatCommission: 23,  // VAT doliczany do prowizji, %
  payMode: 'pct',     // jak płaci szef: 'none' | 'pct' (procent od kwoty od Ubera) | 'hour' (zł za godzinę w aplikacji)
  payValue: 50,
};
const WEEKLY_COMMISSION_TARGET = 0.3075;

let db = load();

function emptyDb() {
  return { version: 3, shifts: [], rides: [], fuels: [], settings: { ...DEFAULTS } };
}

// Przenosi dane ze starszych wersji aplikacji do obecnego układu.
function migrate(d) {
  if (!d || !Array.isArray(d.shifts)) return emptyDb();
  d.rides = d.rides || [];
  d.fuels = d.fuels || [];
  if (!d.version || d.version < 2) {
    d.rides = d.rides.map((r) => ({
      id: r.id, shiftId: r.shiftId, from: r.from || '', to: r.to || '',
      offer: null, etaPickup: null, etaTrip: null,
      accepted: r.depart || null, atPickup: null, tripStart: r.depart || null, end: r.arrive || null,
      final: r.amount ?? null, riderPaid: null, tip: null, cancelled: false,
    }));
    d.fuels = d.fuels.map((f) => ({ ...f, odometer: f.odometer ?? null, full: f.full ?? true }));
    d.version = 2;
  }
  if (d.version < 3) {
    const settings = d.settings || {};
    if ((!settings.payMode || settings.payMode === 'none') &&
      (settings.payValue == null || Number(settings.payValue) === 0)) {
      settings.payMode = DEFAULTS.payMode;
      settings.payValue = DEFAULTS.payValue;
    }
    d.version = 3;
  }
  d.settings = { ...DEFAULTS, ...(d.settings || {}) };
  return d;
}

function load() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return emptyDb(); }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { alert('Nie udało się zapisać danych: ' + e.message); }
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* =========================================================
   Pomocnicze
   ========================================================= */

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

const nf = (n, d = 2) => (n ?? 0).toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMoney = (n) => nf(n) + ' zł';
const fmtPct = (x) => nf(x * 100, 1) + '%';
const fmtKm = (n) => Math.round(n).toLocaleString('pl-PL') + ' km';
const fmtInputNum = (n) => (n == null ? '' : String(n).replace('.', ','));
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDay = (iso) => new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDur = (ms) => {
  const m = Math.max(0, Math.floor(ms / 60000));
  return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
};
const fmtMin = (ms) => Math.max(0, Math.round(ms / 60000)) + ' min';
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const csvDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const msBetween = (a, b) => (a && b ? new Date(b) - new Date(a) : null);

// Polska odmiana: 1 kurs, 2 kursy, 5 kursów.
function plural(n, one, few, many) {
  const w = n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? few : many;
  return n + ' ' + w;
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// Okno z pytaniem zamiast systemowego confirm().
function ask(msg, okLabel = 'Tak', { danger = false, cancelLabel = 'Anuluj' } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal glass" role="dialog" aria-modal="true">
      <p>${esc(msg)}</p>
      <div class="row2">
        <button class="btn ghost" data-r="0">${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'red' : 'accent'}" data-r="1">${esc(okLabel)}</button>
      </div></div>`;
    const close = (val) => {
      bg.classList.add('out');
      setTimeout(() => bg.remove(), 250);
      resolve(val);
    };
    bg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) close(b.dataset.r === '1');
      else if (e.target === bg) close(false);
    });
    document.body.appendChild(bg);
    bg.querySelector('[data-r="1"]').focus();
  });
}

/* =========================================================
   Rozliczenia (szacunki na podstawie Ustawień)
   ========================================================= */

const rates = () => ({ c: db.settings.commission / 100, v: db.settings.vatCommission / 100 });

// Ile z kwoty z oferty faktycznie przychodzi od Ubera – liczone z ostatnich 30 twoich kursów.
function learnedRatio() {
  const rs = db.rides
    .filter((r) => r.end && !r.cancelled && r.offer > 0 && r.final != null)
    .sort((a, b) => byTime(b.end, a.end))
    .slice(0, 30);
  if (rs.length < 3) return null;
  return { ratio: rs.reduce((s, r) => s + r.final, 0) / rs.reduce((s, r) => s + r.offer, 0), n: rs.length };
}

// Spodziewana kwota od Ubera. Zanim będą własne kursy: oferta jest po prowizji, ale przed VAT od prowizji.
function expectedFinalFromOffer(offer) {
  if (offer == null) return null;
  const l = learnedRatio();
  if (l) return offer * l.ratio;
  const { c, v } = rates();
  return c >= 1 ? null : offer * (1 - c - c * v) / (1 - c);
}

function estimateCustomerGross(r, riderPaid, final, offer) {
  if (!r || r.cancelled) return null;
  if (Number.isFinite(riderPaid) && riderPaid >= 0) return { amount: riderPaid, exact: true };
  if (riderPaid != null) return null;
  if (Number.isFinite(final) && final > 0) {
    return { amount: final / (1 - WEEKLY_COMMISSION_TARGET), source: 'final' };
  }
  if (final != null && !Number.isFinite(final)) return null;
  const { c } = rates();
  if (Number.isFinite(offer) && offer > 0 && c < 1) {
    return { amount: offer / (1 - c), source: 'offer' };
  }
  return null;
}

function estimateSource() {
  const l = learnedRatio();
  return l ? `z ${plural(l.n, 'twojego kursu', 'twoich kursów', 'twoich kursów')}` : 'wstępny szacunek, do czasu 3 kursów z kwotą z oferty';
}

// Wypłata od szefa, jeśli ustawiono, jak płaci.
function myPay(earned, ms) {
  const { payMode, payValue } = db.settings;
  if (!payValue) return null;
  if (payMode === 'pct') return earned * payValue / 100;
  if (payMode === 'hour') return ms / 3600000 * payValue;
  return null;
}

const rideEarning = (r) => (r.final || 0) + (r.tip || 0);

/* =========================================================
   Zapytania
   ========================================================= */

const activeShift = () => db.shifts.find((s) => !s.end) || null;
const activeRide = () => db.rides.find((r) => !r.end) || null;
const byTime = (a, b) => (a || '').localeCompare(b || '');
const ridesOf = (id) => db.rides.filter((r) => r.shiftId === id).sort((a, b) => byTime(a.accepted, b.accepted));
const shiftsDesc = () => [...db.shifts].sort((a, b) => byTime(b.start, a.start));

function rideStats(rides, msInApp) {
  const done = rides.filter((r) => r.end && !r.cancelled);
  const cancelled = rides.filter((r) => r.cancelled);
  const earned = rides.reduce((s, r) => s + rideEarning(r), 0);
  const pay = myPay(earned, msInApp);
  const withOffer = done.filter((r) => r.offer > 0 && r.final != null);
  const offerSum = withOffer.reduce((s, r) => s + r.offer, 0);
  const offerFinal = withOffer.reduce((s, r) => s + r.final, 0);
  const withGross = done.filter((r) => r.riderPaid > 0 && r.final != null);
  const grossSum = withGross.reduce((s, r) => s + r.riderPaid, 0);
  const grossFinal = withGross.reduce((s, r) => s + r.final, 0);
  const onTrip = done.reduce((s, r) => s + (msBetween(r.tripStart, r.end) || 0), 0);
  const hours = msInApp / 3600000;
  return {
    done, cancelled, earned, pay, ms: msInApp, onTrip,
    perHour: hours >= 0.25 ? earned / hours : null,
    offerCut: offerSum > 0 ? 1 - offerFinal / offerSum : null, offerN: withOffer.length,
    uberCut: grossSum > 0 ? 1 - grossFinal / grossSum : null, grossN: withGross.length,
    busy: msInApp > 0 ? onTrip / msInApp : null,
  };
}

function shiftStats(s) {
  return rideStats(ridesOf(s.id), new Date(s.end || Date.now()) - new Date(s.start));
}

function weekStartDate(value) {
  const date = new Date(value);
  const source = new Date(date);
  date.setHours(4, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  if (date > source) date.setDate(date.getDate() - 7);
  return date;
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function weeklyCommissionStats() {
  const weeks = new Map();
  db.rides
    .filter((r) => r.end && !r.cancelled && r.riderPaid > 0 && r.final != null)
    .forEach((r) => {
      const start = weekStartDate(r.end);
      const key = dateKey(start);
      if (!weeks.has(key)) weeks.set(key, { key, start, gross: 0, paid: 0, rides: 0 });
      const week = weeks.get(key);
      week.gross += r.riderPaid;
      week.paid += r.final;
      week.rides++;
    });

  const ensureWeek = (start) => {
    const key = dateKey(start);
    if (!weeks.has(key)) weeks.set(key, { key, start, gross: 0, paid: 0, rides: 0 });
  };
  [...weeks.values()].forEach((week) => {
    if (week.gross - week.paid > week.gross * WEEKLY_COMMISSION_TARGET) {
      const next = new Date(week.start);
      next.setDate(next.getDate() + 7);
      ensureWeek(next);
    }
  });

  const currentStart = weekStartDate(Date.now());
  ensureWeek(currentStart);
  return [...weeks.values()]
    .filter((week) => week.key <= dateKey(currentStart))
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((week) => {
      const previousStart = new Date(week.start);
      previousStart.setDate(previousStart.getDate() - 7);
      const previous = weeks.get(dateKey(previousStart));
      const commission = week.gross - week.paid;
      return {
        ...week,
        target: week.gross * WEEKLY_COMMISSION_TARGET,
        commission,
        previousRefund: previous
          ? Math.max(0, previous.gross - previous.paid - previous.gross * WEEKLY_COMMISSION_TARGET)
          : 0,
      };
    })
    .filter((week) => week.rides || week.previousRefund > 0);
}

// Spalanie metodą „od pełna do pełna”, osobno dla każdego paliwa.
function fuelAnalysis() {
  const per = {};
  const avg = {};
  ['LPG', 'Benzyna'].forEach((type) => {
    const fills = db.fuels.filter((f) => f.type === type).sort((a, b) => byTime(a.at, b.at));
    let lastKm = null;
    let liters = 0;
    let sumKm = 0;
    let sumL = 0;
    fills.forEach((f) => {
      liters += f.liters || 0;
      if (!f.full) return;
      if (f.odometer == null) { lastKm = null; liters = 0; return; }
      if (lastKm != null && f.odometer > lastKm) {
        const km = f.odometer - lastKm;
        per[f.id] = { km, liters, per100: liters / km * 100 };
        sumKm += km; sumL += liters;
      }
      lastKm = f.odometer; liters = 0;
    });
    avg[type] = sumKm > 0 ? { km: sumKm, liters: sumL, per100: sumL / sumKm * 100 } : null;
  });

  // Koszt paliwa na 100 km na całym odcinku między pierwszym a ostatnim odczytem licznika.
  const withKm = db.fuels.filter((f) => f.odometer != null).sort((a, b) => byTime(a.at, b.at));
  let cost = null;
  let span = null;
  if (withKm.length >= 2) {
    const first = withKm[0];
    const last = withKm[withKm.length - 1];
    span = last.odometer - first.odometer;
    const money = db.fuels.filter((f) => f.at > first.at && f.at <= last.at).reduce((s, f) => s + (f.amount || 0), 0);
    if (span > 0 && money > 0) cost = money / span * 100;
  }
  const lastOdo = withKm.length ? withKm[withKm.length - 1].odometer : null;
  return { per, avg, cost, span, lastOdo };
}

function recentPlaces() {
  const seen = new Set();
  const out = [];
  [...db.rides].sort((a, b) => byTime(b.accepted, a.accepted)).forEach((r) => {
    [r.from, r.to].forEach((p) => {
      const k = (p || '').trim();
      if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); }
    });
  });
  return out.slice(0, 40);
}

/* =========================================================
   Nawigacja
   ========================================================= */

const TABS = [
  { hash: '#/', label: 'Zmiana', ic: '🚗' },
  { hash: '#/auto', label: 'Auto', ic: '⛽' },
  { hash: '#/historia', label: 'Historia', ic: '📅' },
  { hash: '#/ustawienia', label: 'Ustawienia', ic: '⚙️' },
];

function go(hash) {
  const i = (history.state && history.state.i) || 0;
  history.pushState({ i: i + 1 }, '', hash);
  route();
}

function tab(hash) {
  history.replaceState({ i: 0 }, '', hash);
  route();
}

// Powrót po zapisaniu: cofnij, jeśli przyszliśmy z aplikacji, inaczej przejdź na start.
function done(target = '#/') {
  if (history.state && history.state.i > 0) history.back();
  else tab(target);
}

window.addEventListener('popstate', route);

function currentTab() {
  const h = location.hash || '#/';
  const t = TABS.find((x) => x.hash !== '#/' && h.startsWith(x.hash));
  return t ? t.hash : '#/';
}

function route() {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const views = {
    kurs: () => (id ? viewRideEdit(id) : viewOffer()),
    koniec: () => viewFinish(id, false),
    anulowany: () => viewFinish(id, true),
    tankowanie: () => viewFuel(id),
    zmiana: () => viewShift(id),
    auto: viewAuto,
    historia: viewHistory,
    ustawienia: viewSettings,
  };
  let html = (views[page] || viewHome)();
  if (html == null) { history.replaceState({ i: 0 }, '', '#/'); html = viewHome(); }
  const cur = currentTab();
  $app.innerHTML = html + `<nav class="tabs" aria-label="Menu">${TABS.map((t) =>
    `<button data-tab="${t.hash}" ${t.hash === cur ? 'aria-current="page"' : ''}><span class="ic" aria-hidden="true">${t.ic}</span>${t.label}</button>`).join('')}</nav>`;
  window.scrollTo(0, 0);
  const f = $app.querySelector('[data-autofocus]');
  if (f) f.focus();
  updateEstimates();
}

/* =========================================================
   Widoki – części wspólne
   ========================================================= */

function header(title, back = false) {
  return `<header>
    ${back ? '<button class="nav" data-act="back">‹ Wróć</button>' : '<span></span>'}
    <h1>${esc(title)}</h1><span></span>
  </header>`;
}

function stat(k, v, d = '', cls = '') {
  return `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div>${d ? `<div class="d">${d}</div>` : ''}</div>`;
}

function statsGrid(st) {
  const third = st.pay != null
    ? stat('Dla mnie', fmtMoney(st.pay), db.settings.payMode === 'hour' ? 'za czas w aplikacji' : 'mój procent')
    : stat('Średnio za kurs', st.done.length ? fmtMoney(st.earned / st.done.length) : '—', 'od Ubera');
  return `<div class="stats">
    ${stat('Kursy', st.done.length, st.cancelled.length ? plural(st.cancelled.length, 'anulowany', 'anulowane', 'anulowanych') : '')}
    ${stat('Od Ubera', fmtMoney(st.earned), 'z napiwkami')}
    ${third}
    ${stat('Na godzinę', st.perHour != null ? fmtMoney(st.perHour) : '—', 'od Ubera / czas w aplikacji')}
    ${stat('Czas w aplikacji', fmtDur(st.ms), st.busy != null ? 'z klientem ' + fmtPct(st.busy) : '', 'wide')}
    ${st.offerCut != null ? stat('Oferta → kwota od Ubera', '−' + fmtPct(st.offerCut),
      `tyle mniej niż w ofercie przyszło od Ubera, z ${plural(st.offerN, 'kursu', 'kursów', 'kursów')}`, 'wide') : ''}
    ${st.uberCut != null ? stat('Uber zabrał łącznie', fmtPct(st.uberCut),
      `prowizja z VAT, z ${plural(st.grossN, 'kursu', 'kursów', 'kursów')} z wpisaną ceną klienta`, 'wide') : ''}
  </div>`;
}

function rideItem(r) {
  const open = !r.end;
  const status = r.cancelled ? 'anulowany' : open ? 'w trakcie' : fmtTime(r.end);
  const sub = r.offer != null && !r.cancelled ? `<small>oferta ${nf(r.offer)}</small>` : '';
  return `<button class="item glass ${open ? 'open' : ''} ${r.cancelled ? 'cancel' : ''}" data-go="#/kurs/${r.id}">
    <span class="t">${esc(r.from || '?')} → ${esc(r.to || '?')}</span>
    <span class="a">${r.final != null ? fmtMoney(rideEarning(r)) : '—'}${sub}</span>
    <span class="s">${fmtTime(r.accepted)}–${status}${r.tip ? ' · napiwek ' + fmtMoney(r.tip) : ''}</span>
  </button>`;
}

function shiftCard(s) {
  const st = shiftStats(s);
  return `<button class="item glass" data-go="#/zmiana/${s.id}">
    <span class="t">${fmtDay(s.start)}, ${fmtTime(s.start)}–${s.end ? fmtTime(s.end) : 'trwa'}</span>
    <span class="a">${fmtMoney(st.earned)}${st.pay != null ? `<small>dla mnie ${nf(st.pay)}</small>` : ''}</span>
    <span class="s">${fmtDur(st.ms)} · ${plural(st.done.length, 'kurs', 'kursy', 'kursów')}${st.perHour != null ? ' · ' + fmtMoney(st.perHour) + '/h' : ''}</span>
  </button>`;
}

function fuelItem(f, per) {
  const p = per[f.id];
  const tag = f.type === 'LPG' ? '<span class="tag lpg">LPG</span>' : '<span class="tag pb">PB</span>';
  const parts = [fmtDay(f.at) + ' ' + fmtTime(f.at)];
  if (f.odometer != null) parts.push(fmtKm(f.odometer));
  if (!f.full) parts.push('nie do pełna');
  return `<button class="item glass" data-go="#/tankowanie/${f.id}">
    <span class="t">${tag}${f.liters != null ? nf(f.liters, 1) + ' l' : '—'}${f.amount ? ' · ' + fmtMoney(f.amount) : ''}</span>
    <span class="a">${p ? nf(p.per100, 1) + ' l' : '—'}<small>${p ? 'na 100 km' : ''}</small></span>
    <span class="s">${parts.join(' · ')}${p ? ` · ${fmtKm(p.km)}` : ''}</span>
  </button>`;
}

const placesList = () => `<datalist id="places">${recentPlaces().map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`;

const numInput = (name, val, ph = '0,00', extra = '') =>
  `<input name="${name}" inputmode="decimal" autocomplete="off" placeholder="${ph}" value="${esc(fmtInputNum(val))}" ${extra}>`;

/* =========================================================
   Widoki
   ========================================================= */

function viewHome() {
  const s = activeShift();
  if (!s) {
    const last = shiftsDesc()[0];
    return header('Lisia Praca') + `<main>
      <div class="glow go" style="border-radius:var(--radius)"><button class="big go" data-act="startShift">Włączam aplikację</button></div>
      <p class="hint center">Naciśnij, gdy włączasz aplikację Ubera.</p>
      ${last ? '<h2>Ostatnia zmiana</h2>' + statsGrid(shiftStats(last)) + '<div style="margin-top:10px">' + shiftCard(last) + '</div>' : ''}
    </main>`;
  }

  const st = shiftStats(s);
  const r = activeRide();
  let live = '';
  if (r) {
    const step = r.tripStart ? 3 : r.atPickup ? 2 : 1;
    const stage = ['', 'Jadę po klienta', 'Czekam na klienta', 'Kurs w trakcie'][step];
    const since = [null, r.accepted, r.atPickup, r.tripStart][step];
    const eta = step === 1 ? r.etaPickup : step === 3 ? r.etaTrip : null;
    const next = step === 1
      ? '<button class="big info" data-act="atPickup">Jestem na miejscu</button>'
      : step === 2
        ? '<button class="big info" data-act="tripStart">Klient wsiadł</button>'
        : `<button class="big go" data-go="#/koniec/${r.id}">Koniec kursu</button>`;
    const exp = expectedFinalFromOffer(r.offer);
    live = `<section class="card live glass">
      <div class="stage"><span>${stage}</span><span>${since ? fmtMin(Date.now() - new Date(since)) : ''}${eta != null ? ' / szac. ' + eta + ' min' : ''}</span></div>
      <div class="steps">${[1, 2, 3, 4].map((n) => `<span class="${n <= step ? 'on' : ''}"></span>`).join('')}</div>
      <div class="route">${esc(r.from || '?')} → ${esc(r.to || '?')}</div>
      <div class="meta">${r.offer != null ? `Oferta <b>${fmtMoney(r.offer)}</b> · od Ubera ok. <b>${fmtMoney(exp)}</b>` : 'Bez kwoty z oferty'}</div>
      <div class="glow ${step === 3 ? 'go' : 'info'}" style="border-radius:var(--radius)">${next}</div>
      <div class="links">
        <button class="linkbtn" data-go="#/kurs/${r.id}">Popraw dane</button>
        <button class="linkbtn danger" data-go="#/anulowany/${r.id}">Anulowany</button>
      </div>
    </section>`;
  }

  const rides = ridesOf(s.id).slice().reverse();
  return header('Moja zmiana') + `<main>
    <button class="big stop" data-act="endShift">Wyłączam aplikację</button>
    <p class="since">Aplikacja włączona od <strong>${fmtTime(s.start)}</strong> · ${fmtDur(st.ms)}</p>
    ${live || `<div class="glow info" style="border-radius:var(--radius);margin-top:18px"><button class="big info" data-go="#/kurs">+ Nowy kurs</button></div>`}
    ${statsGrid(st)}
    <h2>Kursy na tej zmianie</h2>
    ${rides.length ? `<div class="list">${rides.map(rideItem).join('')}</div>` : '<p class="muted">Jeszcze nie ma kursów.</p>'}
  </main>`;
}

function viewOffer() {
  if (!activeShift()) return null;
  const r = activeRide();
  if (r) return viewRideEdit(r.id);
  return header('Oferta kursu', true) + `<main>
    <form class="stack" data-form="offer" novalidate>
      <label>Skąd <span class="opt">w przybliżeniu, jak w ofercie</span><input name="from" list="places" autocomplete="off" data-autofocus></label>
      <label>Dokąd<input name="to" list="places" autocomplete="off"></label>
      <label>Kwota z oferty (zł)${numInput('offer', null, '0,00', 'data-est="offer"')}</label>
      <p class="hint" data-est-out="offer"></p>
      <div class="grid2">
        <label>Dojazd do klienta <span class="opt">min</span>${numInput('etaPickup', null, '0')}</label>
        <label>Przejazd <span class="opt">min</span>${numInput('etaTrip', null, '0')}</label>
      </div>
      <div class="glow go" style="border-radius:var(--radius)"><button class="big go">Przyjmuję</button></div>
    </form>
    ${placesList()}
  </main>`;
}

function viewFinish(id, cancelled) {
  const r = db.rides.find((x) => x.id === id);
  if (!r) return null;
  const exp = expectedFinalFromOffer(r.offer);
  if (cancelled) {
    return header('Kurs anulowany', true) + `<main>
      <form class="stack" data-form="finish" data-id="${r.id}" data-cancel="1" novalidate>
        <p class="note">${esc(r.from || '?')} → ${esc(r.to || '?')}. Jeśli Uber naliczył opłatę za anulowanie, wpisz ją poniżej.</p>
        <label>Opłata za anulowanie (zł) <span class="opt">opcjonalnie</span>${numInput('final', null, '0,00', 'data-autofocus')}</label>
        <button class="big stop">Zapisz jako anulowany</button>
      </form>
    </main>`;
  }
  return header('Koniec kursu', true) + `<main>
    <form class="stack" data-form="finish" data-id="${r.id}" novalidate>
      <label>Kwota od Ubera (zł) <span class="opt">${exp != null ? 'spodziewane ok. ' + fmtMoney(exp) : 'kwota po zakończeniu kursu'}</span>
        ${numInput('final', null, exp != null ? fmtInputNum(Math.round(exp * 100) / 100) : '0,00', 'data-autofocus data-est="gross" data-estimated="1"')}</label>
      <div class="grid2">
        <label>Klient zapłacił <span class="opt">opcjonalnie</span>${numInput('riderPaid', null, '0,00', 'data-est="gross"')}</label>
        <label>Napiwek <span class="opt">opcjonalnie</span>${numInput('tip', null, '0,00', 'data-est="gross"')}</label>
      </div>
      <p class="hint" data-est-out="gross"></p>
      <label>Skąd <span class="opt">dokładny adres</span><input name="from" list="places" autocomplete="off" value="${esc(r.from)}"></label>
      <label>Dokąd <span class="opt">dokładny adres</span><input name="to" list="places" autocomplete="off" value="${esc(r.to)}"></label>
      <div class="glow go" style="border-radius:var(--radius)"><button class="big go">Zapisz kurs</button></div>
    </form>
    ${placesList()}
  </main>`;
}

function viewRideEdit(id) {
  const r = db.rides.find((x) => x.id === id);
  if (!r) return null;
  const dt = (name, label) => `<label>${label}<input type="datetime-local" name="${name}" value="${toLocalInput(r[name])}"></label>`;
  return header('Kurs', true) + `<main>
    <form class="stack" data-form="rideEdit" data-id="${r.id}" novalidate>
      <label>Skąd<input name="from" list="places" autocomplete="off" value="${esc(r.from)}"></label>
      <label>Dokąd<input name="to" list="places" autocomplete="off" value="${esc(r.to)}"></label>
      <div class="grid2">
        <label>Oferta (zł)${numInput('offer', r.offer, '0,00', 'data-est="gross"')}</label>
        <label>Od Ubera (zł)${numInput('final', r.final, '0,00', 'data-est="gross"')}</label>
        <label>Klient zapłacił${numInput('riderPaid', r.riderPaid, '0,00', 'data-est="gross"')}</label>
        <label>Napiwek${numInput('tip', r.tip, '0,00', 'data-est="gross"')}</label>
        <label>Szac. dojazd <span class="opt">min</span>${numInput('etaPickup', r.etaPickup, '0')}</label>
        <label>Szac. przejazd <span class="opt">min</span>${numInput('etaTrip', r.etaTrip, '0')}</label>
      </div>
      <p class="hint" data-est-out="gross"></p>
      ${dt('accepted', 'Przyjęty')}
      ${dt('atPickup', 'Na miejscu')}
      ${dt('tripStart', 'Klient wsiadł')}
      ${dt('end', 'Koniec <span class="opt">puste = kurs trwa</span>')}
      <label class="check"><input type="checkbox" name="cancelled" ${r.cancelled ? 'checked' : ''}> Kurs anulowany</label>
      <button class="btn accent">Zapisz</button>
      <button type="button" class="btn danger" data-act="deleteRide" data-id="${r.id}">Usuń kurs</button>
    </form>
    ${placesList()}
  </main>`;
}

function viewShift(id) {
  const s = db.shifts.find((x) => x.id === id);
  if (!s) return null;
  const rides = ridesOf(s.id).slice().reverse();
  return header(fmtDay(s.start), true) + `<main>
    ${statsGrid(shiftStats(s))}
    <h2>Kursy</h2>
    ${rides.length ? `<div class="list">${rides.map(rideItem).join('')}</div>` : '<p class="muted">Brak kursów.</p>'}
    <h2>Godziny zmiany</h2>
    <form class="stack" data-form="shift" data-id="${s.id}" novalidate>
      <label>Włączenie aplikacji<input type="datetime-local" name="start" value="${toLocalInput(s.start)}"></label>
      <label>Wyłączenie aplikacji <span class="opt">puste = zmiana trwa</span><input type="datetime-local" name="end" value="${toLocalInput(s.end)}"></label>
      <button class="btn accent">Zapisz godziny</button>
      <button type="button" class="btn danger" data-act="deleteShift" data-id="${s.id}">Usuń zmianę razem z kursami</button>
    </form>
  </main>`;
}

function viewAuto() {
  const fa = fuelAnalysis();
  const fills = [...db.fuels].sort((a, b) => byTime(b.at, a.at));
  const avg = (t) => (fa.avg[t] ? nf(fa.avg[t].per100, 1) + ' l' : '—');
  const avgD = (t) => (fa.avg[t] ? `na 100 km, z ${fmtKm(fa.avg[t].km)}` : 'potrzeba 2 tankowań do pełna z licznikiem');
  return header('Auto i paliwo') + `<main>
    <div class="glow go" style="border-radius:var(--radius)"><button class="big go" data-go="#/tankowanie">+ Tankowanie</button></div>
    <p class="hint center">Paliwo z karty flotowej nie zmniejsza twojego zarobku. Tu liczymy tylko spalanie auta.</p>
    <div class="stats">
      ${stat('Spalanie LPG', avg('LPG'), avgD('LPG'))}
      ${stat('Spalanie benzyny', avg('Benzyna'), avgD('Benzyna'))}
      ${stat('Koszt paliwa', fa.cost != null ? fmtMoney(fa.cost) : '—', 'na 100 km, oba paliwa')}
      ${stat('Licznik', fa.lastOdo != null ? fmtKm(fa.lastOdo) : '—', fa.span ? 'zapisane ' + fmtKm(fa.span) : '')}
    </div>
    <p class="hint">Spalanie liczę metodą „od pełna do pełna”: litry zatankowane od poprzedniego tankowania do pełna, podzielone przez przejechane kilometry. Wskazań komputera auta nie biorę pod uwagę, bo przy instalacji LPG liczy on zużycie tak, jakby auto jechało na benzynie.</p>
    <h2>Tankowania</h2>
    ${fills.length ? `<div class="list">${fills.map((f) => fuelItem(f, fa.per)).join('')}</div>` : '<p class="muted">Jeszcze nie ma tankowań.</p>'}
  </main>`;
}

function viewFuel(id) {
  const f = id ? db.fuels.find((x) => x.id === id) : null;
  if (id && !f) return null;
  const type = f ? f.type : 'LPG';
  const lastOdo = fuelAnalysis().lastOdo;
  const opt = (v) => `<label><input type="radio" name="type" value="${v}" ${type === v ? 'checked' : ''}><span>${v}</span></label>`;
  return header(f ? 'Tankowanie' : 'Nowe tankowanie', true) + `<main>
    <form class="stack" data-form="fuel" data-id="${f ? f.id : ''}" novalidate>
      <fieldset class="seg"><legend>Paliwo</legend>${opt('LPG')}${opt('Benzyna')}</fieldset>
      <label>Stan licznika (km) <span class="opt">${lastOdo != null && !f ? 'ostatnio ' + fmtKm(lastOdo) : 'z licznika auta'}</span>
        <input name="odometer" inputmode="numeric" autocomplete="off" placeholder="np. 123456" value="${f && f.odometer != null ? f.odometer : ''}" ${f ? '' : 'data-autofocus'}></label>
      <div class="grid2">
        <label>Litry${numInput('liters', f && f.liters, '0,0')}</label>
        <label>Kwota (zł) <span class="opt">z paragonu</span>${numInput('amount', f && f.amount)}</label>
      </div>
      <label class="check"><input type="checkbox" name="full" ${!f || f.full ? 'checked' : ''}> Do pełna (do odbicia pistoletu)</label>
      ${f ? `<label>Kiedy<input type="datetime-local" name="at" value="${toLocalInput(f.at)}"></label>` : ''}
      <div class="glow go" style="border-radius:var(--radius)"><button class="big go">Zapisz</button></div>
      ${f ? `<button type="button" class="btn danger" data-act="deleteFuel" data-id="${f.id}">Usuń tankowanie</button>` : ''}
    </form>
  </main>`;
}

function viewHistory() {
  const shifts = shiftsDesc();
  if (!shifts.length) return header('Historia') + '<main><p class="muted">Jeszcze nie ma żadnej zmiany.</p></main>';
  const weekly = weeklyCommissionStats();
  const months = [];
  shifts.forEach((s) => {
    const d = new Date(s.start);
    const key = d.getFullYear() + '-' + d.getMonth();
    let m = months.find((x) => x.key === key);
    if (!m) { m = { key, date: d, shifts: [] }; months.push(m); }
    m.shifts.push(s);
  });
  const weeklyHtml = weekly.length ? `<h2>Prowizja Ubera — tygodniowo</h2>
    ${weekly.map((w) => {
      const end = new Date(w.start);
      end.setDate(end.getDate() + 7);
      const range = `${w.start.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })} 04:00–${end.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })} 04:00`;
      const current = w.key === dateKey(weekStartDate(Date.now()));
      const difference = w.commission - w.target;
      const adjustment = w.rides
        ? difference > 0.005
          ? `${current ? 'Możliwy zwrot po zakończeniu tygodnia' : 'Szacowany zwrot w kolejnym tygodniu'}: <b>${fmtMoney(difference)}</b>.`
          : difference < -0.005
            ? `Potrącenie jest poniżej celu o <b>${fmtMoney(-difference)}</b>.`
            : 'Potrącenie jest zgodne z celem tygodniowym.'
        : '';
      return `<div class="card glass note" style="margin-bottom:10px">
        <b>${range}</b>
        ${w.rides
          ? `<p>${plural(w.rides, 'kurs', 'kursy', 'kursów')} z kompletem kwot: klienci zapłacili <b>${fmtMoney(w.gross)}</b>, Uber potrącił <b>${fmtMoney(w.commission)}</b>, cel 30,75% to <b>${fmtMoney(w.target)}</b>.</p>
            <p>${adjustment}</p>`
          : '<p>Brak kursów z kompletem kwot do wyliczenia prowizji.</p>'}
        ${w.previousRefund > 0.005 ? `<p>Oczekiwany zwrot z poprzedniego tygodnia: <b>${fmtMoney(w.previousRefund)}</b>.</p>` : ''}
      </div>`;
    }).join('')}
    <p class="hint">Wyliczenie obejmuje zakończone kursy z wpisaną ceną klienta i kwotą od Ubera. Tydzień rozliczeniowy trwa od poniedziałku 04:00 do kolejnego poniedziałku 04:00.</p>` : '';
  return header('Historia') + `<main>${weeklyHtml}${months.map((m, i) => {
    const ms = m.shifts.reduce((a, s) => a + (new Date(s.end || Date.now()) - new Date(s.start)), 0);
    const st = rideStats(m.shifts.flatMap((s) => ridesOf(s.id)), ms);
    const name = m.date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    return `<h2>${esc(name)} · ${plural(m.shifts.length, 'zmiana', 'zmiany', 'zmian')}</h2>
      ${i === 0 ? statsGrid(st) + '<div style="height:10px"></div>'
        : `<p class="hint" style="margin-bottom:10px">${fmtMoney(st.earned)} od Ubera${st.pay != null ? ' · dla mnie ' + fmtMoney(st.pay) : ''} · ${fmtDur(ms)}</p>`}
      <div class="list">${m.shifts.map(shiftCard).join('')}</div>`;
  }).join('')}</main>`;
}

function viewSettings() {
  const s = db.settings;
  const l = learnedRatio();
  const mode = (v, label) => `<label><input type="radio" name="payMode" value="${v}" ${s.payMode === v ? 'checked' : ''}><span>${label}</span></label>`;
  return header('Ustawienia') + `<main>
    <h2>Jak płaci mi szef</h2>
    <form class="stack" data-form="settings" novalidate>
      <fieldset class="seg" style="grid-template-columns:1fr 1fr 1fr">${mode('none', 'Nie liczę')}${mode('pct', '% od Ubera')}${mode('hour', 'Za godzinę')}</fieldset>
      <label>Wartość <span class="opt">procent albo zł za godzinę w aplikacji</span>${numInput('payValue', s.payValue || null, '0')}</label>
      <p class="hint" style="margin-top:-6px">Domyślnie dzielicie po połowie kwotę od Ubera po prowizji i VAT oraz napiwki. Nie odejmujemy kosztów, których nie ponosisz.</p>
      <h2 style="margin-top:12px">Szacunek kwoty z oferty</h2>
      <p class="hint">Prowizja może się różnić między kursami; tygodniowy cel z VAT to 30,75%. Nadwyżka jest rozliczana zwrotem w kolejnym tygodniu.</p>
      <div class="card glass note">${l
        ? `Od Ubera przychodzi średnio <b>${fmtPct(l.ratio)}</b> kwoty z oferty (z ${plural(l.n, 'twojego kursu', 'twoich kursów', 'twoich kursów')}). Tego używam przy nowych ofertach.`
        : 'Gdy zapiszesz 3 kursy z kwotą z oferty i kwotą od Ubera, szacunek będzie liczony z twoich kursów. Do tego czasu korzystam ze stawek poniżej.'}</div>
      <details>
        <summary class="muted" style="padding:8px 0;cursor:pointer">Stawki wstępne</summary>
        <div class="stack" style="display:flex;flex-direction:column;gap:16px;margin-top:10px">
          <label>Prowizja Ubera (%) <span class="opt">źródła podają 25%</span>${numInput('commission', s.commission, '25', 'data-est="settings"')}</label>
          <label>VAT od prowizji (%) <span class="opt">źródła podają 23%</span>${numInput('vatCommission', s.vatCommission, '23', 'data-est="settings"')}</label>
          <div class="card glass note" data-est-out="settings"></div>
        </div>
      </details>
      <button class="btn accent">Zapisz</button>
    </form>
    <h2>Dane</h2>
    <div class="tools">
      <button class="btn ghost" data-act="exportRides">Kursy i zmiany → Excel (CSV)</button>
      <button class="btn ghost" data-act="exportFuel">Tankowania → Excel (CSV)</button>
      <button class="btn ghost" data-act="exportJson">Zrób kopię zapasową</button>
      <label class="btn ghost file-btn">Przywróć z kopii<input type="file" accept="application/json,.json" data-act="importJson"></label>
    </div>
    <p class="hint">Dane są zapisane tylko na tym telefonie. Rób kopię zapasową co jakiś czas, np. raz w tygodniu.</p>
    <h2>Kasowanie danych</h2>
    <p class="hint">Pojedynczy kurs lub tankowanie usuniesz w jego szczegółach. Możesz też wyczyścić całą wybraną kategorię.</p>
    <div class="tools">
      <button class="btn danger" data-act="clearFuelData">Usuń wszystkie tankowania</button>
      <button class="btn danger" data-act="clearRideData">Usuń wszystkie kursy</button>
      <button class="btn danger" data-act="resetData">Zresetuj całą aplikację</button>
    </div>
  </main>`;
}

// Podgląd szacunków na żywo podczas wpisywania.
function updateEstimates() {
  const offerIn = $app.querySelector('[data-est="offer"]');
  const offerOut = $app.querySelector('[data-est-out="offer"]');
  if (offerIn && offerOut) {
    const v = parseNum(offerIn.value);
    offerOut.textContent = v > 0
      ? `Od Ubera dostaniesz ok. ${fmtMoney(expectedFinalFromOffer(v))} (${estimateSource()}).`
      : 'Kwota z oferty to jeszcze nie wszystko: Uber potrąca potem VAT od swojej prowizji.';
  }
  const setOut = $app.querySelector('[data-est-out="settings"]');
  if (setOut) {
    const f = $app.querySelector('form[data-form="settings"]');
    const val = (n) => { const x = parseNum(f.elements[n].value); return Number.isFinite(x) ? x / 100 : 0; };
    const c = val('commission'); const v = val('vatCommission');
    const final = 100 * (1 - c - c * v);
    setOut.innerHTML = `Przykład: klient płaci <b>100,00 zł</b> → oferta w aplikacji <b>${nf(100 * (1 - c))} zł</b> →
      od Ubera <b>${nf(final)} zł</b> (prowizja z VAT ${nf(100 - final)} zł).`;
  }
  const grossOut = $app.querySelector('[data-est-out="gross"]');
  const grossForm = $app.querySelector('form[data-form="finish"], form[data-form="rideEdit"]');
  if (grossOut && grossForm) {
    const r = db.rides.find((ride) => ride.id === grossForm.dataset.id);
    if (!r) return;
    const input = (name, fallback) => grossForm.elements[name]
      ? parseNum(grossForm.elements[name].value)
      : fallback;
    const finalInput = grossForm.elements.final;
    const final = finalInput && finalInput.dataset.estimated
      ? null
      : input('final', r.final);
    const estimate = estimateCustomerGross(r, input('riderPaid', r.riderPaid), final, input('offer', r.offer));
    const tip = input('tip', r.tip);
    const tipNote = Number.isFinite(tip) && tip > 0 ? ` Napiwek osobno: ${fmtMoney(tip)}.` : '';
    if (!estimate) {
      grossOut.textContent = 'Wpisz kwotę klienta, kwotę od Ubera albo ofertę, aby zobaczyć brutto.';
    } else if (estimate.exact) {
      grossOut.textContent = `Wpisana kwota brutto przejazdu od klienta: ${fmtMoney(estimate.amount)}.${tipNote}`;
    } else if (estimate.source === 'final') {
      grossOut.textContent = `Szacowane brutto przejazdu (bez napiwku): ${fmtMoney(estimate.amount)}. Szacunek z kwoty od Ubera przy tygodniowym celu prowizji 30,75%; stawka na tym kursie mogła być inna.${tipNote}`;
    } else {
      grossOut.textContent = `Szacowane brutto przejazdu (bez napiwku): ${fmtMoney(estimate.amount)}. Szacunek z oferty przy prowizji podstawowej ${fmtPct(rates().c)}.${tipNote}`;
    }
  }
}

/* =========================================================
   Akcje
   ========================================================= */

const actions = {
  back: () => done(),

  startShift() {
    if (!activeShift()) db.shifts.push({ id: uid(), start: nowIso(), end: null });
    save();
    route();
  },

  async endShift() {
    const s = activeShift();
    if (!s) return route();
    const r = activeRide();
    const ok = await ask(r ? 'Masz otwarty kurs. Zakończyć go teraz i wyłączyć aplikację?' : 'Wyłączasz aplikację i kończysz zmianę?', 'Wyłączam', { danger: true });
    if (!ok) return;
    const t = nowIso();
    if (r) r.end = t;
    s.end = t;
    save();
    route();
  },

  atPickup() {
    const r = activeRide();
    if (r && !r.atPickup) { r.atPickup = nowIso(); save(); }
    route();
  },

  tripStart() {
    const r = activeRide();
    if (r && !r.tripStart) { r.tripStart = nowIso(); if (!r.atPickup) r.atPickup = r.tripStart; save(); }
    route();
  },

  async deleteRide(el) {
    if (!(await ask('Usunąć ten kurs?', 'Usuń', { danger: true }))) return;
    db.rides = db.rides.filter((r) => r.id !== el.dataset.id);
    save();
    done();
  },

  async deleteFuel(el) {
    if (!(await ask('Usunąć to tankowanie?', 'Usuń', { danger: true }))) return;
    db.fuels = db.fuels.filter((f) => f.id !== el.dataset.id);
    save();
    done('#/auto');
  },

  async clearFuelData() {
    if (!db.fuels.length) { toast('Nie ma tankowań do usunięcia.'); return; }
    if (!(await ask(`Usunąć wszystkie ${plural(db.fuels.length, 'tankowanie', 'tankowania', 'tankowań')}? Kursy i zmiany zostaną zachowane.`, 'Usuń wszystko', { danger: true }))) return;
    db.fuels = [];
    save();
    toast('Usunięto wszystkie tankowania');
    route();
  },

  async clearRideData() {
    if (!db.rides.length) { toast('Nie ma kursów do usunięcia.'); return; }
    if (!(await ask(`Usunąć wszystkie ${plural(db.rides.length, 'kurs', 'kursy', 'kursów')}, także otwarte? Zmiany i tankowania zostaną zachowane.`, 'Usuń wszystko', { danger: true }))) return;
    db.rides = [];
    save();
    toast('Usunięto wszystkie kursy');
    route();
  },

  async resetData() {
    const summary = `${plural(db.shifts.length, 'zmianę', 'zmiany', 'zmian')}, ${plural(db.rides.length, 'kurs', 'kursy', 'kursów')}, ${plural(db.fuels.length, 'tankowanie', 'tankowania', 'tankowań')} oraz ustawienia`;
    if (!(await ask(`Zresetować całą aplikację? Zostaną usunięte ${summary}. Tej operacji nie da się cofnąć.`, 'Zresetuj', { danger: true }))) return;
    db = emptyDb();
    save();
    toast('Zresetowano aplikację');
    route();
  },

  async deleteShift(el) {
    const id = el.dataset.id;
    if (!(await ask('Usunąć całą zmianę razem z jej kursami? Tego nie da się cofnąć.', 'Usuń', { danger: true }))) return;
    db.shifts = db.shifts.filter((s) => s.id !== id);
    db.rides = db.rides.filter((r) => r.shiftId !== id);
    save();
    done('#/historia');
  },

  exportRides() {
    const rows = [['Typ', 'Data', 'Przyjęty', 'Na miejscu', 'Klient wsiadł', 'Koniec', 'Skąd', 'Dokąd',
      'Oferta (zł)', 'Od Ubera (zł)', 'Klient zapłacił (zł)', 'Napiwek (zł)', 'Szac. dojazd (min)', 'Szac. przejazd (min)', 'Status']];
    [...db.shifts].sort((a, b) => byTime(a.start, b.start)).forEach((s) => {
      const day = csvDate(s.start).slice(0, 10);
      const st = shiftStats(s);
      rows.push(['Zmiana', day, csvDate(s.start), '', '', csvDate(s.end), '', '', '', csvNum(st.earned), '', '', '', '', s.end ? 'zakończona' : 'trwa']);
      ridesOf(s.id).forEach((r) => rows.push(['Kurs', day, csvDate(r.accepted), csvDate(r.atPickup), csvDate(r.tripStart), csvDate(r.end),
        r.from, r.to, csvNum(r.offer), csvNum(r.final), csvNum(r.riderPaid), csvNum(r.tip), r.etaPickup ?? '', r.etaTrip ?? '',
        r.cancelled ? 'anulowany' : r.end ? 'zakończony' : 'w trakcie']));
    });
    downloadCsv(rows, 'kursy');
  },

  exportFuel() {
    const per = fuelAnalysis().per;
    const rows = [['Data', 'Paliwo', 'Litry', 'Kwota (zł)', 'Cena za litr (zł)', 'Licznik (km)', 'Do pełna', 'Km od poprzedniego pełnego', 'Spalanie (l/100 km)']];
    [...db.fuels].sort((a, b) => byTime(a.at, b.at)).forEach((f) => {
      const p = per[f.id];
      rows.push([csvDate(f.at), f.type, csvNum(f.liters), csvNum(f.amount), f.amount && f.liters ? csvNum(f.amount / f.liters) : '',
        f.odometer ?? '', f.full ? 'tak' : 'nie', p ? p.km : '', p ? csvNum(p.per100) : '']);
    });
    downloadCsv(rows, 'tankowania');
  },

  exportJson() {
    const blob = new Blob([JSON.stringify({ app: 'LisiaPraca', exported: nowIso(), ...db }, null, 1)], { type: 'application/json' });
    shareOrDownload(blob, `lisia-praca-kopia-${csvDate(nowIso()).slice(0, 10)}.json`);
  },
};

const csvNum = (n) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(2).replace('.', ','));

function downloadCsv(rows, name) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  shareOrDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `lisia-praca-${name}-${csvDate(nowIso()).slice(0, 10)}.csv`);
}

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

/* =========================================================
   Formularze
   ========================================================= */

// Odczytuje pole liczbowe; zaznacza błąd i zwraca undefined, gdy wpis jest niepoprawny.
function numField(form, name, { required = false, int = false } = {}) {
  const input = form.elements[name];
  let v = parseNum(input.value);
  const bad = Number.isNaN(v) || (required && v == null) || (v != null && v < 0);
  input.classList.toggle('bad', bad);
  if (bad) { input.focus(); toast(required && v == null ? 'To pole jest wymagane.' : 'Niepoprawna liczba. Użyj np. 42,50'); return undefined; }
  if (v != null && int) v = Math.round(v);
  return v;
}

// Odczytuje kilka pól liczbowych; zwraca null, jeśli któreś jest błędne.
function numFields(form, specs) {
  const out = {};
  for (const [name, opts] of Object.entries(specs)) {
    const v = numField(form, name, opts);
    if (v === undefined) return null;
    out[name] = v;
  }
  return out;
}

const forms = {
  offer(f) {
    const shift = activeShift();
    if (!shift) return done();
    const n = numFields(f, { offer: {}, etaPickup: { int: true }, etaTrip: { int: true } });
    if (!n) return;
    db.rides.push({
      id: uid(), shiftId: shift.id, from: f.elements.from.value.trim(), to: f.elements.to.value.trim(),
      offer: n.offer, etaPickup: n.etaPickup, etaTrip: n.etaTrip,
      accepted: nowIso(), atPickup: null, tripStart: null, end: null,
      final: null, riderPaid: null, tip: null, cancelled: false,
    });
    save();
    done();
  },

  finish(f) {
    const r = db.rides.find((x) => x.id === f.dataset.id);
    if (!r) return done();
    const cancel = f.dataset.cancel === '1';
    const n = numFields(f, cancel ? { final: {} } : { final: { required: true }, riderPaid: {}, tip: {} });
    if (!n) return;
    Object.assign(r, n, { end: r.end || nowIso(), cancelled: cancel });
    if (!cancel) {
      r.from = f.elements.from.value.trim();
      r.to = f.elements.to.value.trim();
    }
    save();
    toast(cancel ? 'Zapisano anulowany kurs' : 'Kurs zapisany');
    done();
  },

  rideEdit(f) {
    const r = db.rides.find((x) => x.id === f.dataset.id);
    if (!r) return done();
    const n = numFields(f, { offer: {}, final: {}, riderPaid: {}, tip: {}, etaPickup: { int: true }, etaTrip: { int: true } });
    if (!n) return;
    const t = {};
    ['accepted', 'atPickup', 'tripStart', 'end'].forEach((k) => { t[k] = fromLocalInput(f.elements[k].value); });
    if (!t.accepted) { toast('Podaj godzinę przyjęcia kursu.'); return; }
    const order = ['accepted', 'atPickup', 'tripStart', 'end'].map((k) => t[k]).filter(Boolean);
    if (order.some((x, i) => i > 0 && x < order[i - 1])) { toast('Godziny muszą iść po kolei.'); return; }
    if (!t.end && db.rides.some((x) => x !== r && !x.end)) { toast('Inny kurs jest już otwarty.'); return; }
    Object.assign(r, n, t, {
      from: f.elements.from.value.trim(), to: f.elements.to.value.trim(), cancelled: f.elements.cancelled.checked,
    });
    save();
    done();
  },

  async fuel(f) {
    const n = numFields(f, { odometer: { int: true }, liters: { required: true }, amount: {} });
    if (!n) return;
    const existing = f.dataset.id ? db.fuels.find((x) => x.id === f.dataset.id) : null;
    const at = existing ? fromLocalInput(f.elements.at.value) || existing.at : nowIso();
    if (n.odometer != null) {
      const before = db.fuels.filter((x) => x !== existing && x.odometer != null && x.at < at).sort((a, b) => byTime(b.at, a.at))[0];
      if (before && n.odometer <= before.odometer &&
        !(await ask(`Licznik ${fmtKm(n.odometer)} jest mniejszy niż przy poprzednim tankowaniu (${fmtKm(before.odometer)}). Zapisać mimo to?`, 'Zapisz'))) return;
    }
    const data = { type: f.elements.type.value || 'LPG', odometer: n.odometer, liters: n.liters, amount: n.amount, full: f.elements.full.checked, at };
    if (existing) Object.assign(existing, data);
    else {
      const s = activeShift();
      db.fuels.push({ id: uid(), shiftId: s ? s.id : null, ...data });
    }
    save();
    toast('Tankowanie zapisane');
    done('#/auto');
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

  settings(f) {
    const n = numFields(f, { payValue: {}, commission: {}, vatCommission: {} });
    if (!n) return;
    if (n.commission == null) n.commission = DEFAULTS.commission;
    if (n.vatCommission == null) n.vatCommission = DEFAULTS.vatCommission;
    if (n.payValue == null) n.payValue = 0;
    if (n.commission >= 100) { toast('Prowizja musi być mniejsza niż 100%.'); return; }
    db.settings = { ...db.settings, ...n, payMode: f.elements.payMode.value || 'none' };
    save();
    toast('Zapisano');
    route();
  },
};

/* =========================================================
   Zdarzenia
   ========================================================= */

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go],[data-act],[data-tab]');
  if (!el || el.tagName === 'INPUT') return;
  if (el.dataset.tab) { tab(el.dataset.tab); return; }
  if (el.dataset.go) { go(el.dataset.go); return; }
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});

$app.addEventListener('submit', (e) => {
  e.preventDefault();
  const fn = forms[e.target.dataset.form];
  if (fn) fn(e.target);
});

$app.addEventListener('input', (e) => {
  if (e.target.name === 'final' && e.target.dataset.estimated) e.target.dataset.estimated = '';
  if (e.target.dataset.est) updateEstimates();
  e.target.classList.remove('bad');
});

$app.addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'importJson' || !e.target.files[0]) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.shifts) || !Array.isArray(d.rides)) throw new Error('To nie jest kopia Lisiej Pracy.');
      const msg = `Kopia zawiera ${plural(d.shifts.length, 'zmianę', 'zmiany', 'zmian')}, ${plural(d.rides.length, 'kurs', 'kursy', 'kursów')} i ${plural((d.fuels || []).length, 'tankowanie', 'tankowania', 'tankowań')}. Zastąpić nią obecne dane?`;
      if (!(await ask(msg, 'Zastąp', { danger: true }))) return;
      db = migrate(d);
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

// Odświeżaj liczniki czasu na ekranie zmiany, gdy nikt nic nie wpisuje.
setInterval(() => {
  const busy = (document.activeElement && document.activeElement.tagName === 'INPUT') || document.querySelector('.modal-bg');
  if (activeShift() && !busy && currentTab() === '#/' && (location.hash === '' || location.hash === '#/')) route();
}, 20000);

/* =========================================================
   Start
   ========================================================= */

save(); // zapisz dane po ewentualnej migracji
history.replaceState({ i: 0 }, '', location.hash || '#/');
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
