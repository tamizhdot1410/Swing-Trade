import { TF, resolveTicker, fetchCandles, analyze, formatDuration, VOLUME_TEXT } from './analysis.js';
import { PATTERNS, PATTERN_ORDER, CONCEPTS, DATA_NOTES, VOLUME_PATTERNS, VOLUME_ORDER } from './patterns.js';
import { drawChart } from './chartdraw.js';

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) => (n == null || isNaN(n) ? '-' : n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BIAS = { bullish: 'bullish-leaning', bearish: 'bearish-leaning', neutral: 'direction unclear' };

const state = {
  symbol: '', exch: 'NSE', tf: '1d', view: 'analyse', busy: false,
  data: null, // { ticker, meta, by: { tf: { candles, result } } }
  calc: { side: 'long', entry: null, stop: null, target: null, capital: 100000, riskPct: 1 },
};
const cur = () => state.data.by[state.tf];

// ---------- Prefs ----------
async function loadPrefs() {
  try {
    const p = await chrome.storage.local.get(['tf', 'exch', 'capital', 'riskPct']);
    if (p.tf && TF[p.tf]) state.tf = p.tf;
    if (p.exch) state.exch = p.exch;
    if (p.capital) state.calc.capital = p.capital;
    if (p.riskPct) state.calc.riskPct = p.riskPct;
  } catch (e) { /* storage unavailable */ }
}
function savePrefs() {
  try { chrome.storage.local.set({ tf: state.tf, exch: state.exch, capital: state.calc.capital, riskPct: state.calc.riskPct }); } catch (e) { /* ignore */ }
}

// ---------- Symbol from the active tab ----------
function detectSymbol(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h.endsWith('nseindia.com')) {
      const s = u.searchParams.get('symbol');
      if (s) return { symbol: s.toUpperCase(), exch: 'NSE' };
    }
    if (h.endsWith('tradingview.com')) {
      const q = u.searchParams.get('symbol');
      if (q) {
        const parts = decodeURIComponent(q).split(':');
        if (parts.length === 2) {
          const ex = parts[0].toUpperCase();
          return ex === 'NSE' || ex === 'BSE' ? { symbol: parts[1].toUpperCase(), exch: ex } : null;
        }
        return { symbol: parts[0].toUpperCase(), exch: 'NSE' };
      }
      const m = u.pathname.match(/\/symbols\/([A-Za-z]+)-([^/]+)/);
      if (m && (m[1].toUpperCase() === 'NSE' || m[1].toUpperCase() === 'BSE')) return { symbol: decodeURIComponent(m[2]).toUpperCase(), exch: m[1].toUpperCase() };
    }
    if (h.endsWith('screener.in')) {
      const m = u.pathname.match(/\/company\/([^/]+)/);
      if (m) return { symbol: decodeURIComponent(m[1]).toUpperCase(), exch: 'NSE' };
    }
  } catch (e) { /* not a URL */ }
  return null;
}

async function syncFromActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const d = tab && tab.url ? detectSymbol(tab.url) : null;
    if (d && (d.symbol !== state.symbol || d.exch !== state.exch)) {
      state.symbol = d.symbol; state.exch = d.exch;
      $('sym').value = d.symbol; $('exch').value = d.exch;
      run();
    }
  } catch (e) { /* tabs API not ready */ }
}

// ---------- Run ----------
async function run() {
  if (state.busy) return;
  const sym = $('sym').value.trim();
  if (!sym) { setMsg('Type a stock symbol first.', true); return; }
  state.symbol = sym.toUpperCase();
  state.exch = $('exch').value;
  state.busy = true;
  setView('analyse');
  setMsg('Loading ' + state.symbol + ' ...');
  savePrefs();
  try {
    const ticker = resolveTicker(state.symbol, state.exch);
    const keys = Object.keys(TF);
    const settled = await Promise.allSettled(keys.map((k) => fetchCandles(ticker, k)));
    const by = {};
    let meta = null;
    keys.forEach((k, i) => {
      if (settled[i].status !== 'fulfilled') return;
      const { candles, meta: m } = settled[i].value;
      if (!meta) meta = m;
      try { by[k] = { candles, result: analyze(candles, k) }; } catch (e) { /* too little history on this timeframe */ }
    });
    if (!by[state.tf]) {
      const i = keys.indexOf(state.tf);
      throw (settled[i].status === 'rejected' ? settled[i].reason : new Error('Not enough history on this timeframe.'));
    }
    state.data = { ticker, meta, by };
    resetCalcDefaults(true);
    render();
  } catch (e) {
    setMsg(e.message || 'Something went wrong. Check the symbol and try again.', true);
  } finally {
    state.busy = false;
  }
}
function setMsg(t, err) { $('out').innerHTML = '<p class="msg' + (err ? ' err' : '') + '">' + esc(t) + '</p>'; }

