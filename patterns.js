// Educational content shown in the Learn tab and in the "new to this?" drawers.
// SVG classes (.px .lv .ln .pt .t .zone .rw .rk .cd) are styled in sidepanel.css.

const S = (inner) => `<svg class="dg" viewBox="0 0 160 84" role="img" aria-hidden="true">${inner}</svg>`;
const T = (x, y, txt, cls = 't') => `<text class="${cls}" x="${x}" y="${y}">${txt}</text>`;

export const PATTERNS = {
  retest: {
    name: 'Breakout and retest',
    bias: 'bullish',
    svg: S(
      '<line class="lv" x1="14" y1="44" x2="152" y2="44"/>' +
      '<polyline class="px" points="6,64 18,52 30,62 42,50 54,60 64,48 78,30 90,18 104,32 116,44 130,28 148,12"/>' +
      '<circle class="pt" cx="116" cy="44" r="3"/>' +
      T(14, 78, 'Base') + T(70, 12, 'Breakout') + T(104, 60, 'Retest holds')
    ),
    look: 'Price breaks above a base, pulls back to the old ceiling, holds it as new support, then turns up. The mirror image is a breakdown and retest.',
    fail: 'Price closes back below the level.',
  },
  double_top: {
    name: 'Double top',
    bias: 'bearish',
    svg: S(
      '<line class="lv" x1="14" y1="48" x2="152" y2="48"/>' +
      '<polyline class="px" points="6,70 30,22 52,48 76,22 100,48 118,62 140,74"/>' +
      '<circle class="pt" cx="30" cy="22" r="3"/><circle class="pt" cx="76" cy="22" r="3"/>' +
      T(20, 13, 'Top 1') + T(66, 13, 'Top 2') + T(112, 43, 'Neckline')
    ),
    look: 'Price climbs to a peak, dips, climbs back to almost the same peak, then fails.',
    fail: 'Price closes above both tops.',
  },
  double_bottom: {
    name: 'Double bottom',
    bias: 'bullish',
    svg: S(
      '<line class="lv" x1="14" y1="36" x2="152" y2="36"/>' +
      '<polyline class="px" points="6,14 30,62 52,36 76,62 100,36 118,22 140,10"/>' +
      '<circle class="pt" cx="30" cy="62" r="3"/><circle class="pt" cx="76" cy="62" r="3"/>' +
      T(18, 76, 'Bottom 1') + T(64, 76, 'Bottom 2') + T(112, 48, 'Neckline')
    ),
    look: 'Price falls to a low, bounces, falls to nearly the same low again, then turns up.',
    fail: 'Price closes below both bottoms.',
  },
  asc_triangle: {
    name: 'Ascending triangle',
    bias: 'bullish',
    svg: S(
      '<line class="lv" x1="14" y1="20" x2="152" y2="20"/>' +
      '<line class="ln" x1="6" y1="62" x2="108" y2="28"/>' +
      '<polyline class="px" points="6,62 25,20 45,49 65,20 85,36 103,20 122,8 142,3"/>' +
      T(34, 14, 'Flat top') + T(84, 62, 'Rising lows') + T(118, 30, 'Breakout')
    ),
    look: 'The top stays flat while each dip is higher than the last, squeezing price into a corner.',
    fail: 'Price closes below the rising lower line.',
  },
  desc_triangle: {
    name: 'Descending triangle',
    bias: 'bearish',
    svg: S(
      '<line class="lv" x1="14" y1="64" x2="152" y2="64"/>' +
      '<line class="ln" x1="6" y1="22" x2="108" y2="56"/>' +
      '<polyline class="px" points="6,22 25,64 45,35 65,64 85,48 103,64 122,76 142,81"/>' +
      T(34, 78, 'Flat bottom') + T(78, 24, 'Falling highs') + T(112, 56, 'Breakdown')
    ),
    look: 'The bottom stays flat while each bounce is lower than the last.',
    fail: 'Price closes above the falling upper line.',
  },
  sym_triangle: {
    name: 'Symmetrical triangle',
    bias: 'neutral',
    svg: S(
      '<line class="ln" x1="6" y1="12" x2="108" y2="40"/>' +
      '<line class="ln" x1="6" y1="72" x2="108" y2="44"/>' +
      '<polyline class="px" points="6,12 24,68 44,22 62,57 80,32 96,47 110,42 132,22 148,12"/>' +
      T(50, 12, 'Lower highs') + T(56, 80, 'Higher lows') + T(116, 54, 'Breakout?')
    ),
    look: 'Highs get lower and lows get higher, so the range keeps narrowing.',
    fail: 'A break out of the triangle quickly reverses.',
  },
  consolidation: {
    name: 'Tight consolidation',
    bias: 'neutral',
    svg: S(
      '<rect class="zone" x="20" y="30" width="108" height="26" rx="2"/>' +
      '<polyline class="px" points="6,62 20,46 34,34 46,52 60,36 74,54 88,38 100,52 112,40 126,46 150,44"/>' +
      T(26, 25, 'Narrow range')
    ),
    look: 'Candles stay inside a narrow box for a while.',
    fail: 'No signal until price closes outside the box.',
  },
  breakout: {
    name: 'Closed above 20-candle high',
    bias: 'bullish',
    svg: S(
      '<line class="lv" x1="14" y1="38" x2="152" y2="38"/>' +
      '<polyline class="px" points="6,62 24,38 40,54 58,38 74,52 92,38 106,28 124,12 146,6"/>' +
      '<rect class="vol" x="100" y="68" width="6" height="12"/><rect class="vol" x="110" y="62" width="6" height="18"/><rect class="vol" x="120" y="56" width="6" height="24"/>' +
      T(20, 32, 'Old high') + T(14, 77, 'Volume rising')
    ),
    look: 'Price closes above the highest high of the previous 20 candles.',
    fail: 'Price slips back below the old high.',
  },
  breakdown: {
    name: 'Closed below 20-candle low',
    bias: 'bearish',
    svg: S(
      '<line class="lv" x1="14" y1="46" x2="152" y2="46"/>' +
      '<polyline class="px" points="6,22 24,46 40,30 58,46 74,32 92,46 106,56 124,72 146,78"/>' +
      '<rect class="vol" x="100" y="6" width="6" height="12"/><rect class="vol" x="110" y="6" width="6" height="18"/><rect class="vol" x="120" y="6" width="6" height="24"/>' +
      T(20, 60, 'Old low') + T(24, 13, 'Volume rising')
    ),
    look: 'Price closes below the lowest low of the previous 20 candles.',
    fail: 'Price climbs back above the old low.',
  },
};

