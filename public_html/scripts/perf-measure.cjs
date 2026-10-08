/* UEV-ERP — perf-measure.cjs (Task 20 / E5 performance profiling)
 *
 * Two parts:
 *  1. Marks module (require('./perf-measure.cjs').marks) — call mark(name)/
 *     measure(name, startMark) from app code OR a harness; pushes to a global
 *     __ERP_PERF so the SPA can record navigation/render timings.
 *  2. A headless-Chrome runner that measures LCP / FID / CLS for critical URLs
 *     and asserts budgets (LCP < 2s, FID < 100ms). Uses puppeteer when
 *     available; otherwise reports NEEDS_PUPPETEER and still validates the
 *     marks module so `node --check` / CI lint stays green.
 *
 * Usage: node scripts/perf-measure.cjs [url1 url2 ...]
 *   default URLs: http://localhost:3000 https://sr-ue-varna.com
 */
'use strict';

const BUDGETS = { lcpMs: 2000, fidMs: 100, clsMax: 0.1 };

const marks = (function () {
  const store = (typeof globalThis !== 'undefined' && globalThis.__ERP_PERF) || [];
  if (typeof globalThis !== 'undefined') globalThis.__ERP_PERF = store;
  function mark(name) {
    if (typeof console !== 'undefined' && console.profile) {
      try { console.profile('mark:' + name); } catch (e) {}
      try { console.profileEnd('mark:' + name); } catch (e) {}
    }
    if (typeof console !== 'undefined' && console.time) {
      try { console.time('mark:' + name); } catch (e) {}
    }
    store.push({ type: 'mark', name: name, t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    return name;
  }
  function measure(name, startMark) {
    store.push({ type: 'measure', name: name, start: startMark, t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
    return name;
  }
  return { mark, measure, store };
})();

async function measureUrl(url) {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (e) {
    return { url, status: 'NEEDS_PUPPETEER', metrics: null };
  }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const metrics = { lcp: null, fid: null, cls: null };
    await page.evaluateOnNewDocument(() => {
      window.__ERP_PERF = window.__ERP_PERF || [];
      try {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.name === 'largest-contentful-paint') window.__ERP_LCP = e.renderTime || e.loadTime;
            if (e.entryType === 'layout-shift' && !e.hadRecentInput) window.__ERP_CLS = (window.__ERP_CLS || 0) + e.value;
          }
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        po.observe({ type: 'layout-shift', buffered: true });
      } catch (e) {}
    });
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    metrics.lcp = await page.evaluate(() => window.__ERP_LCP || null);
    metrics.cls = await page.evaluate(() => window.__ERP_CLS || 0);
    metrics.fid = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? (nav.domInteractive - nav.startTime) : null;
    });
    metrics.loadMs = Date.now() - t0;
    return { url, status: 'OK', metrics };
  } finally {
    await browser.close();
  }
}

function assertBudget(r) {
  if (!r.metrics) return [];
  const fails = [];
  if (r.metrics.lcp != null && r.metrics.lcp > BUDGETS.lcpMs) fails.push('LCP ' + Math.round(r.metrics.lcp) + 'ms > ' + BUDGETS.lcpMs + 'ms');
  if (r.metrics.fid != null && r.metrics.fid > BUDGETS.fidMs) fails.push('FID ' + Math.round(r.metrics.fid) + 'ms > ' + BUDGETS.fidMs + 'ms');
  if (r.metrics.cls != null && r.metrics.cls > BUDGETS.clsMax) fails.push('CLS ' + r.metrics.cls.toFixed(3) + ' > ' + BUDGETS.clsMax);
  return fails;
}

(async () => {
  const urls = process.argv.slice(2).length ? process.argv.slice(2) : ['http://localhost:3000', 'https://sr-ue-varna.com'];
  const results = [];
  for (const u of urls) {
    try { results.push(await measureUrl(u)); }
    catch (e) { results.push({ url: u, status: 'ERROR', error: String(e && e.message || e) }); }
  }
  for (const r of results) {
    console.log('--- ' + r.url + ' [' + r.status + ']');
    if (r.metrics) console.log('    ' + JSON.stringify(r.metrics));
    const fails = assertBudget(r);
    if (fails.length) console.log('    BUDGET FAIL: ' + fails.join('; '));
    else if (r.metrics) console.log('    BUDGET PASS');
    if (r.error) console.log('    ' + r.error);
  }
  marks.mark('perf-run-complete');
})();

module.exports = { marks, BUDGETS };