// ---------- Views ----------
function setView(v) {
  state.view = v;
  $('out').hidden = v !== 'analyse';
  $('learn').hidden = v !== 'learn';
  document.body.classList.toggle('learning', v === 'learn');
  document.querySelectorAll('#nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
  if (v === 'analyse' && state.data) paintChart();
}
function goLearn(id) {
  setView('learn');
  const el = $(id);
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

// ---------- Plan maths ----------
function resetCalcDefaults(resetEntry) {
  const { result: r } = cur();
  const c = state.calc;
  if (resetEntry || c.entry == null) c.entry = r.last.c;
  const s = r.support[0];
  const res = r.resistance[0];
  if (c.side === 'long') { c.stop = s ? s.lo - 0.5 * r.atr : null; c.target = res ? res.lo : null; }
  else { c.stop = res ? res.hi + 0.5 * r.atr : null; c.target = s ? s.hi : null; }
}

function planMath() {
  const c = state.calc;
  const { result: r } = cur();
  const long = c.side === 'long';
  const risk = c.stop != null && c.entry != null ? (long ? c.entry - c.stop : c.stop - c.entry) : null;
  const reward = c.target != null && c.entry != null ? (long ? c.target - c.entry : c.entry - c.target) : null;
  const okRisk = risk != null && risk > 0;
  const okReward = reward != null && reward > 0;
  const rr = okRisk && okReward ? reward / risk : null;
  const maxLoss = c.capital * (c.riskPct / 100);
  const qty = okRisk ? Math.floor(maxLoss / risk) : null;
  const want = long ? 'Uptrend' : 'Downtrend';
  const word = long ? 'uptrend' : 'downtrend';
  const trendOf = (k) => (state.data.by[k] ? state.data.by[k].result.trend : 'n/a');
  const checks = [
    { ok: trendOf('1wk') === want, text: 'Weekly ' + word },
    { ok: trendOf('1d') === want, text: 'Daily ' + word },
    { ok: rr != null && rr >= 2, text: 'Reward at least 2x risk' },
    { ok: okRisk && risk <= 2 * r.atr, text: 'Stop within 2 ATR' },
    { ok: (r.setup ? r.setup.breakVol : r.volume && r.volume.ratio) >= 1.3, text: (r.setup ? 'Breakout volume' : 'Volume') + ' 1.3x or more' },
  ];
  return { risk, reward, rr, qty, okRisk, okReward, maxLoss, checks };
}

// ---------- Render helpers ----------
const trendWord = (t) => (t === 'Uptrend' ? 'uptrend' : t === 'Downtrend' ? 'downtrend' : 'sideways');
const arrow = (t) => (t === 'Uptrend' ? '\u25B2' : t === 'Downtrend' ? '\u25BC' : '\u25C6');
const cls = (t) => (t === 'Uptrend' ? 'up' : t === 'Downtrend' ? 'down' : 'flat');

function summary(r) {
  const px = r.last.c;
  const s = r.support[0];
  const res = r.resistance[0];
  const out = [TF[state.tf].label + ' ' + trendWord(r.trend) + '.'];
  if (r.inside) out.push('Price is inside a zone (' + fmt(r.inside.lo) + ' to ' + fmt(r.inside.hi) + ').');
  const bits = [];
  if (res) { const d = ((res.lo - px) / px) * 100; bits.push(d < 0.3 ? 'Price is at resistance ' + fmt(res.mid) : 'Resistance ' + fmt(res.mid) + ' is ' + d.toFixed(1) + '% above'); }
  else bits.push('No resistance zone above');
  if (s) { const d = ((px - s.hi) / px) * 100; bits.push(d < 0.3 ? 'at support ' + fmt(s.mid) : 'support ' + fmt(s.mid) + ' is ' + d.toFixed(1) + '% below'); }
  else bits.push('no support zone below');
  out.push(bits.join('; ') + '.');
  return out.join(' ');
}

function levelCell(z, px, kind) {
  if (!z) return '<td class="lv none">none</td>';
  const d = kind === 'res' ? ((z.lo - px) / px) * 100 : ((px - z.hi) / px) * 100;
  return '<td class="lv ' + kind + '"><b>' + fmt(z.mid) + '</b><small>' + (d < 0.3 ? 'at level' : d.toFixed(1) + '% ' + (kind === 'res' ? 'above' : 'below')) + '</small></td>';
}

function levelsTable() {
  return '<table class="lvls"><thead><tr><th></th><th>Trend</th><th>Support</th><th>Resistance</th></tr></thead><tbody>' +
    Object.keys(TF).map((k) => {
      const e = state.data.by[k];
      if (!e) return '<tr><td>' + TF[k].label + '</td><td colspan="3" class="none">no data</td></tr>';
      const r = e.result;
      return '<tr class="' + (k === state.tf ? 'cur' : '') + '" data-tf="' + k + '"><td>' + TF[k].label + '</td><td class="tr ' + cls(r.trend) + '">' + arrow(r.trend) + '</td>' +
        levelCell(r.support[0], r.last.c, 'sup') + levelCell(r.resistance[0], r.last.c, 'res') + '</tr>';
    }).join('') + '</tbody></table>';
}


function sparkline(v) {
  const max = Math.max(...v.bars.map((b) => b.v), v.avg20 * 2.2);
  const base = 46;
  const bw = 14;
  const gap = (200 - 10 * bw) / 9;
  const ay = base - (v.avg20 / max) * (base - 4);
  let s = '<svg class="spark" viewBox="0 0 200 62" role="img" aria-label="Volume of the last 10 candles against the 20-candle average">';
  v.bars.forEach((b, i) => {
    const h = Math.max((b.v / max) * (base - 4), 1);
    s += '<rect x="' + (i * (bw + gap)).toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="2" fill="' + (b.up ? 'var(--up)' : 'var(--down)') + '" opacity="' + (i === 9 ? 1 : 0.55) + '"/>';
  });
  s += '<line x1="0" x2="200" y1="' + ay.toFixed(1) + '" y2="' + ay.toFixed(1) + '" stroke="var(--ink)" stroke-dasharray="4 3" stroke-width="1" opacity=".6"/>';
  s += '<text x="0" y="60" font-size="8.5" fill="var(--muted)">Last 10 candles. Dashed: 20-candle average.</text></svg>';
  return s;
}

function volumeSection(r) {
  const v = r.volume;
  if (!v || v.ratio == null) return '';
  const sc = v.key ? VOLUME_TEXT[v.key] : null;
  const ud = v.upDown != null ? 'Up-candle volume is ' + v.upDown.toFixed(1) + 'x down-candle volume over the last 10 candles. ' : '';
  return '<section><h2>Volume</h2><div class="volhead"><b>' + v.ratio.toFixed(1) + 'x</b><span class="band ' + v.band.toLowerCase() + '">' + v.band + '</span><span>of the 20-candle average</span></div>' + sparkline(v) +
    (sc ? '<div class="vsc"><b>' + esc(sc.name) + '</b><p>' + esc(sc.meaning + (v.detail ? ' ' + v.detail : '')) + '</p><p class="chk">Check: ' + esc(sc.check) + '</p><button type="button" class="link" data-learn="vol-' + v.key + '">See the diagram</button></div>' : '') +
    '<p class="note">' + ud + 'The latest candle can still be forming during market hours.</p></section>';
}

function setupSection(r) {
  const s = r.setup;
  if (!s) return '';
  const st = s.stage;
  const steps = [
    { t: 'Base', c: 'done' },
    { t: s.dir > 0 ? 'Breakout' : 'Breakdown', c: 'done' },
    { t: 'Retest', c: st === 'held' ? 'done' : st === 'retesting' ? 'now' : st === 'failed' ? 'fail' : 'todo' },
  ];
  const vb = s.breakVol != null ? s.breakVol.toFixed(1) + 'x' : 'n/a';
  const fact = (k, v) => '<div><span>' + k + '</span><b>' + v + '</b></div>';
  return '<section><h2>' + esc(s.name) + '</h2><div class="stepper">' +
    steps.map((x) => '<div class="stp ' + x.c + '"><i>' + (x.c === 'done' ? '\u2713' : x.c === 'fail' ? '\u2715' : '') + '</i><span>' + x.t + '</span></div>').join('') + '</div>' +
    '<p class="note" style="margin-top:6px">' + esc(s.detail) + '</p>' +
    '<div class="facts">' + fact('Level', fmt(s.level)) + fact('Volume on breakout', vb) + fact('Candles since breakout', s.barsSince) +
    fact('Retest extreme', s.extreme != null ? fmt(s.extreme) : '-') + fact('Measured move', fmt(s.measured)) + fact('Stop reference', fmt(s.stopRef)) + '</div>' +
    '<button type="button" class="ghost" id="useSetup"' + (st === 'failed' ? ' disabled' : '') + '>Use these levels in the plan</button>' +
    '<p class="note">Measured move adds the base height to the level. Stop reference sits half an ATR beyond the retest. Delivery % and FII trend are not included (price and volume only).</p></section>';
}

// ---------- Main render ----------
function render() {
  const d = state.data;
  const { candles, result: r } = cur();
  const prev = candles[candles.length - 2];
  const chg = prev ? ((r.last.c - prev.c) / prev.c) * 100 : 0;
  const rs = d.ticker.startsWith('^') ? '' : '\u20B9';
  const name = (d.meta && (d.meta.longName || d.meta.shortName)) || d.ticker;
  const ss = r.swingStats;
  const swing = ss.medianBars != null
    ? 'A typical ' + TF[state.tf].label.toLowerCase() + ' swing here lasted ' + formatDuration(ss.medianBars, state.tf) + ' and moved ' + ss.medianMovePct.toFixed(1) + '% (past data).'
    : '';
  const chips = r.patterns.slice(0, 2).map((p) => '<button type="button" class="pchip ' + p.bias + '" data-learn="pat-' + p.key + '">' + esc(p.name) + '</button>').join('');

  $('out').innerHTML =
    '<div class="hero"><div class="hero-top"><div><div class="sym">' + esc(state.symbol) + '<span class="exch">' + esc(state.exch) + '</span></div><div class="nm">' + esc(name) + '</div></div>' +
    '<span class="chip ' + cls(r.trend) + '">' + arrow(r.trend) + ' ' + esc(r.trend) + '</span></div>' +
    '<div class="hero-price"><span class="big">' + rs + fmt(r.last.c) + '</span><span class="chg ' + (chg >= 0 ? 'up' : 'down') + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span></div>' +
    '<p class="story">' + esc(summary(r)) + '</p></div>' +

    '<div class="chartwrap"><div class="chartbar"><div class="chips">' + chips + '</div><button type="button" class="expand" id="fullBtn">Full chart</button></div>' +
    '<canvas id="chart" role="img" aria-label="Candlestick chart with one support and one resistance zone"></canvas></div>' +

    setupSection(r) +
    '<section><h2>Key levels</h2>' + levelsTable() + (swing ? '<p class="note">' + esc(swing) + ' ATR ' + rs + fmt(r.atr) + ' (' + ((r.atr / r.last.c) * 100).toFixed(1) + '%).</p>' : '') + '</section>' +

    volumeSection(r) +
    '<section><h2>Trade plan</h2><div id="calcBox"></div></section>';

  renderCalc();
  paintChart();
}

function renderCalc() {
  const box = $('calcBox');
  if (!box) return;
  const c = state.calc;
  const o = planMath();
  const keep = document.activeElement && document.activeElement.id;
  const rs = state.data.ticker.startsWith('^') ? '' : '\u20B9';
  const met = o.checks.filter((x) => x.ok).length;

  let rr = '<p class="note">Enter a valid stop and target to see reward and risk.</p>';
  if (o.okRisk && o.okReward) {
    const t = o.risk + o.reward;
    rr = '<div class="rrtrack"><div class="rk" style="flex:' + o.risk / t + '">' + rs + fmt(o.risk) + '</div><div class="rw" style="flex:' + o.reward / t + '">' + rs + fmt(o.reward) + '</div></div>' +
      '<div class="rrbig"><b>' + o.rr.toFixed(2) + ' : 1</b><span>reward to risk</span></div>';
  }

  box.innerHTML =
    '<div class="seg" role="group" aria-label="Direction"><button type="button" class="buy" data-side="long" aria-pressed="' + (c.side === 'long') + '">Buy</button><button type="button" class="sell" data-side="short" aria-pressed="' + (c.side === 'short') + '">Sell</button></div>' +
    '<div class="fields"><label>Entry<input id="cEntry" inputmode="decimal" value="' + (c.entry != null ? c.entry.toFixed(2) : '') + '"></label>' +
    '<label class="stop">Stop<input id="cStop" inputmode="decimal" value="' + (c.stop != null ? c.stop.toFixed(2) : '') + '"></label>' +
    '<label class="target">Target<input id="cTarget" inputmode="decimal" value="' + (c.target != null ? c.target.toFixed(2) : '') + '"></label></div>' +
    rr +
    '<div class="fields two"><label>Capital (Rs)<input id="cCap" inputmode="numeric" value="' + c.capital + '"></label><label>Risk per trade (%)<input id="cRisk" inputmode="decimal" value="' + c.riskPct + '"></label></div>' +
    '<p class="qty">' + (o.qty != null ? '<b>' + o.qty + ' shares</b> keep your loss near Rs ' + fmt(o.maxLoss, 0) : 'Set a valid stop to size the position') + '</p>' +
    '<div class="checkrow" aria-label="Chart conditions"><span class="cnt">' + met + '/' + o.checks.length + '</span>' +
    o.checks.map((x) => '<span class="ck ' + (x.ok ? 'ok' : '') + '">' + (x.ok ? '\u2713 ' : '') + esc(x.text) + '</span>').join('') + '</div>' +
    '<p class="note">Swing time check: review the trade if price is still short of the target after 10 candles.</p>';

  const num = (id) => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
  const bind = (id, fn) => $(id).addEventListener('change', () => { fn(); savePrefs(); renderCalc(); paintChart(); });
  bind('cEntry', () => { state.calc.entry = num('cEntry'); });
  bind('cStop', () => { state.calc.stop = num('cStop'); });
  bind('cTarget', () => { state.calc.target = num('cTarget'); });
  bind('cCap', () => { state.calc.capital = num('cCap') || 100000; });
  bind('cRisk', () => { state.calc.riskPct = num('cRisk') || 1; });
  box.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => {
    state.calc.side = b.dataset.side; resetCalcDefaults(false); renderCalc(); paintChart();
  }));
  if (keep && $(keep)) $(keep).focus();
}

