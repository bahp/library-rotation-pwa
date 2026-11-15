import React, { useState } from 'react';
import { Icon } from '../common/Icon.js';
import {
  computePresetStartSchedule,
  countMatchingCatalogBooksForPreset,
} from '../../features/rotations/rotation-presets.js';
import { renderPresetCornerDecoration } from '../../ui/preset-motifs.js';
import { resolvePresetArtworkUrl } from '../../ui/preset-artwork.js';
import type { Book, RotationPreset } from '../../types/models.js';

interface PresetCardProps {
  preset: RotationPreset;
  books?: Book[];
  t: (key: string) => string;
  showCornerDecoration?: boolean;
  onApply: (preset: RotationPreset) => void;
  onToggleActive?: (preset: RotationPreset) => void;
  onEdit?: (preset: RotationPreset) => void;
  onClone?: (preset: RotationPreset) => void;
  onResetDefault?: (preset: RotationPreset) => void;
  onDelete?: (preset: RotationPreset) => void;
  isUpcomingAlert?: boolean;
}

export function formatPresetCategoryLabel(
  category: string | undefined,
  t: (key: string) => string
): string {
  switch (category) {
    case 'seasonal-holidays':
      return t('presetCategories.seasonalHolidays');
    case 'cultural-traditions':
      return t('presetCategories.culturalTraditions');
    case 'calendar-events':
      return t('presetCategories.calendarEvents');
    case 'evergreen':
    default:
      return t('presetCategories.evergreen');
  }
}

