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
  | 'whats-new'
  | 'guides'
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
        className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-ink/85 dark:text-slate-400"
      >
        {title}
      </h2>
      <div className="rounded-2xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-800 divide-y divide-linen-200/70 dark:divide-night-800 overflow-hidden shadow-xs">
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
  teal: 'bg-forest-900/8 text-forest-700 dark:bg-[#5ED3DA]/12 dark:text-[#5ED3DA]',
  amber: 'bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300',
  indigo: 'bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/12 dark:text-indigo-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:bg-rose-400/12 dark:text-rose-300',
  slate: 'bg-linen-100 text-stone-ink dark:bg-night-800 dark:text-slate-300',
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
      className="w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-linen-50/90 dark:hover:bg-night-800/60 active:bg-linen-100/80 dark:active:bg-night-800 transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-forest-700 cursor-pointer"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <span
          aria-hidden="true"
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ICON_TONE_CLASSES[iconTone]}`}
        >
          <Icon name={icon} className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-forest-900 dark:text-white truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-xs text-stone-ink dark:text-slate-400 truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {value && (
          <span className="text-xs font-medium text-stone-ink dark:text-slate-400 max-w-[130px] sm:max-w-[180px] truncate">
            {value}
          </span>
        )}
        <Icon name="chevronRight" className="w-4 h-4 text-stone-ink/60 dark:text-slate-500" />
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
          className="min-h-[44px] -ml-2 pl-1.5 pr-3.5 py-1.5 rounded-xl inline-flex items-center gap-1 text-sm font-semibold text-forest-700 dark:text-[#5ED3DA] hover:bg-linen-100 dark:hover:bg-night-800 active:scale-[0.98] transition-all focus-visible:outline-2 focus-visible:outline-forest-700 cursor-pointer"
        >
          <Icon name="chevronLeft" className="w-5 h-5 shrink-0" />
          <span>{backLabel}</span>
        </button>

        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-stone-ink dark:text-slate-400 mt-1 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