function paintChart() {
  const cv = $('chart');
  if (!cv || !state.data) return;
  const { candles, result } = cur();
  drawChart(cv, { candles, result, calc: state.calc, tf: state.tf, bars: 70, full: false });
}

// ---------- Full chart tab ----------
async function openFull() {
  const payload = {
    symbol: state.symbol, exch: state.exch, tf: state.tf, calc: state.calc, ticker: state.data.ticker,
    name: (state.data.meta && (state.data.meta.longName || state.data.meta.shortName)) || state.symbol,
    by: state.data.by,
  };
  try {
    await chrome.storage.local.set({ fullChart: payload });
    chrome.tabs.create({ url: chrome.runtime.getURL('chart.html') });
  } catch (e) {
    setMsg('Could not open the full chart: ' + e.message, true);
  }
}

// ---------- Learn ----------
function buildLearn() {
  const tiles = PATTERN_ORDER.map((k) => {
    const p = PATTERNS[k];
    return '<article class="lcard" id="pat-' + k + '">' + p.svg + '<div><h3>' + esc(p.name) + '<span class="badge ' + p.bias + '">' + BIAS[p.bias] + '</span></h3><p>' + esc(p.look) + '</p><p class="fail"><b>Fails if:</b> ' + esc(p.fail) + '</p></div></article>';
  }).join('');
  const ideas = Object.keys(CONCEPTS).map((k) => {
    const c = CONCEPTS[k];
    return '<article class="lcard" id="c-' + k + '">' + c.svg + '<div><h3>' + esc(c.title) + '</h3><p>' + esc(c.body) + '</p></div></article>';
  }).join('');
  const vols = VOLUME_ORDER.map((k) => {
    const t = VOLUME_TEXT[k];
    return '<article class="lcard" id="vol-' + k + '">' + VOLUME_PATTERNS[k].svg + '<div><h3>' + esc(t.name) + '</h3><p>' + esc(t.meaning) + '</p><p class="fail"><b>Check:</b> ' + esc(t.check) + '</p></div></article>';
  }).join('');
  $('learn').innerHTML =
    '<section><h2>Chart patterns</h2><p class="lede">Shapes found by fixed rules. They describe the past and do not predict.</p>' + tiles + '</section>' +
    '<section><h2>Volume patterns</h2><p class="lede">Volume is compared with its 20-candle average: under 0.7x quiet, to 1.3x normal, to 2x elevated, above 2x exceptional. It never shows direction by itself; read it with what price did on those candles.</p>' + vols + '</section>' +
    '<section><h2>Two ideas</h2>' + ideas + '</section>' +
    '<section><h2>' + esc(DATA_NOTES.title) + '</h2><p class="lede">' + esc(DATA_NOTES.text) + '</p></section>';
}

