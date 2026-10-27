# ChartSense India (v0.1 prototype)

Rule-based support/resistance zones, chart patterns, multi-timeframe trend and a risk-reward calculator for NSE/BSE stocks.
Information only. No buy/sell verdicts.

## Install (developer mode)
1. Open chrome://extensions and switch on Developer mode.
2. Click "Load unpacked" and choose this folder.
3. Open a stock page (NSE quote page, Screener company page, TradingView symbol page), click the extension icon.
4. The side panel opens. The symbol is picked up from the tab, or type it yourself and press Analyse.

## What you see
- Side panel: summary card, chart with one support and one resistance zone, a Setup card when a breakout/breakdown and retest is found, Key levels (Weekly, Daily, 1 Hour), Volume (ratio, last 10 candles, one of seven scenarios) and a trade plan.
- Setup card: Base, Breakout, Retest stages, level, breakout volume, measured move, stop reference, and a button that fills the plan with those levels.
- Full chart button: wide tab with entry, stop and target boxes, dates, hover prices and a timeframe switch.
- Learn tab: patterns and the seven volume scenarios, each with a diagram.

Not included: delivery % and FII/DII trend (they need NSE/BSE data beyond price and volume).

## Files
- manifest.json: Manifest V3 config, side panel, host permissions
- background.js: opens the side panel on icon click
- analysis.js: data fetch, ATR, swing points, zones, patterns, trend, swing stats
- patterns.js: pattern diagrams (inline SVG) and short explanations
- chartdraw.js: shared candlestick renderer
- sidepanel.html / .css / .js: side panel UI and plan
- chart.html / .css / .js: full chart tab

## Before charging anyone
- Replace the Yahoo Finance feed (unofficial, delayed) with a licensed data source behind your own backend.
- Add login, a free-tier limit and Razorpay billing; keep paid logic server-side.
- Have a securities lawyer review every screen and sentence against SEBI research analyst rules.
- Add icons (16/48/128 px) and a privacy policy for the Chrome Web Store.
