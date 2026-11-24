import React from 'react';
import { Icon } from '../../common/Icon.js';

export type SettingsSectionId =
  | 'profiles'
  | 'appearance'
  | 'language'
  | 'shelf-rules'
  | 'catalog'
  | 'ai'
  | 'query-usage'
  | 'offline-storage'
  | 'backup'
  | 'dev-tools'
  | 'whats-new'
  | 'guides'
  | 'icon-legend'
  | 'privacy'
  | 'terms'
  | 'impressum'
  | 'rate'
  | 'feedback'
  | 'donate';

interface SettingsGroupProps {
  title: string;
  id?: string;
  children: React.ReactNode;
}

export const SettingsGroup: React.FC<SettingsGroupProps> = ({ title, id, children }) => {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2
        id={id}
        className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
      >
        {title}
      </h2>
      <div className="rounded-xl bg-surface border border-edge divide-y divide-edge-subtle overflow-hidden shadow-xs">
        {children}
      </div>
    </section>
  );
};

interface SettingsMenuRowProps {
  icon: string;
  iconTone?: 'teal' | 'amber' | 'indigo' | 'rose' | 'slate';
  title: string;
  subtitle?: string;
  value?: string;
  onClick: () => void;
  testId?: string;
}

const ICON_TONE_CLASSES: Record<NonNullable<SettingsMenuRowProps['iconTone']>, string> = {
  teal: 'bg-primary/10 text-primary',
  amber: 'bg-warning/12 text-warning',
  indigo: 'bg-info/12 text-info',
  rose: 'bg-danger/12 text-danger',
  slate: 'bg-surface-elevated text-ink-secondary',
};

export const SettingsMenuRow: React.FC<SettingsMenuRowProps> = ({
  icon,
  iconTone = 'teal',
  title,
  subtitle,
  value,
  onClick,
  testId,
}) => {
  return (
    <button
      type="button"
      data-settings-row={testId}
      onClick={onClick}
      className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-surface-subtle active:bg-surface-elevated transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-primary cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ICON_TONE_CLASSES[iconTone]}`}
        >
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-xs text-ink-secondary truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {value && (
          <span className="text-xs font-medium text-ink-secondary max-w-[130px] sm:max-w-[180px] truncate">
            {value}
          </span>
        )}
        <Icon name="chevronRight" className="w-4 h-4 text-ink-muted" />
      </div>
    </button>
  );
};

interface SettingsSubViewHeaderProps {
  title: string;
  subtitle?: string;
  backLabel: string;
  onBack: () => void;
  rightSlot?: React.ReactNode;
}

export const SettingsSubViewHeader: React.FC<SettingsSubViewHeaderProps> = ({
  title,
  subtitle,
  backLabel,
  onBack,
  rightSlot,
}) => {
  return (
    <div className="space-y-2 pb-1">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          data-settings-back="true"
          className="min-h-[44px] -ml-2 pl-1.5 pr-3.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-sm font-semibold text-primary hover:bg-surface-subtle active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-primary cursor-pointer"
        >
          <Icon name="chevronLeft" className="w-5 h-5 shrink-0" />
          <span>{backLabel}</span>
        </button>

        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-ink-secondary mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
