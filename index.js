const cron = require('node-cron');
const config = require('./src/config');
const { getTopCoins } = require('./src/coingecko');
const { getKlines, toBinanceSymbol } = require('./src/binance');
const { getFearGreedIndex } = require('./src/sentiment');
const { analyzeCRT } = require('./src/crt');
const { sendDailyDigest } = require('./src/discordSender');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScan() {
  console.log(`[${new Date().toISOString()}] Starting CRT scan...`);

  if (!config.WEBHOOK_URL) {
    console.error('WEBHOOK_URL missing from .env - aborting scan.');
    return;
  }

  let coins;
  try {
    coins = await getTopCoins(config.TOP_N_COINS);
  } catch (err) {
    console.error('Failed to fetch coin list from CoinGecko:', err.message);
    return;
  }
  console.log(`Fetched ${coins.length} coins from CoinGecko.`);

  const sentiment = await getFearGreedIndex();

  const signals = [];
  let skipped = 0;

  for (const coin of coins) {
    const symbol = toBinanceSymbol(coin.symbol);

    for (const pair of config.TIMEFRAME_PAIRS) {
      try {
        const htfCandles = await getKlines(symbol, pair.htf, 200);
        await sleep(config.REQUEST_DELAY_MS);
        const ltfCandles = await getKlines(symbol, pair.ltf, 60);
        await sleep(config.REQUEST_DELAY_MS);

        const signal = analyzeCRT(htfCandles, ltfCandles, {
          coin,
          timeframeLabel: pair.label,
        });

        if (signal) {
          signals.push(signal);
          console.log(`Signal found: ${coin.symbol} ${signal.direction} (${pair.label})`);
        }
      } catch (err) {
        // Most common cause: coin isn't listed on Binance with a USDT pair, or
        // not enough candle history yet. Skip quietly and continue scanning.
        skipped++;
        continue;
      }
    }
  }

  console.log(`Scan complete. ${signals.length} signal(s) found. ${skipped} symbol/timeframe combos skipped (no data).`);

  try {
    await sendDailyDigest(signals, sentiment);
    console.log('Digest posted to Discord.');
  } catch (err) {
    console.error('Failed to post digest to Discord:', err.message);
  }
}

async function main() {
  const runOnceOnly = process.argv.includes('--once');

  // Always run one scan immediately on startup so you get value right away.
  await runScan();

  if (runOnceOnly) {
    process.exit(0);
  }

  console.log(`Scheduling daily scans with cron pattern "${config.DAILY_RUN_TIME}" (UTC).`);
  cron.schedule(config.DAILY_RUN_TIME, () => {
    runScan().catch((err) => console.error('Scheduled scan failed:', err));
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
