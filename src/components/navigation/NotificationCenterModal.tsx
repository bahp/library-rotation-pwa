import React from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import type { AppNotification } from '../../types/models.js';

export const NotificationCenterModal: React.FC = () => {
  const {
    state,
    store,
    navigate,
    isNotificationCenterOpen,
    setIsNotificationCenterOpen,
  } = useApp();

  useBodyScrollLock(isNotificationCenterOpen);

  if (!isNotificationCenterOpen) return null;

  const notifications = Array.isArray(state.notifications) ? state.notifications : [];
  const activeAlerts = notifications.filter((n) => !n.dismissed);
  const historyAlerts = notifications.filter((n) => Boolean(n.dismissed));
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const closeModal = () => setIsNotificationCenterOpen(false);

  const handleOpenPreset = async (item: AppNotification) => {
    if (!item.readAt) {
      await store.markNotificationRead(item.id);
    }
    closeModal();
    navigate('presets');
  };

  const handleOpenRotations = async (item: AppNotification) => {
    if (!item.readAt) {
      await store.markNotificationRead(item.id);
    }
    closeModal();
    navigate('rotations');
  };

  const formatTimestamp = (iso: string) => {
    try {
      const parsed = new Date(iso);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const getKindIcon = (kind: AppNotification['kind']) => {
    if (kind === 'preset-upcoming') return 'sparkles';
    if (kind === 'swap-due') return 'rotations';
    return 'info';
  };

  const getKindAccent = (kind: AppNotification['kind']) => {
    if (kind === 'preset-upcoming') {
      return 'bg-surface-elevated text-accent border border-accent/40';
    }
    if (kind === 'swap-due') {
      return 'bg-surface-elevated text-primary border border-primary/35';
    }
    return 'bg-surface-subtle text-ink-secondary border border-edge';
  };

  const renderEntry = (item: AppNotification, isHistory = false) => {
    const isUnread = !item.readAt;
    const dateLabel = formatTimestamp(item.createdAt);

    return (
      <article
        key={item.id}
        data-notification-id={item.id}
        className={`rounded-xl border p-3.5 transition-colors ${
          isHistory
            ? 'bg-surface-subtle/60 border-edge-subtle opacity-80'
            : isUnread
              ? 'bg-surface border-primary/40 shadow-2xs'
              : 'bg-surface-subtle border-edge'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${getKindAccent(
              item.kind
            )}`}
          >
            <Icon name={getKindIcon(item.kind)} className="w-4 h-4" />
          </span>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {isUnread && !isHistory && (
                  <span
                    aria-label="Unread alert"
                    className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                  />
                )}
                <h3 className="text-xs sm:text-[13px] font-semibold text-ink leading-snug">
                  {item.title}
                </h3>
              </div>
              {dateLabel && (
                <span className="text-[10px] font-mono-tabular text-ink-muted shrink-0 whitespace-nowrap">
                  {dateLabel}
                </span>
              )}
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              {item.message}
            </p>

            <div className="pt-1.5 flex flex-wrap items-center gap-1.5">
              {item.presetId && (
                <button
                  type="button"
                  onClick={() => handleOpenPreset(item)}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Icon name="presets" className="w-3 h-3" />
                  <span>Open Preset</span>
                </button>
              )}

              {item.kind === 'swap-due' && (
                <button
                  type="button"
                  onClick={() => handleOpenRotations(item)}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Icon name="rotations" className="w-3 h-3" />
                  <span>Rotate Shelf</span>
                </button>
              )}

              {isUnread && !isHistory && (
                <button
                  type="button"
                  onClick={() => store.markNotificationRead(item.id)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-[11px] font-semibold text-ink transition-colors cursor-pointer"
                >
                  Mark read
                </button>
              )}

              {!item.dismissed && (
                <button
                  type="button"
                  onClick={() => store.dismissNotificationAlert(item.id)}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-semibold text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-center-title"
      className="sheet-backdrop fixed inset-0 z-50 bg-scrim backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden text-left"
      onClick={closeModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Header */}
        <div className="px-5 py-4 border-b border-edge-subtle flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-surface-elevated border border-edge text-primary flex items-center justify-center shrink-0">
              <Icon name="bell" className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2
                id="notification-center-title"
                className="font-display text-xl font-semibold text-ink leading-tight truncate"
              >
                Notifications &amp; Alerts
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                {unreadCount > 0
                  ? `${unreadCount} unread reminder${unreadCount === 1 ? '' : 's'}`
                  : notifications.length > 0
                    ? `${notifications.length} saved in alert history`
                    : 'Upcoming collections & swap cycles appear here'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            aria-label="Close notifications"
            className="min-h-[44px] min-w-[44px] sm:min-h-[38px] sm:min-w-[38px] rounded-lg text-ink-secondary hover:bg-surface-elevated flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        {/* Bulk Utility Actions */}
        {notifications.length > 0 && (
          <div className="px-5 py-2.5 bg-surface-subtle border-b border-edge-subtle flex flex-wrap items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-ink-secondary">
              {activeAlerts.length} active · {historyAlerts.length} dismissed
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => store.markAllNotificationsRead()}
                  className="text-[11px] font-semibold text-primary hover:underline px-2 py-1 cursor-pointer"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => store.clearNotificationHistory()}
                className="text-[11px] font-semibold text-danger hover:underline px-2 py-1 cursor-pointer"
              >
                Clear history
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {notifications.length === 0 ? (
            <div className="rounded-xl bg-surface-subtle border border-edge p-8 text-center space-y-2.5">
              <div className="w-11 h-11 rounded-lg bg-surface-elevated border border-edge text-ink-secondary mx-auto flex items-center justify-center">
                <Icon name="bell" className="w-5 h-5" />
              </div>
              <p className="font-display text-lg font-semibold text-ink">
                All caught up
              </p>
              <p className="text-xs text-ink-secondary max-w-xs mx-auto leading-relaxed">
                Seasonal collection reminders and shelf swap day notices will be logged here automatically.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    closeModal();
                    navigate('presets');
                  }}
                  className="min-h-[38px] px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Browse Seasonal Presets
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeAlerts.length > 0 && (
                <section aria-label="Active reminders" className="space-y-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Active Reminders ({activeAlerts.length})
                  </h3>
                  <div className="space-y-2.5">
                    {activeAlerts.map((item) => renderEntry(item, false))}
                  </div>
                </section>
              )}

              {historyAlerts.length > 0 && (
                <section aria-label="Notification history" className="space-y-2.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                    Alert History ({historyAlerts.length})
                  </h3>
                  <div className="space-y-2">
                    {historyAlerts.map((item) => renderEntry(item, true))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