function welcome() {
  $('out').innerHTML = '<div class="welcome"><h1>Swing levels in one glance</h1><p>Open a stock on NSE, Screener or TradingView, or type a symbol above.</p>' + PATTERNS.double_bottom.svg + '</div>';
}

// ---------- Wire up ----------
function buildTabs() {
  const el = $('tfTabs');
  el.innerHTML = '';
  Object.keys(TF).forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === state.tf));
    b.textContent = TF[k].label;
    b.addEventListener('click', () => {
      state.tf = k;
      buildTabs();
      savePrefs();
      if (state.data && state.data.by[k]) { resetCalcDefaults(false); render(); }
      else if ($('sym').value.trim()) run();
    });
    el.appendChild(b);
  });
}

async function init() {
  await loadPrefs();
  $('exch').value = state.exch;
  buildTabs();
  buildLearn();
  welcome();
  document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
  $('out').addEventListener('click', (e) => {
    const l = e.target.closest('[data-learn]');
    if (l) return goLearn(l.dataset.learn);
    if (e.target.closest('#fullBtn')) return openFull();
    if (e.target.closest('#useSetup')) {
      const { result: rr } = cur();
      const s = rr.setup;
      if (!s || s.stage === 'failed') return;
      state.calc.side = s.dir > 0 ? 'long' : 'short';
      state.calc.entry = rr.last.c;
      state.calc.stop = s.stopRef;
      state.calc.target = s.measured;
      renderCalc(); paintChart();
      $('calcBox').scrollIntoView({ block: 'start' });
      return;
    }
    const row = e.target.closest('tr[data-tf]');
    if (row && row.dataset.tf !== state.tf) { state.tf = row.dataset.tf; buildTabs(); savePrefs(); resetCalcDefaults(false); render(); }
  });
  $('symForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  window.addEventListener('resize', () => paintChart());
  try {
    chrome.tabs.onActivated.addListener(syncFromActiveTab);
    chrome.tabs.onUpdated.addListener((id, info) => { if (info.url || info.status === 'complete') syncFromActiveTab(); });
  } catch (e) { /* tabs API unavailable */ }
  await syncFromActiveTab();
}
init();
