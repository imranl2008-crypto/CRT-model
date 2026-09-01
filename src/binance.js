const BASE = 'https://api.binance.com/api/v3';

/**
 * Fetches candlestick data for a symbol (e.g. "BTCUSDT") and interval
 * (e.g. "1d", "4h", "1h", "15m", "1w", "1M").
 * Returns an array of { openTime, open, high, low, close, volume, closeTime }
 * ordered oldest -> newest.
 */
async function getKlines(symbol, interval, limit = 100) {
  const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Symbol likely doesn't exist on Binance (not all top-100 coins are listed there),
    // or the pair isn't tradeable. Caller should treat this as "skip".
    throw new Error(`Binance error ${res.status} for ${symbol} ${interval}`);
  }
  const raw = await res.json();
  return raw.map((k) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }));
}

/**
 * Given a CoinGecko-style symbol (e.g. "BTC"), builds the likely Binance
 * USDT trading pair symbol (e.g. "BTCUSDT").
 */
function toBinanceSymbol(symbol) {
  return `${symbol.toUpperCase()}USDT`;
}

module.exports = { getKlines, toBinanceSymbol };
