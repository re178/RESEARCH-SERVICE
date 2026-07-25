const express = require('express');
const config = require('./config');
const { fetchCandles, fetchPrice, submitEvidence } = require('./rts-client');
const { analyze } = require('./analyzer');
const { buildEvidence } = require('./evidence');

const app = express();
const { SYMBOL, SERVICE_NAME, POLL_INTERVAL_MS, PORT } = config;

let lastPrice = null;
let lastRun = 0;
let eventCounter = 0;
let isProcessing = false; // Prevents overlapping runs if RTS is slow

async function pollAndAnalyze() {
  // Prevent concurrent runs
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 1. Get latest price
    const priceData = await fetchPrice(SYMBOL);
    const currentPrice = priceData.bid || priceData.price || priceData.ask;
    if (!currentPrice) {
      isProcessing = false;
      return;
    }

    // 2. Skip if price hasn't changed (save resources)
    if (lastPrice === currentPrice) {
      isProcessing = false;
      return;
    }
    lastPrice = currentPrice;

    // 3. Cooldown: don't analyze more than once per POLL_INTERVAL_MS
    const now = Date.now();
    if (now - lastRun < POLL_INTERVAL_MS) {
      isProcessing = false;
      return;
    }
    lastRun = now;

    // 4. Fetch required cache
    const [m1, m5, h1] = await Promise.all([
      fetchCandles(SYMBOL, 'M1', 500),
      fetchCandles(SYMBOL, 'M5', 300),
      fetchCandles(SYMBOL, 'H1', 100),
    ]);

    // 5. Run scientific analysis
    const start = performance.now();
    const result = analyze(m1, m5, h1, currentPrice);
    const processingTime = Math.round(performance.now() - start);
    result.processingTime = processingTime;

    // 6. Build standardised evidence
    const eventId = `${SERVICE_NAME}_${++eventCounter}_${Date.now()}`;
    const evidence = buildEvidence({
      serviceName: SERVICE_NAME,
      eventId,
      symbol: SYMBOL,
      evidenceType: 'price_action',
      summary: result.summary,
      confidence: result.confidence,
      uncertainty: result.uncertainty,
      historicalReliability: 0.82, // calibrated over time; Validation Service adjusts this
      supportingData: {
        trend: result.trend,
        directionScore: result.directionScore,
        wyckoffPhase: result.wyckoffPhase,
        support: result.support,
        resistance: result.resistance,
        liquidity: result.liquidity,
        volatility: result.volatility,
      },
      conflictingData: {
        // Could include divergence signals in future
      },
      applicableMarketRegime: result.trend === 'bullish' ? 'trending_up' : (result.trend === 'bearish' ? 'trending_down' : 'neutral'),
      failureConditions: ['spread > 3 points', 'volatility > 0.025'],
      expectedValidityDuration: 120,
      processingTime,
    });

    // 7. Submit to RTS via POST /signals
    await submitEvidence(evidence);
    console.log(`[${SERVICE_NAME}] ✅ Submitted | Price: ${currentPrice} | Score: ${result.directionScore.toFixed(3)} | Conf: ${(result.confidence*100).toFixed(0)}%`);

  } catch (error) {
    console.error(`[${SERVICE_NAME}] ❌ Error:`, error.message);
  } finally {
    isProcessing = false;
  }
}

// Poll loop
setInterval(pollAndAnalyze, Math.min(POLL_INTERVAL_MS, 200));

// Health / Status endpoints
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/status', (req, res) => res.json({
  service: SERVICE_NAME,
  symbol: SYMBOL,
  lastPrice,
  isProcessing,
  lastRun: new Date(lastRun).toISOString(),
}));

app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] 🚀 Running on port ${PORT}, polling ${SYMBOL} every ${POLL_INTERVAL_MS}ms`);
  // Initial immediate run
  setTimeout(pollAndAnalyze, 100);
});