export const PresetCard: React.FC<PresetCardProps> = ({
  preset,
  books = [],
  t,
  showCornerDecoration = true,
  onApply,
  onToggleActive,
  onEdit,
  onClone,
  onResetDefault,
  onDelete,
  isUpcomingAlert = false,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [artFailed, setArtFailed] = useState(false);

  const schedule = computePresetStartSchedule(preset);
  const matchCounts = countMatchingCatalogBooksForPreset(books, preset);
  const categoryLabel = formatPresetCategoryLabel(preset.category, t);
  const isPaused = preset.isActive === false;
  const artworkUrl = showCornerDecoration ? resolvePresetArtworkUrl(preset) : '';
  const motifFallbackHtml =
    showCornerDecoration && (artFailed || !artworkUrl)
      ? renderPresetCornerDecoration(preset)
      : '';

  return (
    <article
      data-preset-card={preset.id}
      className={`relative overflow-hidden rounded-2xl bg-ivory dark:bg-night-900 border p-5 sm:p-5.5 shadow-2xs flex flex-col justify-between transition-all hover:shadow-md ${
        isPaused ? 'opacity-80' : ''
      } ${
        isUpcomingAlert && !isPaused
          ? 'border-amber-400 dark:border-amber-500/70 ring-2 ring-amber-400/20'
          : 'border-linen-200/90 dark:border-night-800 hover:border-linen-300 dark:hover:border-night-700'
      }`}
    >
      {/* Top-right watercolor corner artwork blended smoothly into card surface */}
      {showCornerDecoration && artworkUrl && !artFailed && (
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute top-0 right-0 w-28 h-28 sm:w-32 sm:h-32 overflow-hidden rounded-tr-2xl"
        >
          <img
            key={artworkUrl}
            src={artworkUrl}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setArtFailed(true)}
            style={{
              maskImage:
                'radial-gradient(circle at 92% 8%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.58) 44%, transparent 76%)',
              WebkitMaskImage:
                'radial-gradient(circle at 92% 8%, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.58) 44%, transparent 76%)',
            }}
            className="w-full h-full object-cover object-center opacity-90 mix-blend-multiply dark:mix-blend-lighten dark:opacity-28"
          />
        </div>
      )}

      {motifFallbackHtml && (
        <div
          aria-hidden="true"
          className="pointer-events-none"
          dangerouslySetInnerHTML={{ __html: motifFallbackHtml }}
        />
      )}

      <div className="relative z-10 space-y-2.5">
        <div
          className={`flex items-start gap-2.5 ${
            showCornerDecoration ? 'pr-16 sm:pr-20' : ''
          }`}
        >
          {!showCornerDecoration && (
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-xl bg-linen-100 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-forest-700 dark:text-[#5ED3DA] flex items-center justify-center shrink-0 mt-0.5"
            >
              <Icon name="presets" className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-forest-700 dark:text-[#5ED3DA]">
                {categoryLabel}
                {preset.isCustom ? ' · Custom' : preset.isBuiltInOverride ? ' · Customized' : ''}
              </p>
              {isPaused && (
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-stone-ink dark:text-slate-400">
                  · Paused
                </span>
              )}
            </div>
            <h3 className="font-display text-base sm:text-[17px] font-bold text-forest-900 dark:text-white leading-snug mt-1">
              {preset.title}
            </h3>
          </div>
        </div>

        <p className="text-xs text-stone-ink dark:text-slate-300 leading-relaxed line-clamp-2 pr-6">
          {preset.description}
        </p>

        {/* Zero-pill crisp dot-separated schedule, match & tag metadata */}
        <p className="text-[11px] font-mono-tabular text-stone-ink/90 dark:text-slate-300">
          <span
            className={
              (isUpcomingAlert || schedule.isStartToday) && !isPaused
                ? 'font-semibold text-amber-800 dark:text-amber-300'
                : ''
            }
          >
            {schedule.countdownLabel}
          </span>
          {' · '}
          <span>{preset.count || 5} books</span>
          {' · '}
          <span>{preset.swapDays || 14}d cycle</span>
        </p>

        <p className="text-[11px] text-forest-700 dark:text-[#5ED3DA] font-medium">
          {matchCounts.thematicMatchCount > 0
            ? `${matchCounts.thematicMatchCount} thematic ${
                matchCounts.thematicMatchCount === 1 ? 'match' : 'matches'
              } in library (${matchCounts.rotatableTotalCount} eligible)`
            : `${matchCounts.rotatableTotalCount} eligible books in library`}
        </p>

        {preset.preferredTags && preset.preferredTags.length > 0 && (
          <p className="text-[11px] text-stone-ink/80 dark:text-slate-400 truncate">
            {preset.preferredTags
              .slice(0, 5)
              .map((tag) => `#${tag}`)
              .join(' · ')}
          </p>
        )}
      </div>

      <div className="relative z-10 mt-4 pt-3 border-t border-linen-200/80 dark:border-night-800 space-y-2">
        {confirmDelete && onDelete ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 px-3 py-2">
            <span className="text-xs font-semibold text-rose-900 dark:text-rose-200">
              Delete preset?
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onDelete(preset);
                  setConfirmDelete(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-ivory dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-0.5">
              {onToggleActive && (
                <button
                  type="button"
                  onClick={() => onToggleActive(preset)}
                  aria-pressed={!isPaused}
                  title={
                    isPaused
                      ? 'Resume seasonal alerts for this preset'
                      : 'Pause seasonal alerts for this preset'
                  }
                  className={`min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                    isPaused
                      ? 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                      : 'text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800'
                  }`}
                >
                  <Icon name={isPaused ? 'play' : 'pause'} className="w-3 h-3" />
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(preset)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
              {onClone && (
                <button
                  type="button"
                  onClick={() => onClone(preset)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-ink hover:text-forest-900 hover:bg-linen-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-night-800 transition-colors cursor-pointer"
                >
                  Clone
                </button>
              )}
              {preset.isBuiltInOverride && onResetDefault && (
                <button
                  type="button"
                  onClick={() => onResetDefault(preset)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
              {preset.isCustom && onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  Delete
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onApply(preset)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-forest-700 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 dark:hover:bg-[#4bc2c9] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              <span>Generate Shelf</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
};
