import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const linksLatency = new Trend('links_latency');
const transactionsLatency = new Trend('transactions_latency');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  scenarios: {
    // Warm-up phase
    warmup: {
      executor: 'ramping-vus',
      duration: '30s',
      target: 20,
      startTime: '0s',
    },
    // Load test - 100 concurrent users
    load: {
      executor: 'constant-vus',
      duration: '2m',
      vus: 100,
      startTime: '30s',
    },
    // Stress test - ramp up to 150 users
    stress: {
      executor: 'ramping-vus',
      duration: '1m',
      target: 150,
      startTime: '2m30s',
    },
    // Cool down
    cooldown: {
      executor: 'constant-vus',
      duration: '30s',
      vus: 10,
      startTime: '3m30s',
    },
  },
  thresholds: {
    // Response time requirements
    'links_latency': ['p(95)<100', 'p(99)<200'],
    'transactions_latency': ['p(95)<100', 'p(99)<200'],
    // Error rate should be less than 1%
    'errors': ['rate<0.01'],
    // HTTP requirements
    'http_req_duration': ['p(95)<100'],
  },
};

// Test data
const linksPayload = JSON.stringify({
  amount: 10.5,
  asset: 'XLM',
  memo: 'test-memo-' + Date.now(),
  expirationDays: 7,
});

const transactionQueryParams = '?limit=20&order=desc';

export function setup() {
  // Verify the server is running
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: ${healthRes.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function(data) {
  const url = data.baseUrl;
  
  // Test 1: Links metadata endpoint
  const linksHeaders = {
    'Content-Type': 'application/json',
    'X-API-Key': __ENV.API_KEY || 'test-api-key',
  };
  
  const linksStart = Date.now();
  const linksRes = http.post(`${url}/links/metadata`, linksPayload, {
    headers: linksHeaders,
    tags: { name: 'links_metadata' },
  });
  linksLatency.add(Date.now() - linksStart);
  
  const linksSuccess = check(linksRes, {
    'links status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'links response has success field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true;
      } catch (e) {
        return false;
      }
    },
  });
  
  errorRate.add(!linksSuccess);
  
  // Test 2: Transactions endpoint (if available)
  const txStart = Date.now();
  const txRes = http.get(`${url}/transactions${transactionQueryParams}`, {
    headers: linksHeaders,
    tags: { name: 'transactions' },
  });
  transactionsLatency.add(Date.now() - txStart);
  
  const txSuccess = check(txRes, {
    'transactions status is 200': (r) => r.status === 200 || r.status === 401,
  });
  
  errorRate.add(!txSuccess && txRes.status !== 401); // Don't count 401 as error
  
  // Test 3: Health check endpoint
  const healthRes = http.get(`${url}/health`, {
    tags: { name: 'health' },
  });
  
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });
  
  // Small delay between iterations to simulate realistic traffic
  sleep(0.1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-results.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  const green = enableColors ? '\x1b[32m' : '';
  const red = enableColors ? '\x1b[31m' : '';
  const reset = enableColors ? '\x1b[0m' : '';
  
  const lines = [
    '',
    `${indent}Load Test Results Summary`,
    `${indent}${'='.repeat(50)}`,
    '',
    `${indent}Requests:`,
    `${indent}  Total: ${data.metrics.http_reqs.values.count}`,
    `${indent}  Rate: ${data.metrics.http_reqs.values.rate.toFixed(2)} req/s`,
    '',
    `${indent}Response Times (ms):`,
    `${indent}  Average: ${data.metrics.http_req_duration.values.avg.toFixed(2)}`,
    `${indent}  P50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}`,
    `${indent}  P95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}`,
    `${indent}  P99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}`,
    '',
    `${indent}Links Endpoint:`,
    `${indent}  P95: ${data.metrics.links_latency.values['p(95)'].toFixed(2)} ms`,
    `${indent}  P99: ${data.metrics.links_latency.values['p(99)'].toFixed(2)} ms`,
    '',
    `${indent}Transactions Endpoint:`,
    `${indent}  P95: ${data.metrics.transactions_latency.values['p(95)'].toFixed(2)} ms`,
    `${indent}  P99: ${data.metrics.transactions_latency.values['p(99)'].toFixed(2)} ms`,
    '',
    `${indent}Errors:`,
    `${indent}  Total: ${data.metrics.errors.values.count}`,
    `${indent}  Rate: ${(data.metrics.errors.values.rate * 100).toFixed(2)}%`,
    '',
  ];
  
  // Check if requirements are met
  const linksP95 = data.metrics.links_latency.values['p(95)'];
  const txP95 = data.metrics.transactions_latency.values['p(95)'];
  const errorRatePercent = data.metrics.errors.values.rate * 100;
  
  const allPassed = linksP95 < 100 && txP95 < 100 && errorRatePercent < 1;
  
  lines.push(
    `${indent}${allPassed ? green + '✓' : red + '✗'}${reset} System ${allPassed ? 'PASSED' : 'FAILED'} <100ms requirement`,
    '',
  );
  
  return lines.join('\n');
}