# CRT Crypto Signal Bot

An automated bot that implements your **Candle Range Theory (CRT / AMD / CISD)**
strategy across the **top 100 coins by market cap**, and posts a daily signal
digest to your Discord channel via webhook.

⚠️ **Not financial advice.** This is an algorithmic approximation of a
discretionary trading strategy. Some parts of the original strategy (reading
"key levels", "trend", etc. from a chart) have been turned into concrete
heuristics so a computer can evaluate them consistently — they are
approximations, not a perfect replica of manual chart reading. Always verify
signals yourself before acting on them, and never risk more than you can
afford to lose.

## What it does

1. Pulls the **top 100 coins by market cap from CoinGecko**.
2. For each coin, fetches real candle data from **Binance's public API**
   (free, no key required) across four HTF → LTF pairs, matching your doc's
   timeframe alignment table:
   - Monthly → Daily
   - Weekly → H4
   - Daily → H1
   - H4 → M15
3. Runs the full CRT pipeline on each pair:
   - Detects a valid **C1/C2** (accumulation/manipulation) on the HTF, requiring:
     - C2 sweeps C1's high or low
     - C2's **body** closes back inside C1's range
     - C1 sits at a **Key Level** (Fair Value Gap, old swing high/low, or
       rejection block)
     - HTF trend alignment (EMA20 vs EMA50), unless tapping an FVG
   - Confirms invalidation hasn't happened (price hasn't swept the C2
     Protected Level since it closed)
   - Looks on the **LTF** for a **Turtle Soup + Single Candle CISD** entry
   - Calculates Entry, Stop Loss (Protected Level), TP1 (C1 body edge), TP2
     (C1 wick edge)
4. Adds the **Fear & Greed Index** (alternative.me) as sentiment context.
5. Posts everything to your Discord webhook as a digest, once a day.

## Setup

```bash
npm install
```

Your `.env` is already filled in with the webhook URL you provided. You can
adjust these values in `.env` if you want:

```
WEBHOOK_URL=...          # already set
TOP_N_COINS=100           # how many coins to scan
DAILY_RUN_TIME=5 0 * * *  # cron schedule, UTC
REQUEST_DELAY_MS=250      # spacing between API calls
```

## Run it

**Run continuously (scans immediately, then once a day forever):**
```bash
npm start
```
Leave this running on a server / VPS / always-on machine (e.g. Railway,
Render, a small VPS, or your own PC left on) so the daily cron actually fires.

**Run a single scan and exit (useful for testing, or for running via your
own external scheduler / cron job / GitHub Actions):**
```bash
npm run scan-once
```

## Notes & limitations

- **Coin coverage:** Not every top-100 CoinGecko coin has a USDT pair on
  Binance. Those are skipped automatically (logged, not fatal).
- **New/thin coins:** Coins without enough historical candles (e.g. very new
  listings) won't have enough data for Monthly/Weekly analysis and will be
  skipped for those timeframe pairs specifically.
- **Rate limits:** Free Binance and CoinGecko endpoints are used with a
  built-in delay between calls. A full scan of 100 coins × 4 timeframe pairs
  takes a few minutes.
- **Some regions block Binance's public API** at the network level. If you
  deploy this on a host where Binance is unreachable, you'll see repeated
  "skipped" symbols in the logs — in that case, the fetch logic in
  `src/binance.js` would need to be swapped for another OHLC data source
  (e.g. CoinGecko's own OHLC endpoint, at lower resolution).
- **Tuning:** The heuristics for "Key Level", "trend", and "rejection block"
  in `src/crt.js` are deliberately commented so you (or I) can tune
  thresholds, lookback windows, or add stricter/looser filters as you see
  fit after watching it run for a while.

## Project structure

```
crt-bot/
├── index.js              # orchestrator + daily scheduler
├── src/
│   ├── config.js          # settings (.env driven)
│   ├── coingecko.js        # top-100 coin list
│   ├── binance.js          # OHLC candle fetching
│   ├── sentiment.js        # Fear & Greed Index
│   ├── crt.js              # the actual CRT/AMD/CISD strategy logic
│   └── discordSender.js    # formats + posts the Discord digest
└── .env                   # your config, webhook already filled in
```
