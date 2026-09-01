/**
 * Candle Range Theory (CRT) detection engine.
 *
 * This translates the rules from your CRT document into code. A few of the
 * more "discretionary" parts of the original strategy (e.g. "identify HTF
 * trend", "spot a Key Level") are implemented here as concrete heuristics so
 * a machine can evaluate them consistently. They're approximations of
 * discretionary chart reading, not a perfect replica — treat every signal as
 * a candidate to review, not a guarantee.
 *
 * -------------------------------------------------------------------------
 * HTF SIDE (C1 / C2 / C3)
 * -------------------------------------------------------------------------
 * C1 = a candle whose range becomes the reference range.
 * C2 = the very next candle. Valid manipulation if it sweeps C1's high or
 *      low (wick beyond) but its BODY (open & close) stays inside C1's
 *      high/low range.
 * C3 = still forming / hasn't printed yet — this is the move we are trying
 *      to catch early via the LTF entry model.
 *
 * -------------------------------------------------------------------------
 * KEY LEVEL CHECK
 * -------------------------------------------------------------------------
 * A CRT is only considered if C1 sits at one of:
 *  - a Fair Value Gap (3-candle imbalance) formed in the lookback window
 *  - a prior swing high/low (old liquidity)
 *  - a rejection block (a candle that wicked beyond a level then closed
 *    back inside it - a "failed" breakout)
 *
 * -------------------------------------------------------------------------
 * TREND FILTER
 * -------------------------------------------------------------------------
 * EMA20 vs EMA50 on the HTF candles. Long setups are only taken in an
 * uptrend (EMA20 > EMA50), shorts only in a downtrend, UNLESS C1 taps an
 * unfilled key level (matches the doc's stated exception).
 *
 * -------------------------------------------------------------------------
 * LTF SIDE (Turtle Soup + Single Candle CISD)
 * -------------------------------------------------------------------------
 * After C2 closes on the HTF, we look at the LTF for a candle that sweeps a
 * recent swing high/low (Turtle Soup) and closes its body back on the other
 * side of that level in the same candle (Single Candle CISD). That candle's
 * body becomes the entry retest zone.
 */

function ema(values, period) {
  const k = 2 / (period + 1);
  let emaPrev = values[0];
  const result = [emaPrev];
  for (let i = 1; i < values.length; i++) {
    emaPrev = values[i] * k + emaPrev * (1 - k);
    result.push(emaPrev);
  }
  return result;
}

function getTrend(htfCandles) {
  if (htfCandles.length < 55) return 'unknown';
  const closes = htfCandles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const last20 = ema20[ema20.length - 1];
  const last50 = ema50[ema50.length - 1];
  if (last20 > last50) return 'up';
  if (last20 < last50) return 'down';
  return 'flat';
}

// Detects a 3-candle Fair Value Gap ending at index i (uses candles i-2, i-1, i).
// Bullish FVG: candle[i-2].high < candle[i].low  (gap zone between them)
// Bearish FVG: candle[i-2].low  > candle[i].high
function findFVGZones(candles, endIndexExclusive) {
  const zones = [];
  for (let i = 2; i < endIndexExclusive; i++) {
    const a = candles[i - 2];
    const c = candles[i];
    if (a.high < c.low) {
      zones.push({ type: 'bullish', top: c.low, bottom: a.high, index: i });
    } else if (a.low > c.high) {
      zones.push({ type: 'bearish', top: a.low, bottom: c.high, index: i });
    }
  }
  return zones;
}

// Finds recent swing highs/lows (simple fractal: higher/lower than 2 neighbors on each side)
function findSwingPoints(candles, endIndexExclusive) {
  const highs = [];
  const lows = [];
  for (let i = 2; i < endIndexExclusive - 2; i++) {
    const c = candles[i];
    const isSwingHigh =
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high;
    const isSwingLow =
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low;
    if (isSwingHigh) highs.push({ price: c.high, index: i });
    if (isSwingLow) lows.push({ price: c.low, index: i });
  }
  return { highs, lows };
}

