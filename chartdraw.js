// Shared canvas chart. Mini mode (side panel) and full mode (own tab, with plan boxes, grid, dates, hover).

const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const nf = (n, d = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });

export function fmtDate(t, tf) {
  const o = { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' };
  if (tf === '1h') { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
  return new Date(t).toLocaleString('en-IN', o);
}

// o: { candles, result, calc, tf, bars, full, hover }
export function drawChart(cv, o) {
  const W = cv.clientWidth;
  const H = cv.clientHeight;
  if (!W || !H) return null;
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);

  const full = !!o.full;
  const all = o.candles;
  const n = Math.min(o.bars || 80, all.length);
  const bars = all.slice(-n);
  const off = all.length - n;
  const r = o.result;
  const c = o.calc || {};
  const padR = full ? 116 : 50;
  const padT = 12;
  const padB = full ? 26 : 8;
  const slots = full ? n + Math.round(n * 0.22) : n; // empty room right of the last candle for the plan
  const plotW = W - padR;
  const cw = plotW / slots;
  const xi = (i) => Math.max((i - off + 0.5) * cw, 0);

  let lo = Math.min(...bars.map((b) => b.l));
  let hi = Math.max(...bars.map((b) => b.h));
  [c.entry, c.stop, c.target].forEach((v) => { if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
  const span = hi - lo || 1;
  lo -= span * 0.05;
  hi += span * 0.05;
  const y = (p) => padT + ((hi - p) / (hi - lo)) * (H - padT - padB);

  const up = cssVar('--up');
  const down = cssVar('--down');
  const muted = cssVar('--muted');
  const accent = cssVar('--accent');
  const ink = cssVar('--ink');
  const rule = cssVar('--rule');
  const surface = cssVar('--surface');
  const paper = cssVar('--paper');
  const fs = full ? 12 : 10;
  const sans = 'system-ui, sans-serif';

  // grid + price axis
  g.font = fs + 'px ' + sans;
  g.textAlign = 'left';
  for (let i = 0; i <= 4; i++) {
    const p = lo + ((hi - lo) * i) / 4;
    if (full) {
      g.strokeStyle = rule;
      g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(0, y(p)); g.lineTo(plotW, y(p)); g.stroke();
      g.globalAlpha = 1;
    }
    g.fillStyle = muted;
    g.fillText(p.toFixed(p > 1000 ? 0 : 1), plotW + 5, y(p) + 3);
  }

  // support / resistance bands (one each)
  const band = (z, fill, stroke, label) => {
    const t = Math.max(y(Math.min(z.hi, hi)), padT);
    const b = Math.min(y(Math.max(z.lo, lo)), H - padB);
    if (b < padT || t > H - padB) return;
    const hgt = Math.max(b - t, 2);
    g.fillStyle = fill;
    g.fillRect(0, t, plotW, hgt);
    g.strokeStyle = stroke;
    g.globalAlpha = 0.6;
    g.beginPath(); g.moveTo(0, t); g.lineTo(plotW, t); g.moveTo(0, t + hgt); g.lineTo(plotW, t + hgt); g.stroke();
    g.globalAlpha = 1;
    if (full) {
      g.fillStyle = stroke;
      g.font = '600 ' + fs + 'px ' + sans;
      g.textAlign = 'left';
      g.fillText(label + ' ' + nf(z.lo) + ' - ' + nf(z.hi), 8, t + (label === 'Resistance' ? hgt + 13 : -4));
    }
  };
  r.support.forEach((z) => band(z, cssVar('--sup-bg'), up, 'Support'));
  r.resistance.forEach((z) => band(z, cssVar('--res-bg'), down, 'Resistance'));

  // candles
  bars.forEach((b, i) => {
    const x = i * cw + cw / 2;
    const col = b.c >= b.o ? up : down;
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y(b.h)); g.lineTo(x, y(b.l)); g.stroke();
    const top = y(Math.max(b.o, b.c));
    const bot = y(Math.min(b.o, b.c));
    g.fillRect(x - Math.max(cw * 0.34, 0.8), top, Math.max(cw * 0.68, 1.6), Math.max(bot - top, 1));
  });

  // pattern overlays
  g.font = '600 ' + fs + 'px ' + sans;
  r.patterns.forEach((p) => {
    if (!p.draw) return;
    p.draw.segs.forEach((s) => {
      if (s.i2 < off) return;
      g.save();
      g.strokeStyle = accent;
      g.lineWidth = full ? 2 : 1.8;
      if (s.k === 'level') g.setLineDash([5, 3]);
      g.beginPath(); g.moveTo(xi(s.i1), y(s.p1)); g.lineTo(xi(s.i2), y(s.p2)); g.stroke();
      g.restore();
      if (s.label === 'Neckline' && s.i1 >= off) {
        g.fillStyle = accent;
        g.textAlign = 'left';
        g.fillText('Neckline', xi(s.i1) + 4, y(s.p1) - 5);
      }
    });
    p.draw.pts.forEach((pt) => {
      if (pt.i < off) return;
      g.fillStyle = surface;
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath(); g.arc(xi(pt.i), y(pt.p), 4, 0, Math.PI * 2); g.fill(); g.stroke();
    });
  });

  // plan: boxes in full mode, dashed lines + tags in mini mode
  const long = c.side !== 'short';
  const tag = (v, text, col, x) => {
    g.font = '700 ' + fs + 'px ' + sans;
    const tw = g.measureText(text).width + 10;
    g.fillStyle = col;
    g.beginPath(); g.roundRect(x, y(v) - 8, tw, 16, 5); g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.fillText(text, x + 5, y(v) + fs * 0.35);
  };
  if (full && c.entry != null) {
    const x0 = (n - 1) * cw + cw / 2;
    const x1 = plotW;
    const box = (a, b, col, text) => {
      if (a == null || b == null) return;
      const t = Math.min(y(a), y(b));
      const h = Math.abs(y(a) - y(b));
      g.fillStyle = col;
      g.globalAlpha = 0.2;
      g.fillRect(x0, t, x1 - x0, h);
      g.globalAlpha = 1;
      g.strokeStyle = col;
      g.lineWidth = 1.2;
      g.strokeRect(x0, t, x1 - x0, h);
      g.fillStyle = col;
      g.font = '700 ' + fs + 'px ' + sans;
      g.textAlign = 'left';
      g.fillText(text, x0 + 8, t + (h > 30 ? 18 : h / 2 + 4));
    };
    const pct = (v) => (((v - c.entry) / c.entry) * 100);
    if (c.target != null) box(c.entry, c.target, up, 'Reward ' + nf(Math.abs(c.target - c.entry)) + ' (' + (pct(c.target) >= 0 ? '+' : '') + pct(c.target).toFixed(1) + '%)');
    if (c.stop != null) box(c.entry, c.stop, down, 'Risk ' + nf(Math.abs(c.entry - c.stop)) + ' (' + (pct(c.stop) >= 0 ? '+' : '') + pct(c.stop).toFixed(1) + '%)');
    g.save();
    g.setLineDash([6, 4]);
    g.strokeStyle = accent;
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(0, y(c.entry)); g.lineTo(plotW, y(c.entry)); g.stroke();
    g.restore();
    if (c.target != null) tag(c.target, 'Target ' + nf(c.target), up, plotW + 2 - 0);
    tag(c.entry, 'Entry ' + nf(c.entry), accent, plotW + 2 - 0);
    if (c.stop != null) tag(c.stop, 'Stop ' + nf(c.stop), down, plotW + 2 - 0);
  } else {
    const lvl = (v, label, col) => {
      if (v == null) return;
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = col;
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, y(v)); g.lineTo(plotW, y(v)); g.stroke();
      g.restore();
      g.font = '700 ' + fs + 'px ' + sans;
      const tw = g.measureText(label).width + 10;
      tag(v, label, col, plotW - tw - 2);
    };
    lvl(c.entry, 'Entry', accent);
    lvl(c.stop, 'Stop', down);
    lvl(c.target, 'Target', up);
  }

  // last price tag (skipped in full mode when a plan tag already sits at the same height)
  const last = all[all.length - 1];
  const ly = y(last.c);
  const clash = full && [c.entry, c.stop, c.target].some((v) => v != null && Math.abs(y(v) - ly) < 18);
  if (!clash) {
    g.fillStyle = ink;
    g.beginPath(); g.roundRect(plotW + 1, ly - 8, full ? 62 : padR - 2, 16, 4); g.fill();
    g.fillStyle = paper;
    g.font = '600 ' + fs + 'px ' + sans;
    g.textAlign = 'left';
    g.fillText(last.c.toFixed(last.c > 1000 ? 0 : 1), plotW + 4, ly + fs * 0.35);
  }

  // date axis (full)
  if (full) {
    g.fillStyle = muted;
    g.font = fs + 'px ' + sans;
    g.textAlign = 'center';
    const step = Math.max(Math.floor(n / 6), 1);
    for (let i = step; i < n; i += step) g.fillText(fmtDate(bars[i].t, o.tf), i * cw + cw / 2, H - 8);
  }

  // hover crosshair (full)
  if (full && o.hover != null && o.hover >= 0 && o.hover < n) {
    const b = bars[o.hover];
    const x = o.hover * cw + cw / 2;
    g.strokeStyle = muted;
    g.globalAlpha = 0.6;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x, padT); g.lineTo(x, H - padB); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 1;
    const vol = b.v >= 1e7 ? (b.v / 1e7).toFixed(2) + ' Cr' : b.v >= 1e5 ? (b.v / 1e5).toFixed(2) + ' L' : String(Math.round(b.v));
    const text = fmtDate(b.t, o.tf) + '   O ' + nf(b.o) + '   H ' + nf(b.h) + '   L ' + nf(b.l) + '   C ' + nf(b.c) + '   Vol ' + vol;
    g.font = '600 ' + fs + 'px ' + sans;
    const tw = g.measureText(text).width + 16;
    g.fillStyle = ink;
    g.beginPath(); g.roundRect(8, padT, tw, 22, 6); g.fill();
    g.fillStyle = paper;
    g.textAlign = 'left';
    g.fillText(text, 16, padT + 15);
  }
  return { cw, n };
}