export const PATTERN_ORDER = [
  'retest', 'double_bottom', 'double_top', 'asc_triangle', 'desc_triangle', 'sym_triangle', 'consolidation', 'breakout', 'breakdown',
];


// ---------- Volume scenario tiles ----------
const VB = (bars, hot = -1, extra = '', cap = '') => {
  const step = 20;
  const x0 = 10;
  let out = '<line class="lv" x1="6" y1="56" x2="154" y2="56"/>';
  bars.forEach((h, i) => {
    out += '<rect class="vb' + (i === hot ? ' hot' : '') + '" x="' + (x0 + i * step) + '" y="' + (76 - h) + '" width="13" height="' + h + '" rx="1.5"/>';
  });
  return S(out + extra + (cap ? T(8, 11, cap) : ''));
};
export const VOLUME_PATTERNS = {
  flat: { svg: VB([22, 26, 20, 28, 22, 24], -1, '', 'Dashed line = 20-day average') },
  rising: { svg: VB([14, 22, 32, 44, 58], 4) },
  falling: { svg: VB([58, 46, 34, 24, 16], -1) },
  spike: { svg: VB([20, 22, 62, 24, 18], 2) },
  choppy: { svg: VB([18, 44, 16, 40, 20, 46], -1) },
  highvol_flat: { svg: VB([22, 20, 24, 60], 3, '<polyline class="px" points="10,26 150,26"/>' + T(100, 20, 'Price: flat')) },
  lowvol_bigmove: { svg: VB([24, 22, 26, 9], 3, '<polyline class="px" points="10,34 70,32 110,30 150,12"/>' + T(70, 24, 'Price: +4%')) },
};
export const VOLUME_ORDER = ['rising', 'flat', 'falling', 'spike', 'choppy', 'highvol_flat', 'lowvol_bigmove'];

export const CONCEPTS = {
  zones: {
    title: 'Support and resistance zones',
    svg: S(
      '<rect class="zone sup" x="6" y="52" width="148" height="14" rx="2"/>' +
      '<polyline class="px" points="6,18 22,58 36,30 52,60 66,24 82,57 98,32 114,62 132,28 150,20"/>' +
      '<circle class="pt" cx="22" cy="58" r="3"/><circle class="pt" cx="52" cy="60" r="3"/><circle class="pt" cx="82" cy="57" r="3"/><circle class="pt" cx="114" cy="62" r="3"/>' +
      T(8, 80, 'Price turned up here 4 times')
    ),
    body: 'An area where price has stopped falling (support) or rising (resistance) before. Drawn as a band because price rarely turns at one exact number.',
  },
  rr: {
    title: 'Reward to risk',
    svg: S(
      '<rect class="rw" x="40" y="12" width="64" height="30"/><rect class="rk" x="40" y="42" width="64" height="16"/>' +
      '<line class="lv" x1="30" y1="42" x2="104" y2="42"/>' +
      T(110, 28, 'Target') + T(110, 45, 'Entry') + T(110, 56, 'Stop') +
      T(46, 30, 'Reward = 2', 'tw') + T(46, 53, 'Risk = 1', 'tw') + T(6, 80, 'Reward : risk = 2 : 1')
    ),
    body: 'What you could gain (entry to target) compared with what you could lose (entry to stop). A good ratio does not make a trade likely to work.',
  },
};

export const DATA_NOTES = {
  title: 'Where the prices come from',
  text: 'Open, high, low, close and volume candles from Yahoo Finance\'s public chart service, fetched by your browser each time you press Analyse. Delayed and unofficial. Nothing is stored.',
};
