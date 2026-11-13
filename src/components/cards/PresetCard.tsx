import React from 'react';
import { Icon } from '../common/Icon.js';
import type { RotationPreset } from '../../types/models.js';

interface PresetCardProps {
  preset: RotationPreset;
  onApply: (preset: RotationPreset) => void;
  isUpcomingAlert?: boolean;
}

export const PresetCard: React.FC<PresetCardProps> = ({
  preset,
  onApply,
  isUpcomingAlert = false,
}) => {
  return (
    <div
      className={`rounded-2xl bg-white dark:bg-night-900 border p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
        isUpcomingAlert
          ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-400/20'
          : 'border-linen-200 dark:border-night-700'
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-forest-700/10 dark:bg-[#5ED3DA]/15 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center font-bold text-sm">
              <Icon name="book" className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-forest-900 dark:text-white leading-tight">
                {preset.title}
              </h3>
              <span className="text-[11px] font-semibold text-stone-ink dark:text-slate-400 uppercase tracking-wider">
                {preset.category || 'Curated Collection'}
              </span>
            </div>
          </div>

          {isUpcomingAlert && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
              Season Alert
            </span>
          )}
        </div>

        <p className="text-xs text-stone-700 dark:text-slate-300 leading-relaxed mb-3 line-clamp-2">
          {preset.description}
        </p>

        {preset.preferredTags && preset.preferredTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {preset.preferredTags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-linen-100 dark:bg-night-800 text-stone-600 dark:text-slate-400"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-stone-ink dark:text-slate-400">
          {preset.count || 5} books recommended
        </span>

        <button
          type="button"
          onClick={() => onApply(preset)}
          className="px-3.5 py-1.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 dark:hover:bg-[#4bc2c9] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
        >
          <Icon name="sparkles" className="w-3.5 h-3.5" />
          <span>Apply Preset</span>
        </button>
      </div>
    </div>
  );
};
