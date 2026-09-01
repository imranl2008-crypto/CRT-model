require('dotenv').config();

module.exports = {
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  TOP_N_COINS: parseInt(process.env.TOP_N_COINS || '100', 10),
  DAILY_RUN_TIME: process.env.DAILY_RUN_TIME || '5 0 * * *', // 00:05 UTC by default (cron format)
  REQUEST_DELAY_MS: parseInt(process.env.REQUEST_DELAY_MS || '250', 10), // spacing between API calls

  // HTF -> LTF pairs to scan, per the CRT timeframe alignment table.
  // Binance interval strings: 1M, 1w, 1d, 4h, 1h, 15m
  TIMEFRAME_PAIRS: [
    { htf: '1M', ltf: '1d', label: 'Monthly -> Daily' },
    { htf: '1w', ltf: '4h', label: 'Weekly -> H4' },
    { htf: '1d', ltf: '1h', label: 'Daily -> H1' },
    { htf: '4h', ltf: '15m', label: 'H4 -> M15' },
  ],
};
