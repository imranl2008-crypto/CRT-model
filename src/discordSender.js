const { WEBHOOK_URL } = require('./config');

function fmtPrice(p) {
  if (p === undefined || p === null || isNaN(p)) return 'n/a';
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toPrecision(4);
}

function signalToEmbed(sig) {
  const color = sig.direction === 'long' ? 0x2ecc71 : 0xe74c3c;
  return {
    title: `${sig.coin.symbol} - ${sig.direction.toUpperCase()} (${sig.timeframeLabel})`,
    color,
    fields: [
      { name: 'Entry Zone', value: `${fmtPrice(sig.entryZone[0])} - ${fmtPrice(sig.entryZone[1])}`, inline: true },
      { name: 'Stop Loss', value: fmtPrice(sig.stopLoss), inline: true },
      { name: 'TP1 (C1 Body)', value: fmtPrice(sig.tp1), inline: true },
      { name: 'TP2 (C1 Wick)', value: fmtPrice(sig.tp2), inline: true },
      { name: 'Key Level', value: sig.keyLevelType, inline: true },
      { name: 'HTF Trend', value: sig.trend, inline: true },
      { name: 'Market Cap Rank', value: `#${sig.coin.rank}`, inline: true },
      { name: '24h Change', value: `${sig.coin.change24h?.toFixed(2) ?? 'n/a'}%`, inline: true },
    ],
    footer: { text: 'CRT Bot • Not financial advice • Verify before trading' },
    timestamp: new Date().toISOString(),
  };
}

async function postEmbeds(embeds, content) {
  if (!WEBHOOK_URL) throw new Error('WEBHOOK_URL is not set in .env');
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, embeds }),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook error ${res.status}: ${await res.text()}`);
  }
}

/**
 * Sends the daily digest. Discord allows up to 10 embeds per message, so
 * signals are batched.
 */
async function sendDailyDigest(signals, sentiment) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const sentimentLine = sentiment
    ? `Fear & Greed Index: **${sentiment.value}** (${sentiment.classification})`
    : 'Fear & Greed Index: unavailable';

  if (!signals.length) {
    await postEmbeds([], `**CRT Daily Scan - ${dateStr}**\n${sentimentLine}\n\nNo valid CRT setups found today across the scanned coins/timeframes.`);
    return;
  }

  const header = `**CRT Daily Scan - ${dateStr}**\n${sentimentLine}\nFound **${signals.length}** valid setup(s):`;
  const batches = [];
  for (let i = 0; i < signals.length; i += 10) {
    batches.push(signals.slice(i, i + 10));
  }

  for (let i = 0; i < batches.length; i++) {
    const embeds = batches[i].map(signalToEmbed);
    const content = i === 0 ? header : undefined;
    await postEmbeds(embeds, content);
  }
}

module.exports = { sendDailyDigest };
