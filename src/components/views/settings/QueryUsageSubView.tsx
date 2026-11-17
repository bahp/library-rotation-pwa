import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '../../common/Icon.js';
import { SettingsSubViewHeader } from './SettingsPrimitives.js';
import {
  queryLogger,
  type ApiServiceId,
  type ServiceQuotaStatus,
} from '../../../features/telemetry/query-logger.js';
import { useBodyScrollLock } from '../../../hooks/useBodyScrollLock.js';

interface QueryUsageSubViewProps {
  onBack: () => void;
  backLabel: string;
}

export const QueryUsageSubView: React.FC<QueryUsageSubViewProps> = ({ onBack, backLabel }) => {
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

  useBodyScrollLock(confirmResetOpen || confirmClearOpen);

  const googleQuota = useMemo(() => queryLogger.getServiceQuota('google-books'), []);
  const geminiQuota = useMemo(() => queryLogger.getServiceQuota('gemini'), []);
  const openaiQuota = useMemo(() => queryLogger.getServiceQuota('openai'), []);
  const openLibraryQuota = useMemo(() => queryLogger.getServiceQuota('open-library'), []);

  const globalAlert = queryLogger.getGlobalQuotaAlert();
  const logs = queryLogger.getRecentLogs('all', 200);

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
        ? 'bg-[#8C4A4F] dark:bg-[#C48A8E]'
        : quota.isWarning
          ? 'bg-accent'
          : hasLimit
            ? 'bg-primary'
            : 'bg-secondary';

    return (
      <div className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-lg bg-surface-subtle text-primary flex items-center justify-center shrink-0">
              <Icon name={icon} className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-display text-base sm:text-lg font-semibold text-ink">
                {serviceName}
              </h3>
              <p className="text-[11px] text-ink-secondary">
                {hint}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
              quota.isExceeded
                ? 'bg-[#8C4A4F]/12 text-[#8C4A4F] dark:text-[#C48A8E] border border-[#8C4A4F]/30'
                : quota.isWarning
                  ? 'bg-accent/15 text-[#9E6E32] dark:text-[#D0AD55] border border-accent/35'
                  : 'bg-secondary/15 text-primary dark:text-secondary border border-secondary/30'
            }`}
          >
            {quota.isExceeded ? 'Exceeded' : quota.isWarning ? 'Warning 80%+' : hasLimit ? 'Healthy' : 'Unlimited'}
          </span>
        </div>

        {/* Meter Bar & Counter */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-mono-tabular font-bold text-ink text-base">
              {quota.count}{' '}
              <span className="text-xs font-normal text-ink-muted">
                {hasLimit ? `/ ${quota.limit} queries today` : 'queries today'}
              </span>
            </span>
            {hasLimit && (
              <span className="font-mono-tabular font-semibold text-ink-secondary">
                {quota.percent}%
              </span>
            )}
          </div>

          {hasLimit ? (
            <div className="w-full h-2 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${barColor}`}
                style={{ width: `${barPercent}%` }}
              />
            </div>
          ) : (
            <div className="w-full h-1.5 rounded-full bg-secondary/25" />
          )}

          <div className="flex items-center justify-between text-[11px] text-ink-muted pt-0.5">
            <span>
              {hasLimit ? (
                quota.isExceeded ? (
                  <span className="text-[#8C4A4F] dark:text-[#C48A8E] font-semibold">0 remaining today</span>
                ) : (
                  <span>{quota.remaining} remaining today</span>
                )
              ) : (
                'Free, unmetered public API'
              )}
            </span>

            {hasLimit && (
              <button
                type="button"
                onClick={() => {
                  setCustomLimitInput(String(quota.limit));
                  setEditingLimitService(quota.service);
                }}
                className="text-[11px] text-primary font-semibold hover:underline cursor-pointer"
              >
                Configure Limit
              </button>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="pt-2 border-t border-edge-subtle flex items-center gap-2">
            <input
              type="number"
              min={10}
              max={100000}
              value={customLimitInput}
              onChange={(e) => setCustomLimitInput(e.target.value)}
              className="w-28 h-8 px-2.5 rounded-lg bg-canvas border border-edge text-xs font-mono-tabular font-bold text-ink focus:outline-2 focus:outline-primary"
            />
            <button
              type="button"
              onClick={() => handleSaveCustomLimit(quota.service)}
              className="px-3 h-8 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingLimitService(null)}
              className="px-2 h-8 rounded-lg text-ink-secondary hover:text-ink text-xs cursor-pointer"
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
              className="h-9 px-3 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              title="Download JSON log"
              className="h-9 px-3 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 transition-colors cursor-pointer"
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
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
            globalAlert.level === 'error'
              ? 'bg-[#8C4A4F]/10 border-[#8C4A4F]/35 text-[#8C4A4F] dark:text-[#C48A8E]'
              : 'bg-accent/12 border-accent/35 text-ink'
          }`}
        >
          <span className="shrink-0 mt-0.5">
            <Icon name="info" className="w-4 h-4" />
          </span>
          <div className="space-y-0.5">
            <p className="font-semibold">
              {globalAlert.level === 'error' ? 'Daily Quota Limit Reached' : 'Daily Quota Threshold Warning'}
            </p>
            <p>{globalAlert.message}</p>
          </div>
        </div>
      )}

      {/* KPI Stat Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-surface border border-edge shadow-xs">
          <p className="text-[11px] font-semibold text-ink-secondary">Total Today</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-ink mt-0.5">
            {stats.total}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-surface border border-edge shadow-xs">
          <p className="text-[11px] font-semibold text-primary dark:text-secondary">Cached Hits (Saved)</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-primary dark:text-secondary mt-0.5">
            {stats.cachedCount}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-surface border border-edge shadow-xs">
          <p className="text-[11px] font-semibold text-ink-secondary">Avg Latency</p>
          <p className="text-xl sm:text-2xl font-bold font-mono-tabular text-ink mt-0.5">
            {stats.avgLatency} <span className="text-xs font-normal text-ink-muted">ms</span>
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-surface border border-edge shadow-xs">
          <p className="text-[11px] font-semibold text-ink-secondary">Errors / 429s</p>
          <p
            className={`text-xl sm:text-2xl font-bold font-mono-tabular mt-0.5 ${
              stats.errorsCount > 0 ? 'text-[#8C4A4F] dark:text-[#C48A8E]' : 'text-ink'
            }`}
          >
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
      <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink">
              Recent Query Log ({filteredLogs.length})
            </h3>
            <p className="text-xs text-ink-secondary mt-0.5">
              Inspecting the last {logs.length} outbound network requests and cache hits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyLogs}
              className="px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              {copiedExport ? 'Copied JSON!' : 'Copy Log JSON'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmResetOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
            >
              Reset Counters
            </button>
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-[#8C4A4F]/10 hover:bg-[#8C4A4F]/20 border border-[#8C4A4F]/30 text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E] transition-colors cursor-pointer"
            >
              Clear Log
            </button>
          </div>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
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
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-surface text-ink shadow-xs font-semibold'
                      : 'text-ink-secondary hover:text-ink'
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
              className="w-full h-9 pl-8 pr-3 rounded-lg bg-canvas border border-edge text-xs text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-primary"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none">
              <Icon name="search" className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Table / List */}
        {filteredLogs.length > 0 ? (
          <div className="divide-y divide-edge-subtle max-h-[460px] overflow-y-auto overscroll-contain">
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
                    {/* Status Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono-tabular font-bold shrink-0 mt-0.5 ${
                        isQuotaExceeded
                          ? 'bg-accent/15 text-[#9E6E32] dark:text-[#D0AD55] border border-accent/35'
                          : isError
                            ? 'bg-[#8C4A4F]/12 text-[#8C4A4F] dark:text-[#C48A8E]'
                            : log.cached
                              ? 'bg-[#394E61]/15 text-[#394E61] dark:text-[#94A8B8]'
                              : 'bg-secondary/15 text-primary dark:text-secondary'
                      }`}
                    >
                      {log.cached ? 'CACHED' : log.status || 'ERR'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink capitalize truncate">
                          {log.service.replace('-', ' ')}
                        </span>
                        <span className="text-ink-muted">·</span>
                        <span className="text-[11px] font-mono-tabular text-ink-muted">
                          {timeStr}
                        </span>
                      </div>

                      <p className="font-mono-tabular text-[11px] text-ink-secondary truncate mt-0.5">
                        {log.endpoint}
                      </p>

                      {log.error && (
                        <p className="text-[10px] text-[#8C4A4F] dark:text-[#C48A8E] mt-0.5 truncate">
                          {log.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-mono-tabular text-[11px] text-ink-secondary block">
                      {log.cached ? '0 ms' : `${log.latencyMs} ms`}
                    </span>
                    <span className="text-[10px] text-ink-muted block">
                      {log.statusText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center space-y-1">
            <p className="text-sm font-semibold text-ink">
              No query logs match the active filter.
            </p>
            <p className="text-xs text-ink-secondary">
              API queries to Google Books or AI services will automatically appear here in real time.
            </p>
          </div>
        )}
      </section>

      {/* Confirmation Dialog for Reset Counters */}
      {confirmResetOpen && (
        <div
          className="sheet-backdrop fixed inset-0 z-50 bg-[#142321]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setConfirmResetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl bg-surface border border-edge px-6 pt-3 pb-6 sm:p-6 space-y-4 shadow-2xl pb-safe sm:pb-6"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <h4 className="font-display font-semibold text-lg text-ink">
              Reset Today’s Counters?
            </h4>
            <p className="text-xs text-ink-secondary leading-relaxed">
              This will reset today’s call count for Google Books, Gemini, and OpenAI back to 0. Log history is preserved.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  queryLogger.resetTodayCounts();
                  setConfirmResetOpen(false);
                }}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
              >
                Reset Counters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Clear History */}
      {confirmClearOpen && (
        <div
          className="sheet-backdrop fixed inset-0 z-50 bg-[#142321]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setConfirmClearOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-up w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl bg-surface border border-edge px-6 pt-3 pb-6 sm:p-6 space-y-4 shadow-2xl pb-safe sm:pb-6"
          >
            <div className="w-10 h-1 bg-edge rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <h4 className="font-display font-semibold text-lg text-ink">
              Clear Audit Log History?
            </h4>
            <p className="text-xs text-ink-secondary leading-relaxed">
              This will delete all past query log rows from this device. Daily counters are untouched.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  queryLogger.clearLogs();
                  setConfirmClearOpen(false);
                }}
                className="min-h-[44px] sm:min-h-[36px] px-4 py-1.5 rounded-lg bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] text-xs font-semibold cursor-pointer active:scale-[0.98] transition-all"
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