// Rejection block: a candle that wicked beyond a recent swing level but
// closed back inside it (a failed break = potential CISD failure / spring).
function findRejectionBlocks(candles, endIndexExclusive, swingPoints) {
  const blocks = [];
  for (let i = 3; i < endIndexExclusive; i++) {
    const c = candles[i];
    for (const sh of swingPoints.highs) {
      if (sh.index < i && c.high > sh.price && c.close < sh.price) {
        blocks.push({ type: 'bearish', level: sh.price, index: i });
      }
    }
    for (const sl of swingPoints.lows) {
      if (sl.index < i && c.low < sl.price && c.close > sl.price) {
        blocks.push({ type: 'bullish', level: sl.price, index: i });
      }
    }
  }
  return blocks;
}

// Checks whether C1's range sits at a valid Key Level.
function c1TapsKeyLevel(candles, c1Index) {
  const fvgZones = findFVGZones(candles, c1Index); // zones formed before C1
  const swings = findSwingPoints(candles, c1Index);
  const rejBlocks = findRejectionBlocks(candles, c1Index, swings);
  const c1 = candles[c1Index];

  for (const z of fvgZones) {
    const overlaps = c1.low <= z.top && c1.high >= z.bottom;
    if (overlaps) return { hit: true, type: 'FVG', detail: z.type };
  }
  const nearTolerance = (c1.high - c1.low) * 0.5 || c1.high * 0.002;
  for (const sh of swings.highs) {
    if (Math.abs(c1.high - sh.price) <= nearTolerance) {
      return { hit: true, type: 'Old High', detail: sh.price };
    }
  }
  for (const sl of swings.lows) {
    if (Math.abs(c1.low - sl.price) <= nearTolerance) {
      return { hit: true, type: 'Old Low', detail: sl.price };
    }
  }
  for (const rb of rejBlocks) {
    if (rb.index === c1Index - 1 || rb.index === c1Index) {
      return { hit: true, type: 'Rejection Block', detail: rb.type };
    }
  }
  return { hit: false };
}

// Finds the most recent valid HTF CRT (C1 + C2) near the end of the series.
// Returns null if none found in the last few candles.
function findHTFCRT(htfCandles) {
  const n = htfCandles.length;
  if (n < 60) return null; // not enough history for key-level context

  // Check the last few C1/C2 pairs, most recent first, so the signal stays timely.
  for (let c2Index = n - 1; c2Index >= n - 4 && c2Index >= 1; c2Index--) {
    const c1Index = c2Index - 1;
    const c1 = htfCandles[c1Index];
    const c2 = htfCandles[c2Index];

    const c1High = Math.max(c1.open, c1.close, c1.high);
    const c1Low = Math.min(c1.open, c1.close, c1.low);

    const sweptHigh = c2.high > c1.high;
    const sweptLow = c2.low < c1.low;
    if (!sweptHigh && !sweptLow) continue; // C2 didn't sweep anything

    const bodyTop = Math.max(c2.open, c2.close);
    const bodyBottom = Math.min(c2.open, c2.close);
    const bodyInside = bodyTop <= c1.high && bodyBottom >= c1.low;
    if (!bodyInside) continue; // invalid: C2 body closed outside C1 range

    // Direction: which side did C2 manipulate? That determines the expected
    // C3 distribution direction (opposite side).
    let direction = null;
    if (sweptLow && !sweptHigh) direction = 'long';
    else if (sweptHigh && !sweptLow) direction = 'short';
    else direction = c2.close >= c2.open ? 'long' : 'short'; // swept both, use close bias

    const keyLevel = c1TapsKeyLevel(htfCandles, c1Index);
    if (!keyLevel.hit) continue; // doc: don't trade CRT randomly, require a key level

    const trend = getTrend(htfCandles.slice(0, c1Index + 1));
    const trendAligned =
      trend === 'unknown' ||
      (direction === 'long' && trend === 'up') ||
      (direction === 'short' && trend === 'down');
    // Doc allows an exception when tapping a major unfilled HTF FVG even against trend.
    if (!trendAligned && keyLevel.type !== 'FVG') continue;

    return {
      c1Index,
      c2Index,
      c1,
      c2,
      direction,
      keyLevel,
      trend,
      protectedHigh: Math.max(c1.high, c2.high),
      protectedLow: Math.min(c1.low, c2.low),
      c1BodyHigh: Math.max(c1.open, c1.close),
      c1BodyLow: Math.min(c1.open, c1.close),
      c1WickHigh: c1.high,
      c1WickLow: c1.low,
    };
  }
  return null;
}

