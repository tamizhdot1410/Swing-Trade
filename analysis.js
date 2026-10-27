// ChartSense India - analysis engine.
// All outputs are deterministic, rule-based calculations on historical prices.
// Nothing here is a recommendation.

export const TF = {
  '1wk': { interval: '1wk', range: '5y', label: 'Weekly', k: 3, next: null },
  '1d': { interval: '1d', range: '1y', label: 'Daily', k: 5, next: '1wk' },
  '1h': { interval: '60m', range: '6mo', label: '1 Hour', k: 5, next: '1d' },
};

const INDEX_MAP = {
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  NIFTYBANK: '^NSEBANK',
  SENSEX: '^BSESN',
};

export function resolveTicker(symbol, exch) {
  const s = symbol.trim().toUpperCase();
  if (INDEX_MAP[s]) return INDEX_MAP[s];
  if (s.startsWith('^') || s.includes('.')) return s;
  return s + (exch === 'BSE' ? '.BO' : '.NS');
}

// ---------- Data (prototype source: Yahoo Finance, delayed, unofficial) ----------
export async function fetchCandles(ticker, tfKey) {
  const c = TF[tfKey];
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(ticker) +
    '?interval=' + c.interval + '&range=' + c.range + '&includePrePost=false';
  const r = await fetch(url);
  if (r.status === 404) throw new Error('Symbol not found: ' + ticker);
  if (!r.ok) throw new Error('Data request failed (' + r.status + '). Try again in a moment.');
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) throw new Error('No price data for ' + ticker);
  const q = res.indicators.quote[0];
  const candles = [];
  res.timestamp.forEach((t, i) => {
    if (q.open[i] != null && q.high[i] != null && q.low[i] != null && q.close[i] != null) {
      candles.push({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
    }
  });
  return { candles, meta: res.meta };
}

// ---------- Indicators ----------
export function atr(c, n = 14) {
  if (c.length < n + 1) return null;
  const tr = [];
  for (let i = 1; i < c.length; i++) {
    const pc = c[i - 1].c;
    tr.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - pc), Math.abs(c[i].l - pc)));
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export function ema(values, n) {
  const k = 2 / (n + 1);
  const out = [];
  let prev = values[0];
  values.forEach((v, i) => {
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

export function trendOf(candles) {
  const n = candles.length;
  if (n < 55) return 'n/a';
  const closes = candles.map((x) => x.c);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const lc = closes[n - 1];
  const slope50 = e50[n - 1] - e50[n - 11];
  if (lc > e20[n - 1] && e20[n - 1] > e50[n - 1] && slope50 > 0) return 'Uptrend';
  if (lc < e20[n - 1] && e20[n - 1] < e50[n - 1] && slope50 < 0) return 'Downtrend';
  return 'Sideways / mixed';
}

// ---------- Swings & zones ----------
export function swings(c, k) {
  const pts = [];
  for (let i = k; i < c.length - k; i++) {
    let hi = true;
    let lo = true;
    for (let j = 1; j <= k; j++) {
      if (!(c[i].h > c[i - j].h && c[i].h >= c[i + j].h)) hi = false;
      if (!(c[i].l < c[i - j].l && c[i].l <= c[i + j].l)) lo = false;
    }
    if (hi) pts.push({ i, type: 'H', p: c[i].h });
    if (lo) pts.push({ i, type: 'L', p: c[i].l });
  }
  return pts;
}

export function buildZones(sw, tol, lastIdx, minW = 0) {
  const s = [...sw].sort((a, b) => a.p - b.p);
  const cl = [];
  for (const x of s) {
    const last = cl[cl.length - 1];
    if (last && x.p - last.lo <= tol * 1.5) last.pts.push(x);
    else cl.push({ lo: x.p, pts: [x] });
  }
  return cl.map((z) => {
    const ps = z.pts.map((p) => p.p);
    let lo = Math.min(...ps);
    let hi = Math.max(...ps);
    const lastTouch = Math.max(...z.pts.map((p) => p.i));
    const mid = (lo + hi) / 2;
    if (hi - lo < minW) { lo = mid - minW / 2; hi = mid + minW / 2; } // a zone is a band, never a hairline
    return { lo, hi, mid, touches: z.pts.length, recency: lastTouch / lastIdx };
  });
}

function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function line(a, b) {
  const m = (b.p - a.p) / (b.i - a.i);
  return (i) => a.p + m * (i - a.i);
}

// ---------- Patterns (simple, rule-based; detection is not a forecast) ----------
// Each pattern carries `draw` (segments and points in candle-index/price space) so the chart can overlay it.
function detectPatterns(c, sw, A, relVol) {
  const n = c.length;
  const out = [];
  const lc = c[n - 1].c;
  const H = sw.filter((s) => s.type === 'H');
  const L = sw.filter((s) => s.type === 'L');

  // Double top
  if (H.length >= 2) {
    const [h1, h2] = H.slice(-2);
    const avg = (h1.p + h2.p) / 2;
    if (Math.abs(h1.p - h2.p) / avg <= 0.015 && h2.i - h1.i >= 8 && h2.i >= n - 70) {
      const trough = Math.min(...c.slice(h1.i, h2.i + 1).map((x) => x.l));
      if (avg - trough >= 1.5 * A && lc < avg) {
        out.push({
          key: 'double_top', name: 'Double top', bias: 'bearish',
          detail: 'Two highs near ' + avg.toFixed(2) + '. Neckline ' + trough.toFixed(2) +
            (lc < trough ? ' - price is below it.' : ' - not broken yet.'),
          draw: {
            segs: [
              { i1: h1.i, p1: h1.p, i2: h2.i, p2: h2.p, k: 'trend' },
              { i1: h1.i, p1: trough, i2: n - 1, p2: trough, k: 'level', label: 'Neckline' },
            ],
            pts: [{ i: h1.i, p: h1.p }, { i: h2.i, p: h2.p }],
          },
        });
      }
    }
  }
  // Double bottom
  if (L.length >= 2) {
    const [l1, l2] = L.slice(-2);
    const avg = (l1.p + l2.p) / 2;
    if (Math.abs(l1.p - l2.p) / avg <= 0.015 && l2.i - l1.i >= 8 && l2.i >= n - 70) {
      const peak = Math.max(...c.slice(l1.i, l2.i + 1).map((x) => x.h));
      if (peak - avg >= 1.5 * A && lc > avg) {
        out.push({
          key: 'double_bottom', name: 'Double bottom', bias: 'bullish',
          detail: 'Two lows near ' + avg.toFixed(2) + '. Neckline ' + peak.toFixed(2) +
            (lc > peak ? ' - price is above it.' : ' - not broken yet.'),
          draw: {
            segs: [
              { i1: l1.i, p1: l1.p, i2: l2.i, p2: l2.p, k: 'trend' },
              { i1: l1.i, p1: peak, i2: n - 1, p2: peak, k: 'level', label: 'Neckline' },
            ],
            pts: [{ i: l1.i, p: l1.p }, { i: l2.i, p: l2.p }],
          },
        });
      }
    }
  }
  // Triangles
  const rh = H.filter((s) => s.i >= n - 90).slice(-3);
  const rl = L.filter((s) => s.i >= n - 90).slice(-3);
  if (rh.length >= 2 && rl.length >= 2) {
    const up = line(rh[0], rh[rh.length - 1]);
    const lo = line(rl[0], rl[rl.length - 1]);
    const i0 = Math.max(rh[0].i, rl[0].i);
    const i1 = n - 1;
    if (i1 - i0 >= 10) {
      const w0 = up(i0) - lo(i0);
      const w1 = up(i1) - lo(i1);
      const dH = (up(i1) - up(i0)) / A;
      const dL = (lo(i1) - lo(i0)) / A;
      const inside = lc <= up(i1) + A && lc >= lo(i1) - A;
      if (w0 > 0 && w1 > 0 && w1 < w0 * 0.75 && inside) {
        let key = null;
        let name = null;
        let bias = 'neutral';
        if (Math.abs(dH) <= 1 && dL >= 1) { key = 'asc_triangle'; name = 'Ascending triangle'; bias = 'bullish'; }
        else if (Math.abs(dL) <= 1 && dH <= -1) { key = 'desc_triangle'; name = 'Descending triangle'; bias = 'bearish'; }
        else if (dH <= -1 && dL >= 1) { key = 'sym_triangle'; name = 'Symmetrical triangle'; }
        if (key) {
          out.push({
            key, name, bias,
            detail: 'Upper line ~' + up(i1).toFixed(2) + ', lower line ~' + lo(i1).toFixed(2) + ' now.',
            draw: {
              segs: [
                { i1: i0, p1: up(i0), i2: i1, p2: up(i1), k: 'trend' },
                { i1: i0, p1: lo(i0), i2: i1, p2: lo(i1), k: 'trend' },
              ],
              pts: [],
            },
          });
        }
      }
    }
  }
  // Tight range
  const w = c.slice(-20);
  const rHi = Math.max(...w.map((x) => x.h));
  const rLo = Math.min(...w.map((x) => x.l));
  if (rHi - rLo <= 3 * A) {
    out.push({
      key: 'consolidation', name: 'Tight consolidation', bias: 'neutral',
      detail: 'Last 20 candles held ' + rLo.toFixed(2) + ' to ' + rHi.toFixed(2) +
        ' (' + (((rHi - rLo) / lc) * 100).toFixed(1) + '% wide).',
      draw: {
        segs: [
          { i1: n - 20, p1: rHi, i2: n - 1, p2: rHi, k: 'level' },
          { i1: n - 20, p1: rLo, i2: n - 1, p2: rLo, k: 'level' },
        ],
        pts: [],
      },
    });
  }
  // 20-candle breakout / breakdown
  const prev = c.slice(-21, -1);
  const pHi = Math.max(...prev.map((x) => x.h));
  const pLo = Math.min(...prev.map((x) => x.l));
  const vtxt = relVol != null ? ' Volume ' + relVol.toFixed(1) + 'x its 20-candle average.' : '';
  if (lc > pHi) {
    out.push({
      key: 'breakout', name: 'Closed above 20-candle high', bias: 'bullish', detail: 'Prior high ' + pHi.toFixed(2) + '.' + vtxt,
      draw: { segs: [{ i1: n - 21, p1: pHi, i2: n - 1, p2: pHi, k: 'level', label: 'Prior high' }], pts: [] },
    });
  }
  if (lc < pLo) {
    out.push({
      key: 'breakdown', name: 'Closed below 20-candle low', bias: 'bearish', detail: 'Prior low ' + pLo.toFixed(2) + '.' + vtxt,
      draw: { segs: [{ i1: n - 21, p1: pLo, i2: n - 1, p2: pLo, k: 'level', label: 'Prior low' }], pts: [] },
    });
  }
  return out;
}

// ---------- Volume analysis (ratio bands + seven scenarios) ----------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const band = (r) => (r == null ? 'n/a' : r < 0.7 ? 'Quiet' : r < 1.3 ? 'Normal' : r <= 2 ? 'Elevated' : 'Exceptional');

function ratioAt(c, i) {
  const prior = c.slice(Math.max(0, i - 20), i).map((x) => x.v);
  const avg = mean(prior);
  return avg > 0 ? c[i].v / avg : null;
}

export const VOLUME_TEXT = {
  flat: { name: 'Flat volume', meaning: 'Nothing unusual. No conviction building either way.', check: 'A breakout on flat volume is less trustworthy.' },
  rising: { name: 'Rising volume', meaning: 'Interest and conviction are building.', check: 'Is price also breaking a level as volume climbs?' },
  falling: { name: 'Falling volume', meaning: 'Interest is fading. In a rally this can mean the move is running out of fuel.', check: 'Is price still rising while volume fades?' },
  spike: { name: 'Single volume spike', meaning: 'A one-off event such as news or a block deal.', check: 'Did price hold the new level afterwards?' },
  choppy: { name: 'Choppy volume', meaning: 'Ambiguous on its own.', check: 'Were the high-volume days mostly up days or down days?' },
  highvol_flat: { name: 'High volume, flat price', meaning: 'Buyers and sellers are fighting and neither is winning. Often seen before a bigger move.', check: 'Which way does price leave its range?' },
  lowvol_bigmove: { name: 'Low volume, big move', meaning: 'Thin participation behind a large move. Easier to reverse.', check: 'Does volume pick up on the next candles?' },
};

export function volumeInfo(c, A) {
  const n = c.length;
  const last = c[n - 1];
  const avg20 = mean(c.slice(-21, -1).map((x) => x.v));
  const ratio = avg20 > 0 ? last.v / avg20 : null;
  const idx5 = [n - 5, n - 4, n - 3, n - 2, n - 1];
  const r5 = idx5.map((i) => ratioAt(c, i));
  const v5 = idx5.map((i) => c[i].v);
  const lastMove = Math.abs(last.c - c[n - 2].c) / A;
  const ok5 = r5.every((x) => x != null);

  let key = null;
  let detail = '';
  if (ok5) {
    const ups = v5.filter((v, i) => i > 0 && v > v5[i - 1]).length;
    const downs = v5.filter((v, i) => i > 0 && v < v5[i - 1]).length;
    const diffs = v5.slice(1).map((v, i) => v - v5[i]);
    const flips = diffs.slice(1).filter((d, i) => (d > 0) !== (diffs[i] > 0)).length;
    const si = r5.findIndex((x, i) => i < 4 && x >= 2.5);
    if (ratio < 0.7 && lastMove >= 1.5) key = 'lowvol_bigmove';
    else if (si >= 0 && r5.every((x, i) => i === si || x < 1.5)) {
      key = 'spike';
      const sIdx = idx5[si];
      const move = c[sIdx].c - c[sIdx - 1].c;
      if (Math.abs(move) < 0.8 * A) detail = 'Price barely moved on the spike day.';
      else {
        const held = (last.c - c[sIdx - 1].c) / move >= 0.5;
        detail = held ? 'Price has held most of the spike-day move.' : 'Price has given most of the spike-day move back.';
      }
    } else if (ups >= 3 && v5[4] >= v5[0] * 1.5) {
      key = 'rising';
      if (Math.abs(last.c - c[n - 5].c) <= A) detail = 'Price is barely moving while volume rises. Often a coiling stock; wait for price to choose a direction.';
    } else if (downs >= 3 && v5[4] <= v5[0] * 0.67) key = 'falling';
    else if (ratio >= 2 && lastMove <= 0.4) key = 'highvol_flat';
    else if (flips >= 3 && Math.max(...v5) / Math.min(...v5) >= 1.6) {
      key = 'choppy';
      const hi = [];
      for (let i = n - 10; i < n; i++) { const r = ratioAt(c, i); if (r != null && r >= 1.3) hi.push(c[i].c >= c[i].o); }
      if (hi.length >= 2) {
        const f = hi.filter(Boolean).length / hi.length;
        detail = f >= 0.7 ? 'High-volume days were mostly up days.' : f <= 0.3 ? 'High-volume days were mostly down days.' : 'High-volume days are mixed between up and down.';
      }
    } else if (r5.every((x) => x >= 0.7 && x <= 1.3)) key = 'flat';
  }

  const last10 = c.slice(-10);
  const upV = mean(last10.filter((x) => x.c >= x.o).map((x) => x.v));
  const dnV = mean(last10.filter((x) => x.c < x.o).map((x) => x.v));
  return {
    ratio, band: band(ratio), avg20, key, detail,
    bars: last10.map((x) => ({ v: x.v, up: x.c >= x.o })),
    upDown: upV > 0 && dnV > 0 ? upV / dnV : null,
  };
}

// ---------- Breakout / breakdown and retest ----------
// Long logic runs on the data as is; short logic runs on a mirrored copy (prices negated).
function findSetup(c, A) {
  const n = c.length;
  const cands = [];
  for (const dir of [1, -1]) {
    const t = c.map((x) => (dir > 0 ? x : { o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));
    for (let b = Math.max(n - 20, 16); b <= n - 1; b++) {
      const base = t.slice(b - 15, b);
      const BH = Math.max(...base.map((x) => x.h));
      const BL = Math.min(...base.map((x) => x.l));
      if (!(t[b].c > BH && t[b - 1].c <= BH)) continue;
      if (BH - BL > 4 * A) continue; // the base must be a tight range
      const after = t.slice(b + 1);
      const touchIdx = after.findIndex((x) => x.l <= BH + 0.35 * A && x.c > BH);
      const failed = after.some((x) => x.c < BH - 0.25 * A);
      const bounced = touchIdx >= 0 && after.slice(touchIdx).some((x) => x.c > x.o && x.c > BH);
      const stage = failed ? 'failed' : bounced ? 'held' : touchIdx >= 0 ? 'retesting' : 'breakout';
      const touched = after.filter((x) => x.l <= BH + 0.35 * A);
      const minLt = touched.length ? Math.min(...touched.map((x) => x.l)) : null;
      const level = dir * BH;
      const extreme = minLt != null ? dir * minLt : null;
      const stopRef = (extreme != null ? extreme : level) - dir * 0.5 * A;
      const measured = level + dir * (BH - BL);
      let rIdx = null;
      if (minLt != null) { const k = after.findIndex((x) => x.l === minLt); rIdx = b + 1 + k; }
      const word = dir > 0 ? 'above' : 'below';
      const detail = {
        breakout: (dir > 0 ? 'Broke above ' : 'Broke below ') + level.toFixed(2) + '; no retest yet.',
        retesting: 'Pulled back to ' + level.toFixed(2) + '; watching whether it holds.',
        held: 'Retest held ' + word + ' ' + level.toFixed(2) + '.',
        failed: 'Closed back through ' + level.toFixed(2) + '; the setup has failed.',
      }[stage];
      const cand = {
        key: 'retest', dir, stage, b, level, extreme, stopRef, measured,
        baseRange: BH - BL,
        breakVol: ratioAt(c, b),
        barsSince: n - 1 - b,
        name: (dir > 0 ? 'Breakout and retest' : 'Breakdown and retest') + (stage === 'failed' ? ' (failed)' : ''),
        bias: stage === 'failed' ? 'neutral' : dir > 0 ? 'bullish' : 'bearish',
        detail,
        draw: {
          segs: [{ i1: b - 15, p1: level, i2: n - 1, p2: level, k: 'level', label: 'Breakout level' }],
          pts: [{ i: b, p: c[b].c }].concat(rIdx != null ? [{ i: rIdx, p: extreme }] : []),
        },
      };
      cands.push(cand);
    }
  }
  // The true breakout is the first qualifying candle that has not failed; otherwise show the latest failure.
  const live = cands.filter((x) => x.stage !== 'failed').sort((x, y) => x.b - y.b);
  if (live.length) return live[0];
  return cands.sort((x, y) => y.b - x.b)[0] || null;
}

// ---------- Main analysis ----------
export function analyze(candles, tfKey) {
  const cfg = TF[tfKey];
  const n = candles.length;
  if (n < 60) throw new Error('Not enough history (' + n + ' candles) on this timeframe.');
  const last = candles[n - 1];
  const A = atr(candles, 14);
  const trend = trendOf(candles);
  const volAvg = candles.slice(-21, -1).reduce((s, x) => s + x.v, 0) / 20;
  const relVol = volAvg > 0 && last.v > 0 ? last.v / volAvg : null;

  const sw = swings(candles, cfg.k);
  const tol = Math.max(0.5 * A, last.c * 0.003);
  const zs = buildZones(sw, tol, n - 1, Math.max(0.5 * A, last.c * 0.004));
  const px = last.c;
  const inside = zs.find((z) => z.lo < px && z.hi > px) || null;
  const pick = (list, dist) => {
    const sorted = list.sort((a, b) => dist(a) - dist(b));
    const strong = sorted.find((z) => z.touches >= 2 && dist(z) <= px * 0.12);
    return strong || sorted[0] || null;
  };
  const sZ = pick(zs.filter((z) => z.hi <= px), (z) => px - z.hi);
  const rZ = pick(zs.filter((z) => z.lo >= px), (z) => z.lo - px);
  const support = sZ ? [sZ] : [];
  const resistance = rZ ? [rZ] : [];

  // Past swing behaviour on this chart
  const ordered = [...sw].sort((a, b) => a.i - b.i);
  const durs = [];
  const moves = [];
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].type !== ordered[i - 1].type) {
      durs.push(ordered[i].i - ordered[i - 1].i);
      moves.push((Math.abs(ordered[i].p - ordered[i - 1].p) / ordered[i - 1].p) * 100);
    }
  }
  const swingStats = {
    medianBars: median(durs),
    medianMovePct: median(moves),
    count: durs.length,
  };

  const setup = findSetup(candles, A);
  const patterns = detectPatterns(candles, sw, A, relVol);
  if (setup) patterns.unshift({ key: setup.key, name: setup.name, bias: setup.bias, detail: setup.detail, draw: setup.draw });

  return {
    tf: tfKey,
    setup,
    volume: volumeInfo(candles, A),
    last,
    atr: A,
    trend,
    relVol,
    support,
    resistance,
    inside,
    patterns,
    swingStats,
  };
}

export function formatDuration(bars, tfKey) {
  if (bars == null) return 'n/a';
  if (tfKey === '15m') {
    const mins = Math.round(bars * 15);
    return mins >= 60 ? (mins / 60).toFixed(1) + ' hours' : mins + ' minutes';
  }
  if (tfKey === '1h') return Math.round(bars) + ' hours of trading';
  if (tfKey === '1d') return Math.round(bars) + ' trading days';
  return Math.round(bars) + ' weeks';
}
