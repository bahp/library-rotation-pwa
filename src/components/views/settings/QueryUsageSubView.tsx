import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../common/Icon.js';
import { SettingsSubViewHeader } from './SettingsPrimitives.js';
import {
  queryLogger,
  type ApiServiceId,
  type QueryLogEntry,
  type ServiceQuotaStatus,
} from '../../../features/telemetry/query-logger.js';

interface QueryUsageSubViewProps {
  onBack: () => void;
  backLabel: string;
}

export const QueryUsageSubView: React.FC<QueryUsageSubViewProps> = ({ onBack, backLabel }) => {
  // Subscribe to live query logger updates
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsubscribe = queryLogger.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const [activeFilter, setActiveFilter] = useState<ApiServiceId | 'all' | 'errors'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLimitService, setEditingLimitService] = useState<ApiServiceId | null>(null);
  const [customLimitInput, setCustomLimitInput] = useState<string>('');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [copiedExport, setCopiedExport] = useState(false);

  // Quotas for all services
  const googleQuota = useMemo(() => queryLogger.getServiceQuota('google-books'), []);
  const geminiQuota = useMemo(() => queryLogger.getServiceQuota('gemini'), []);
  const openaiQuota = useMemo(() => queryLogger.getServiceQuota('openai'), []);
  const openLibraryQuota = useMemo(() => queryLogger.getServiceQuota('open-library'), []);

  const globalAlert = queryLogger.getGlobalQuotaAlert();

  // All logs
  const logs = queryLogger.getRecentLogs('all', 200);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (activeFilter === 'errors') {
        if (log.status === 200 && !log.error) return false;
      } else if (activeFilter !== 'all') {
        if (log.service !== activeFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.endpoint.toLowerCase().includes(q) ||
          log.service.toLowerCase().includes(q) ||
          (log.error && log.error.toLowerCase().includes(q)) ||
          log.statusText.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [logs, activeFilter, searchQuery]);

  // Aggregate stats today
  const stats = useMemo(() => {
    const todayCounts = queryLogger.getDailyCounts();
    const total = Object.values(todayCounts).reduce((acc, curr) => acc + curr, 0);
    const cachedCount = logs.filter((l) => l.cached).length;
    const errorsCount = logs.filter((l) => l.status >= 400 || l.status === 0).length;
    const quotaHits = logs.filter((l) => l.status === 429).length;

    const latencies = logs.filter((l) => !l.cached && l.latencyMs > 0).map((l) => l.latencyMs);
    const avgLatency =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    return { total, cachedCount, errorsCount, quotaHits, avgLatency };
  }, [logs]);

  const handleSaveCustomLimit = (service: ApiServiceId) => {
    const val = parseInt(customLimitInput, 10);
    if (!isNaN(val) && val >= 0) {
      queryLogger.setDailyLimit(service, val);
    }
    setEditingLimitService(null);
  };

  const handleDownloadCsv = () => {
    const csv = queryLogger.exportLogsAsCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const json = queryLogger.exportLogsAsJson();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyLogs = () => {
    const json = queryLogger.exportLogsAsJson();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(() => {
        setCopiedExport(true);
        setTimeout(() => setCopiedExport(false), 2000);
      });
    }
  };

  const renderQuotaCard = (quota: ServiceQuotaStatus, serviceName: string, icon: string, hint: string) => {
    const isEditing = editingLimitService === quota.service;
    const hasLimit = quota.limit > 0;
    const barPercent = hasLimit ? Math.min(100, quota.percent) : 100;
    const barColor =
      quota.isExceeded
        ? 'bg-rose-500'
        : quota.isWarning
          ? 'bg-amber-500'
          : hasLimit
            ? 'bg-forest-700 dark:bg-[#5ED3DA]'
            : 'bg-emerald-500';

    return (
      <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-linen-100 dark:bg-night-800 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center shrink-0">
              <Icon name={icon} className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-sm sm:text-base font-bold text-forest-900 dark:text-white">
                {serviceName}
              </h3>
              <p className="text-[11px] text-stone-ink dark:text-slate-400">
                {hint}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              quota.isExceeded
                ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
                : quota.isWarning
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
            }`}
          >
            {quota.isExceeded ? 'Exceeded' : quota.isWarning ? 'Warning 80%+' : hasLimit ? 'Healthy' : 'Unlimited'}
          </span>
        </div>

        {/* Meter Bar & Counter */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-mono-tabular font-bold text-forest-900 dark:text-white text-base">
              {quota.count}{' '}
              <span className="text-xs font-normal text-stone-500">
                {hasLimit ? `/ ${quota.limit} queries today` : 'queries today'}
              </span>
            </span>
            {hasLimit && (
              <span className="font-mono-tabular font-bold text-stone-600 dark:text-slate-300">
                {quota.percent}%
              </span>
            )}
          </div>

          {hasLimit ? (
            <div className="w-full h-2 rounded-full bg-linen-100 dark:bg-night-950 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${barColor}`}
                style={{ width: `${barPercent}%` }}
              />
            </div>
          ) : (
            <div className="w-full h-1.5 rounded-full bg-emerald-500/20" />
          )}

          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-slate-400 pt-0.5">
            <span>
              {hasLimit ? (
                quota.isExceeded ? (
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">0 remaining today</span>
                ) : (
                  <span>{quota.remaining} remaining today</span>
                )
              ) : (
                'Free, unmetered public API'
              )}
            </span>

            {/* Edit daily limit trigger */}
            {hasLimit && (
              <button
                type="button"
                onClick={() => {
                  setCustomLimitInput(String(quota.limit));
                  setEditingLimitService(quota.service);
                }}
                className="text-[11px] text-forest-700 dark:text-[#5ED3DA] font-semibold hover:underline cursor-pointer"
              >
                Configure Limit
              </button>
            )}
          </div>
        </div>

        {/* Limit Editor Input Modal / Popover */}
        {isEditing && (
          <div className="pt-2 border-t border-linen-200 dark:border-night-800 flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={100000}
              value={customLimitInput}
              onChange={(e) => setCustomLimitInput(e.target.value)}
              className="w-28 h-8 px-2.5 rounded-lg bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs font-mono font-bold text-forest-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => handleSaveCustomLimit(quota.service)}
              className="px-3 h-8 rounded-lg bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold transition-colors cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingLimitService(null)}
              className="px-2 h-8 rounded-lg text-stone-500 hover:text-stone-700 text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <SettingsSubViewHeader
        title="API &amp; Query Usage Monitor"
        subtitle="Track request volumes, daily limits, rate limits, and audit logs for Google Books, Gemini, and OpenAI."
        backLabel={backLabel}
        onBack={onBack}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              title="Download CSV log"
              className="h-9 px-3 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              title="Download JSON log"
              className="h-9 px-3 rounded-xl bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-forest-900 dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        }
      />

      {/* Proactive Quota Warning Banner */}
      {globalAlert.hasAlert && (
        <div
          role="alert"
          className={`p-4 rounded-2xl border flex items-start gap-3 text-xs leading-relaxed ${
            globalAlert.level === 'error'
              ? 'bg-rose-50 border-rose-300 dark:bg-rose-950/50 dark:border-rose-800 text-rose-900 dark:text-rose-100'
              : 'bg-amber-50 border-amber-300 dark:bg-amber-950/50 dark:border-amber-800 text-amber-900 dark:text-amber-100'
          }`}
        >
          <span className="text-lg shrink-0">
            {globalAlert.level === 'error' ? '🛑' : '⚠️'}
          </span>
          <div className="space-y-0.5">
            <p className="font-bold">
              {globalAlert.level === 'error' ? 'Daily Quota Limit Reached' : 'Daily Quota Threshold Warning'}
            </p>
            <p>{globalAlert.message}</p>
          </div>
        </div>
      )}

      {/* KPI Stat Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 shadow-2xs">
          <p className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">Total Today</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-forest-900 dark:text-white mt-0.5">
            {stats.total}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 shadow-2xs">
          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Cached Hits (Saved)</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-emerald-700 dark:text-emerald-400 mt-0.5">
            {stats.cachedCount}
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 shadow-2xs">
          <p className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">Avg Latency</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-forest-900 dark:text-white mt-0.5">
            {stats.avgLatency} <span className="text-xs font-normal">ms</span>
          </p>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 shadow-2xs">
          <p className="text-[11px] font-semibold text-stone-500 dark:text-slate-400">Errors / 429s</p>
          <p className={`text-xl sm:text-2xl font-bold font-mono-tabular mt-0.5 ${stats.errorsCount > 0 ? 'text-rose-600' : 'text-forest-900 dark:text-white'}`}>
            {stats.errorsCount}
          </p>
        </div>
      </div>

      {/* Service Quota Monitors Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {renderQuotaCard(
          googleQuota,
          'Google Books Volumes API',
          'database',
          'Standard 1,000 queries/day allowance for ISBN lookups & cover matching'
        )}
        {renderQuotaCard(
          geminiQuota,
          'Gemini AI Assistant',
          'sparkles',
          'Book tagging, Smart Curator, and Library Recommendations'
        )}
        {renderQuotaCard(
          openaiQuota,
          'OpenAI / BYOK Endpoint',
          'activity',
          'Custom endpoints and OpenAI-compatible proxy models'
        )}
        {renderQuotaCard(
          openLibraryQuota,
          'Open Library Fallback',
          'library',
          'Open community fallback when Google quota is exhausted or editions missing'
        )}
      </div>

      {/* Query Audit Log Section */}
      <section className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-forest-900 dark:text-white">
              Recent Query Log ({filteredLogs.length})
            </h3>
            <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
              Inspecting the last {logs.length} outbound network requests and cache hits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLogs}
              className="px-3 py-1.5 rounded-lg bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-stone-800 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {copiedExport ? 'Copied JSON!' : 'Copy Log JSON'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-xs font-semibold text-stone-800 dark:text-slate-200 transition-colors cursor-pointer"
            >
              Reset Counters
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/60 text-xs font-semibold text-rose-700 dark:text-rose-300 transition-colors cursor-pointer"
            >
              Clear Log
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
            {[
              { id: 'all', label: 'All' },
              { id: 'google-books', label: 'Google Books' },
              { id: 'gemini', label: 'Gemini' },
              { id: 'openai', label: 'OpenAI' },
              { id: 'open-library', label: 'Open Library' },
              { id: 'errors', label: 'Errors Only' },
            ].map((tab) => {
              const active = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs font-bold'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[200px]">
            <input
              type="search"
              placeholder="Search query, ISBN, or task..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-xl bg-linen-50 dark:bg-night-950 border border-linen-200 dark:border-night-700 text-xs text-forest-900 dark:text-white placeholder:text-stone-400 focus:outline-2 focus:outline-forest-700"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none">
              <Icon name="search" className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Table / List */}
        {filteredLogs.length > 0 ? (
          <div className="divide-y divide-linen-200/70 dark:divide-night-800 max-h-[460px] overflow-y-auto overscroll-contain">
            {filteredLogs.map((log) => {
              const date = new Date(log.timestamp);
              const timeStr = date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              const isError = log.status >= 400 || log.status === 0;
              const isQuotaExceeded = log.status === 429;

              return (
                <div key={log.id} className="py-2.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Status Pill */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 mt-0.5 ${
                        isQuotaExceeded
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300'
                          : isError
                            ? 'bg-rose-100 text-rose-900 dark:bg-rose-950/70 dark:text-rose-200'
                            : log.cached
                              ? 'bg-blue-100 text-blue-900 dark:bg-blue-950/70 dark:text-blue-200'
                              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-200'
                      }`}
                    >
                      {log.cached ? 'CACHED' : log.status || 'ERR'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-forest-900 dark:text-white capitalize truncate">
                          {log.service.replace('-', ' ')}
                        </span>
                        <span className="text-stone-400">·</span>
                        <span className="text-[11px] font-mono-tabular text-stone-500 dark:text-slate-400">
                          {timeStr}
                        </span>
                      </div>

                      <p className="font-mono text-[11px] text-stone-700 dark:text-slate-300 truncate mt-0.5">
                        {log.endpoint}
                      </p>

                      {log.error && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                          {log.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono-tabular text-[11px] text-stone-500 dark:text-slate-400 block">
                      {log.cached ? '0 ms' : `${log.latencyMs} ms`}
                    </span>
                    <span className="text-[10px] text-stone-400 block">
                      {log.statusText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center space-y-1">
            <p className="text-sm font-semibold text-forest-900 dark:text-white">
              No query logs match the active filter.
            </p>
            <p className="text-xs text-stone-ink dark:text-slate-400">
              API queries to Google Books or AI services will automatically appear here in real time.
            </p>
          </div>
        )}
      </section>

      {/* Confirmation Dialog for Reset Counters */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 p-6 space-y-4 shadow-xl">
            <h4 className="font-display font-bold text-base text-forest-900 dark:text-white">
              Reset Today’s Counters?
            </h4>
            <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed">
              This will reset today’s call count for Google Books, Gemini, and OpenAI back to 0. Log history is preserved.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-linen-100 text-stone-700 dark:bg-night-800 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  queryLogger.resetTodayCounts();
                  setConfirmResetOpen(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 text-xs font-bold cursor-pointer"
              >
                Reset Counters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Clear History */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 p-6 space-y-4 shadow-xl">
            <h4 className="font-display font-bold text-base text-forest-900 dark:text-white">
              Clear Audit Log History?
            </h4>
            <p className="text-xs text-stone-600 dark:text-slate-300 leading-relaxed">
              This will delete all past query log rows from this device. Daily counters are untouched.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-linen-100 text-stone-700 dark:bg-night-800 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  queryLogger.clearLogs();
                  setConfirmClearOpen(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer"
              >
                Clear Log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
