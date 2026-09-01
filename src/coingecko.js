const BASE = 'https://api.coingecko.com/api/v3';

/**
 * Returns the top N coins by market cap.
 * Each item: { id, symbol, name, market_cap_rank, current_price, market_cap, total_volume }
 */
async function getTopCoins(n = 100) {
  const perPage = Math.min(n, 250);
  const url = `${BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=1&sparkline=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.slice(0, n).map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
    rank: c.market_cap_rank,
    price: c.current_price,
    marketCap: c.market_cap,
    volume: c.total_volume,
    change24h: c.price_change_percentage_24h,
  }));
}

module.exports = { getTopCoins };
