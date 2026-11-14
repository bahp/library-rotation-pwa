/**
 * @fileoverview Reading Passport Activity & Query Usage Logger Tests
 * - Verifies API Query Logger records events, tracks daily usage, computes quotas,
 *   raises warnings at 80% and 100% thresholds, and exports CSV / JSON reports.
 * - Verifies Reading Passport / Stamp Book configuration in Play Apps catalog.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { queryLogger } from '../src/features/telemetry/query-logger.js';
import { getPlayAppsConfig, PLAY_APPS_CONFIG } from '../src/config/play-apps.js';
import { renderPlayView, createDefaultPlayUiState } from '../src/features/play/play-view.js';
import { createStorageAdapter } from '../src/core/storage.js';
import { createAppStore } from '../src/core/store.js';

describe('Reading Passport & Query Usage Logger Suite', () => {
  beforeEach(() => {
    queryLogger.clearAll();
  });

  it('queryLogger records API requests, tracks daily counts, and computes quota percentages', () => {
    // Fresh state
    const initialQuota = queryLogger.getServiceQuota('google-books');
    assert.equal(initialQuota.count, 0);

    // Record 10 Google Books requests
    for (let i = 0; i < 10; i++) {
      queryLogger.recordQuery({
        service: 'google-books',
        endpoint: '/books/v1/volumes',
        cached: i % 2 === 0,
        status: 200,
        latencyMs: 45,
      });
    }

    const quotaAfter10 = queryLogger.getServiceQuota('google-books');
    assert.equal(quotaAfter10.count, 10);
    assert.equal(quotaAfter10.limit, 1000);
    assert.equal(quotaAfter10.percent, 1); // 10 / 1000 = 1%
    assert.equal(quotaAfter10.remaining, 990);
  });

  it('queryLogger computes proactive warnings at 80% and alerts at 100% quota limit', () => {
    // Normal usage check
    queryLogger.recordQuery({
      service: 'google-books',
      endpoint: '/books/v1/volumes',
      status: 200,
      latencyMs: 30,
    });
    let alert = queryLogger.getGlobalQuotaAlert();
    assert.equal(alert.hasAlert, false);

    // Set custom limit to 10 for test and push to 8 (80%)
    queryLogger.setDailyLimit('google-books', 10);
    for (let i = 1; i < 8; i++) {
      queryLogger.recordQuery({
        service: 'google-books',
        endpoint: '/books/v1/volumes',
        status: 200,
        latencyMs: 30,
      });
    }
    alert = queryLogger.getGlobalQuotaAlert();
    assert.equal(alert.hasAlert, true);
    assert.equal(alert.level, 'warning');
    assert.match(alert.message, /80%/i);

    // Push past 100%
    for (let i = 8; i <= 10; i++) {
      queryLogger.recordQuery({
        service: 'google-books',
        endpoint: '/books/v1/volumes',
        status: 429,
        latencyMs: 20,
        error: 'Rate limit reached',
      });
    }
    alert = queryLogger.getGlobalQuotaAlert();
    assert.equal(alert.hasAlert, true);
    assert.equal(alert.level, 'error');
    assert.match(alert.message, /daily limit reached/i);
  });

  it('queryLogger generates valid CSV and JSON exports', () => {
    queryLogger.recordQuery({
      service: 'gemini',
      endpoint: 'models/gemini-2.5-flash:generateContent',
      status: 200,
      latencyMs: 320,
    });
    queryLogger.recordQuery({
      service: 'open-library',
      endpoint: '/api/books',
      status: 200,
      latencyMs: 150,
      cached: true,
    });

    const csv = queryLogger.exportLogsAsCsv();
    assert.ok(csv.includes('Timestamp,Service,Status,Status Text,Latency (ms),Cached,Endpoint,Error'));
    assert.ok(csv.includes('gemini'));
    assert.ok(csv.includes('open-library'));

    const jsonStr = queryLogger.exportLogsAsJson();
    const parsed = JSON.parse(jsonStr);
    assert.equal(parsed.logs.length, 2);
    assert.ok(parsed.todayCounts['gemini'] >= 1);
  });

  it('Play Apps catalog registers reading-passport game with valid config and assets', () => {
    const apps = getPlayAppsConfig();
    const passportApp = apps.find((a) => a.id === 'reading-passport');
    assert.ok(passportApp, 'reading-passport app must exist in play apps config');
    assert.match(passportApp.title, /Reading Passport/);
    assert.equal(passportApp.badgeLabel, 'Printable');
    assert.ok(passportApp.imageUrl.includes('reading-passport-preview'));
    assert.ok(passportApp.logoUrl.includes('reading-passport-logo'));
    assert.ok(passportApp.description.includes('stamp') || passportApp.description.includes('passport'));
  });

  it('Play view renders reading-passport card with launcher button', async () => {
    const storage = createStorageAdapter({ forceMemory: true });
    const store = createAppStore(storage);
    await store.init();
    const state = store.getState();

    const playUiState = createDefaultPlayUiState();
    const html = renderPlayView({ state, playUiState });

    assert.ok(html.includes('Reading Passport'), 'Should render Reading Passport card');
    assert.ok(html.includes('data-action="open-play-app"'), 'Should contain launch trigger');
    assert.ok(html.includes('data-play-app-id="reading-passport"'), 'Should target reading-passport app ID');
  });

  it('Play Apps config allows customizing reading-passport attributes via overrides', () => {
    const overridden = getPlayAppsConfig({
      'reading-passport': {
        title: 'Kids Explorer Passport',
        badgeLabel: 'Special Activity',
      },
    });

    const passportApp = overridden.find((a) => a.id === 'reading-passport');
    assert.equal(passportApp?.title, 'Kids Explorer Passport');
    assert.equal(passportApp?.badgeLabel, 'Special Activity');

    // Default configuration remains untouched
    const fresh = getPlayAppsConfig();
    assert.equal(fresh.find((a) => a.id === 'reading-passport')?.title, 'Reading Passport & Stamp Book');
  });
});

