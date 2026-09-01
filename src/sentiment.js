/**
 * Alternative.me Crypto Fear & Greed Index - free, no API key required.
 * Used as macro sentiment context attached to the daily signal digest.
 */
async function getFearGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json();
    const entry = data?.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(entry.value, 10),
      classification: entry.value_classification,
    };
  } catch (err) {
    return null; // sentiment is a nice-to-have, never block the scan on it
  }
}

module.exports = { getFearGreedIndex };
