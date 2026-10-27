import { drawChart } from './chartdraw.js';

const $ = (id) => document.getElementById(id);
const LABEL = { '1wk': 'Weekly', '1d': 'Daily', '1h': '1 Hour' };
const nf = (n, d = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
let P = null;
let tf = '1d';
let hover = null;
let geo = null;

function plan() {
  const c = P.calc;
  const long = c.side !== 'short';
  const risk = c.stop != null && c.entry != null ? (long ? c.entry - c.stop : c.stop - c.entry) : null;
  const reward = c.target != null && c.entry != null ? (long ? c.target - c.entry : c.entry - c.target) : null;
  const rr = risk > 0 && reward > 0 ? reward / risk : null;
  const pct = (v) => (((v - c.entry) / c.entry) * 100).toFixed(1) + '%';
  const pill = (cls, k, v, sub) => '<div class="pill ' + cls + '"><small>' + k + '</small><b>' + v + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
  let h = pill('', long ? 'Buy' : 'Sell', c.entry != null ? nf(c.entry) : '-', 'entry');
  if (c.stop != null) h += pill('s', 'Stop', nf(c.stop), pct(c.stop));
  if (c.target != null) h += pill('t', 'Target', nf(c.target), pct(c.target));
  if (rr) h += pill('', 'Reward : risk', rr.toFixed(2) + ' : 1', '');
  $('fplan').innerHTML = h;
}

function paint() {
  const e = P.by[tf];
  if (!e) return;
  geo = drawChart($('big'), { candles: e.candles, result: e.result, calc: P.calc, tf, bars: tf === '1h' ? 140 : 110, full: true, hover });
}

function buildTabs() {
  const el = $('ftabs');
  el.innerHTML = '';
  ['1wk', '1d', '1h'].forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(k === tf));
    b.textContent = LABEL[k];
    b.disabled = !P.by[k];
    b.addEventListener('click', () => { tf = k; hover = null; buildTabs(); paint(); });
    el.appendChild(b);
  });
}

async function init() {
  let data = null;
  try { data = (await chrome.storage.local.get('fullChart')).fullChart; } catch (e) { /* ignore */ }
  if (!data) { $('fnote').textContent = 'Nothing to show yet. Analyse a stock in the side panel and press Full chart.'; return; }
  P = data;
  tf = P.tf;
  $('fsym').textContent = P.symbol + ' ' + P.exch;
  $('fname').textContent = P.name;
  plan();
  buildTabs();
  $('fnote').textContent = 'Plan levels come from the numbers you set in the side panel. Hover over a candle for its prices. Information only, not a recommendation.';
  const cv = $('big');
  cv.addEventListener('mousemove', (ev) => {
    if (!geo) return;
    const i = Math.floor(ev.offsetX / geo.cw);
    const nh = i >= 0 && i < geo.n ? i : null;
    if (nh !== hover) { hover = nh; paint(); }
  });
  cv.addEventListener('mouseleave', () => { hover = null; paint(); });
  window.addEventListener('resize', paint);
  paint();
}
init();
