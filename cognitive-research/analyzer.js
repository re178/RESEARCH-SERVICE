/**
 * RESEARCH ANALYZER
 * Uses Price Action, Market Structure, SMC (Liquidity Sweeps), Wyckoff, Volatility.
 * Returns a directional score from -1 (strong sell) to +1 (strong buy).
 */
function analyze(m1Candles, m5Candles, h1Candles, currentPrice) {
  // 1. Trend Strength (using H1)
  const trend = detectTrend(h1Candles);
  
  // 2. Support & Resistance (using M5 for swing points)
  const levels = findSupportResistance(m5Candles);
  
  // 3. Liquidity Sweeps (Smart Money Concepts) – using M1
  const liquidity = detectLiquiditySweeps(m1Candles, currentPrice);
  
  // 4. Wyckoff Phase (using H1 range contraction/expansion)
  const wyckoff = detectWyckoffPhase(h1Candles);
  
  // 5. Volatility Regime (using M5)
  const volatility = calculateVolatility(m5Candles);
  
  // --- SCORING ENGINE (deterministic, transparent) ---
  let score = 0;
  let confidence = 0.5;
  
  // Trend component
  if (trend === 'bullish') score += 0.35;
  else if (trend === 'bearish') score -= 0.35;
  
  // Liquidity sweeps: sweep of recent highs = bullish (breakout), sweep of lows = bearish
  if (liquidity.bullishSweep) score += 0.25;
  if (liquidity.bearishSweep) score -= 0.25;
  
  // Wyckoff: accumulation = bullish, distribution = bearish
  if (wyckoff === 'accumulation') score += 0.20;
  else if (wyckoff === 'distribution') score -= 0.20;
  
  // Position relative to S/R: if price near support, bullish bias; near resistance, bearish
  if (levels.support && currentPrice < levels.support * 1.002) score += 0.15;
  if (levels.resistance && currentPrice > levels.resistance * 0.998) score -= 0.15;
  
  // Clamp score
  score = Math.max(-1, Math.min(1, score));
  
  // Confidence: higher when trend clear + volatility not extreme + structure clear
  const trendClarity = Math.abs(score) / 0.7; // normalize
  const volAdjust = Math.min(1, 1 - (volatility / 0.02)); // if vol > 2%, reduce confidence
  confidence = Math.min(0.95, 0.4 + (trendClarity * 0.4) + (volAdjust * 0.2));
  confidence = Math.max(0.1, confidence);
  
  return {
    trend,
    support: levels.support,
    resistance: levels.resistance,
    liquidity,
    wyckoffPhase: wyckoff,
    volatility,
    directionScore: score,
    confidence,
    uncertainty: 1 - confidence,
    summary: `Trend: ${trend}, Wyckoff: ${wyckoff}, Score: ${score.toFixed(3)}`,
  };
}

// --- DETERMINISTIC HELPERS ---

function detectTrend(h1Candles) {
  if (!h1Candles || h1Candles.length < 30) return 'neutral';
  const closes = h1Candles.map(c => c.close);
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const ratio = sma20 / sma50;
  if (ratio > 1.008) return 'bullish';
  if (ratio < 0.992) return 'bearish';
  return 'neutral';
}

function findSupportResistance(candles) {
  if (!candles || candles.length < 30) return { support: null, resistance: null };
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  // Simple pivot points: recent swing highs/lows
  const recentHighs = highs.slice(-30);
  const recentLows = lows.slice(-30);
  const resistance = recentHighs.reduce((a, b) => Math.max(a, b), -Infinity);
  const support = recentLows.reduce((a, b) => Math.min(a, b), Infinity);
  return { support, resistance };
}

function detectLiquiditySweeps(candles, currentPrice) {
  if (!candles || candles.length < 50) return { bullishSweep: false, bearishSweep: false };
  const highs = candles.slice(-50).map(c => c.high);
  const lows = candles.slice(-50).map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  return {
    bullishSweep: currentPrice > maxHigh,
    bearishSweep: currentPrice < minLow,
    recentHigh: maxHigh,
    recentLow: minLow,
  };
}

function detectWyckoffPhase(candles) {
  if (!candles || candles.length < 50) return 'unknown';
  const recentRange = candles.slice(-20).reduce((s, c) => s + (c.high - c.low), 0) / 20;
  const olderRange = candles.slice(-50, -20).reduce((s, c) => s + (c.high - c.low), 0) / 30;
  const ratio = recentRange / (olderRange || 0.0001);
  if (ratio < 0.5) return 'accumulation';    // contraction
  if (ratio > 1.8) return 'distribution';     // expansion
  return 'markup_markdown';
}

function calculateVolatility(candles) {
  if (!candles || candles.length < 20) return 0.01;
  const ranges = candles.slice(-20).map(c => c.high - c.low);
  const atr = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const avgPrice = candles.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
  return atr / (avgPrice || 0.0001);
}

module.exports = { analyze };