// Checks whether the C2 Protected Level has already been invalidated by
// price action *after* C2 closed (i.e. within the LTF candles we're using
// for the entry search). If price swept the protected level, the setup is dead.
function isInvalidatedByProtectedLevel(ltfCandles, crt) {
  for (const c of ltfCandles) {
    if (crt.direction === 'long' && c.low < crt.protectedLow) return true;
    if (crt.direction === 'short' && c.high > crt.protectedHigh) return true;
  }
  return false;
}

// Looks for a Turtle Soup + Single Candle CISD on the LTF, in the direction
// implied by the HTF CRT.
function findLTFEntry(ltfCandles, direction) {
  const n = ltfCandles.length;
  if (n < 15) return null;

  const swings = findSwingPoints(ltfCandles, n - 1); // exclude the very last (still-forming-ish) candle

  // Look at the most recently closed candles for a sweep + reversal close.
  for (let i = n - 1; i >= n - 6 && i >= 3; i--) {
    const c = ltfCandles[i];
    if (direction === 'long') {
      const recentLows = swings.lows.filter((s) => s.index < i);
      if (!recentLows.length) continue;
      const nearestLow = recentLows[recentLows.length - 1];
      const sweptLow = c.low < nearestLow.price;
      const closedBackAbove = c.close > nearestLow.price;
      if (sweptLow && closedBackAbove) {
        return {
          index: i,
          candle: c,
          sweptLevel: nearestLow.price,
          entryZoneTop: Math.max(c.open, c.close),
          entryZoneBottom: c.low,
        };
      }
    } else {
      const recentHighs = swings.highs.filter((s) => s.index < i);
      if (!recentHighs.length) continue;
      const nearestHigh = recentHighs[recentHighs.length - 1];
      const sweptHigh = c.high > nearestHigh.price;
      const closedBackBelow = c.close < nearestHigh.price;
      if (sweptHigh && closedBackBelow) {
        return {
          index: i,
          candle: c,
          sweptLevel: nearestHigh.price,
          entryZoneTop: c.high,
          entryZoneBottom: Math.min(c.open, c.close),
        };
      }
    }
  }
  return null;
}

/**
 * Full pipeline: given HTF candles and LTF candles for one coin + one
 * timeframe pair, returns a signal object or null.
 */
function analyzeCRT(htfCandles, ltfCandles, meta) {
  const crt = findHTFCRT(htfCandles);
  if (!crt) return null;

  if (isInvalidatedByProtectedLevel(ltfCandles, crt)) return null;

  const entry = findLTFEntry(ltfCandles, crt.direction);
  if (!entry) return null;

  const entryPrice = (entry.entryZoneTop + entry.entryZoneBottom) / 2;
  const stopLoss = crt.direction === 'long' ? crt.protectedLow : crt.protectedHigh;
  const tp1 = crt.direction === 'long' ? crt.c1BodyHigh : crt.c1BodyLow;
  const tp2 = crt.direction === 'long' ? crt.c1WickHigh : crt.c1WickLow;

  return {
    coin: meta.coin,
    timeframeLabel: meta.timeframeLabel,
    direction: crt.direction,
    keyLevelType: crt.keyLevel.type,
    trend: crt.trend,
    entryZone: [entry.entryZoneBottom, entry.entryZoneTop],
    entryPrice,
    stopLoss,
    tp1,
    tp2,
  };
}

module.exports = { analyzeCRT };
