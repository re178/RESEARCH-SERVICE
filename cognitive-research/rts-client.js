const axios = require('axios');
const config = require('./config');

const { RTS_API_URL, API_KEY, API_SECRET } = config;

// Retry logic: exponential backoff for 5xx errors or network failures
async function callRTS(method, endpoint, data = null, params = null, retries = 3) {
  const url = `${RTS_API_URL}${endpoint}`;
  const headers = {
    'X-API-Key': API_KEY,
    'X-API-Secret': API_SECRET,
    'Content-Type': 'application/json',
  };

  try {
    const response = await axios({
      method,
      url,
      headers,
      data,
      params,
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    if (retries > 0 && error.response && error.response.status >= 500) {
      const delay = 1000 * (3 - retries + 1);
      console.warn(`[RTS] Retrying ${endpoint} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callRTS(method, endpoint, data, params, retries - 1);
    }
    if (error.response) {
      console.error(`[RTS] ${method} ${endpoint} failed: ${error.response.status} - ${error.response.data?.error || error.message}`);
    } else {
      console.error(`[RTS] Network error: ${error.message}`);
    }
    throw error;
  }
}

// --- Market Data ---
async function fetchCandles(pair, granularity, count) {
  return callRTS('GET', '/candles', null, { pair, granularity, count });
}

async function fetchPrice(symbol) {
  return callRTS('GET', `/price/${symbol}`);
}

// --- Submit Evidence via /signals (uses signals.write permission) ---
async function submitEvidence(evidence) {
  const payload = {
    pair: evidence.symbol,
    strategy: evidence.serviceName,
    action: evidence.evidenceType,
    signal: evidence.summary,
    metadata: {
      confidence: evidence.confidence,
      uncertainty: evidence.uncertainty,
      historicalReliability: evidence.historicalReliability,
      supportingData: evidence.supportingData,
      conflictingData: evidence.conflictingData,
      regime: evidence.applicableMarketRegime,
      failureConditions: evidence.failureConditions,
      validityDuration: evidence.expectedValidityDuration,
      processingTime: evidence.processingTime,
    },
    notes: JSON.stringify(evidence),
  };
  return callRTS('POST', '/signals', payload);
}

module.exports = {
  fetchCandles,
  fetchPrice,
  submitEvidence,
};
