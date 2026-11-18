import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon.js';
import {
  computePresetStartSchedule,
  countMatchingCatalogBooksForPreset,
} from '../../features/rotations/rotation-presets.js';
import { renderPresetCornerDecoration } from '../../ui/preset-motifs.js';
import { resolvePresetArtworkInfo } from '../../ui/preset-artwork.js';
import type { Book, PresetCornerArtSize, RotationPreset } from '../../types/models.js';

interface PresetCardProps {
  preset: RotationPreset;
  books?: Book[];
  t: (key: string) => string;
  showCornerDecoration?: boolean;
  cornerArtSize?: PresetCornerArtSize;
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

const LEGACY_CORNER_ART_SIZE_CLASS: Record<PresetCornerArtSize, string> = {
  sm: 'w-20 h-20 sm:w-24 sm:h-24',
  md: 'w-28 h-28 sm:w-32 sm:h-32',
  lg: 'w-36 h-36 sm:w-44 sm:h-44',
};

const TRANSPARENT_CORNER_ART_SIZE_CLASS: Record<PresetCornerArtSize, string> = {
  sm: 'w-22 aspect-[4/3] sm:w-26',
  md: 'w-28 aspect-[4/3] sm:w-34',
  lg: 'w-36 aspect-[4/3] sm:w-42',
};

const HEADER_RIGHT_CLEARANCE_CLASS: Record<PresetCornerArtSize, string> = {
  sm: 'pr-20 sm:pr-24',
  md: 'pr-26 sm:pr-32',
  lg: 'pr-32 sm:pr-38',
};

export const PresetCard: React.FC<PresetCardProps> = ({
  preset,
  books = [],
  t,
  showCornerDecoration = true,
  cornerArtSize = 'md',
  onApply,
  onToggleActive,
  onEdit,
  onClone,
  onResetDefault,
  onDelete,
  isUpcomingAlert = false,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failedStage, setFailedStage] = useState<'none' | 'primary' | 'fallback'>('none');

  const schedule = computePresetStartSchedule(preset);
  const matchCounts = countMatchingCatalogBooksForPreset(books, preset);
  const categoryLabel = formatPresetCategoryLabel(preset.category, t);
  const isPaused = preset.isActive === false;

  const artworkInfo = resolvePresetArtworkInfo(preset);

  useEffect(() => {
    setFailedStage('none');
  }, [artworkInfo.primaryUrl, artworkInfo.fallbackUrl]);

  const hasDistinctFallback =
    Boolean(artworkInfo.fallbackUrl) && artworkInfo.fallbackUrl !== artworkInfo.primaryUrl;

  let activeArtworkUrl = '';
  let activeIsLegacyOpaque = artworkInfo.isLegacyOpaque;
  if (showCornerDecoration) {
    if (failedStage === 'none' && artworkInfo.primaryUrl) {
      activeArtworkUrl = artworkInfo.primaryUrl;
      activeIsLegacyOpaque = artworkInfo.isLegacyOpaque;
    } else if (failedStage === 'primary' && hasDistinctFallback) {
      activeArtworkUrl = artworkInfo.fallbackUrl;
      activeIsLegacyOpaque = true;
    }
  }

  const handleArtError = () => {
    if (failedStage === 'none' && hasDistinctFallback) {
      setFailedStage('primary');
    } else {
      setFailedStage('fallback');
    }
  };

  const motifFallbackHtml =
    showCornerDecoration && !activeArtworkUrl ? renderPresetCornerDecoration(preset) : '';

  const legacySizeClass =
    LEGACY_CORNER_ART_SIZE_CLASS[cornerArtSize] || LEGACY_CORNER_ART_SIZE_CLASS.md;
  const transparentSizeClass =
    TRANSPARENT_CORNER_ART_SIZE_CLASS[cornerArtSize] || TRANSPARENT_CORNER_ART_SIZE_CLASS.md;
  const headerClearanceClass =
    showCornerDecoration && activeArtworkUrl && !activeIsLegacyOpaque
      ? HEADER_RIGHT_CLEARANCE_CLASS[cornerArtSize] || HEADER_RIGHT_CLEARANCE_CLASS.md
      : '';

  return (
    <article
      data-preset-card={preset.id}
      className={`relative overflow-hidden rounded-xl bg-surface border p-5 sm:p-5.5 shadow-2xs flex flex-col justify-between transition-all hover:shadow-md ${
        isPaused ? 'opacity-80' : ''
      } ${
        isUpcomingAlert && !isPaused
          ? 'border-accent ring-1 ring-accent/35'
          : 'border-edge hover:border-primary/40'
      }`}
    >
      {/* Top-right illustration artwork: transparent PNGs render crisply in both light & dark themes;
          legacy opaque watercolor JPEGs use soft edge masking & blend mode for backwards compatibility. */}
      {showCornerDecoration && activeArtworkUrl && (
        activeIsLegacyOpaque ? (
          <div
            aria-hidden="true"
            className={`pointer-events-none select-none absolute top-0 right-0 ${legacySizeClass} overflow-hidden rounded-tr-xl`}
          >
            <img
              key={activeArtworkUrl}
              src={activeArtworkUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={handleArtError}
              style={{
                maskImage:
                  'radial-gradient(circle at 92% 8%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 42%, transparent 74%)',
                WebkitMaskImage:
                  'radial-gradient(circle at 92% 8%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 42%, transparent 74%)',
              }}
              className={`w-full h-full object-cover object-center mix-blend-multiply dark:mix-blend-screen ${
                cornerArtSize === 'lg' ? 'opacity-55 dark:opacity-15' : 'opacity-65 dark:opacity-18'
              }`}
            />
            <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-surface/35 to-surface/85" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className={`pointer-events-none select-none absolute top-2.5 right-2.5 ${transparentSizeClass} flex items-start justify-end`}
          >
            <img
              key={activeArtworkUrl}
              src={activeArtworkUrl}
              alt=""
              referrerPolicy="no-referrer"
              onError={handleArtError}
              style={
                cornerArtSize === 'sm'
                  ? undefined
                  : {
                      maskImage:
                        'linear-gradient(to top right, transparent 4%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,1) 66%)',
                      WebkitMaskImage:
                        'linear-gradient(to top right, transparent 4%, rgba(0,0,0,0.45) 30%, rgba(0,0,0,1) 66%)',
                    }
              }
              className="w-full h-full object-contain object-right-top opacity-92 dark:opacity-88 drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)] dark:drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
            />
          </div>
        )
      )}

      {motifFallbackHtml && (
        <div
          aria-hidden="true"
          className="pointer-events-none"
          dangerouslySetInnerHTML={{ __html: motifFallbackHtml }}
        />
      )}

      <div className="relative z-10 space-y-2.5">
        <div className={`flex items-start gap-2.5 ${headerClearanceClass}`}>
          {!showCornerDecoration && (
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-lg bg-surface-subtle border border-edge text-primary flex items-center justify-center shrink-0 mt-0.5"
            >
              <Icon name="presets" className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-primary">
                {categoryLabel}
                {preset.isCustom ? ' · Custom' : preset.isBuiltInOverride ? ' · Customized' : ''}
              </p>
              {isPaused && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                  · Paused
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-semibold text-ink leading-snug mt-1">
              {preset.title}
            </h3>
          </div>
        </div>

        <p
          className={`text-xs text-ink-secondary leading-relaxed line-clamp-2 ${
            showCornerDecoration && activeArtworkUrl && !activeIsLegacyOpaque
              ? cornerArtSize === 'lg'
                ? 'pr-28 sm:pr-32'
                : cornerArtSize === 'md'
                  ? 'pr-20 sm:pr-24'
                  : 'pr-14 sm:pr-16'
              : ''
          }`}
        >
          {preset.description}
        </p>

        {/* Zero-pill crisp dot-separated schedule, match & tag metadata */}
        <p className="text-[11px] font-mono-tabular text-ink-secondary">
          <span
            className={
              (isUpcomingAlert || schedule.isStartToday) && !isPaused
                ? 'font-semibold text-accent'
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

        <p className="text-[11px] text-primary font-medium">
          {matchCounts.thematicMatchCount > 0
            ? `${matchCounts.thematicMatchCount} thematic ${
                matchCounts.thematicMatchCount === 1 ? 'match' : 'matches'
              } in your library`
            : `No direct tag matches · draws from ${matchCounts.rotatableTotalCount} rotatable books`}
        </p>

        {preset.preferredTags && preset.preferredTags.length > 0 && (
          <p className="text-[11px] text-ink-muted truncate">
            {preset.preferredTags
              .slice(0, 5)
              .map((tag) => `#${tag}`)
              .join(' · ')}
          </p>
        )}
      </div>

      <div className="relative z-10 mt-4 pt-3 border-t border-edge-subtle space-y-2">
        {confirmDelete && onDelete ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-elevated border border-[#8C4A4F]/50 px-3 py-2">
            <span className="text-xs font-semibold text-ink">
              Delete preset?
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onDelete(preset);
                  setConfirmDelete(false);
                }}
                className="min-h-[32px] px-2.5 py-1 rounded bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[32px] px-2.5 py-1 rounded bg-surface border border-edge text-xs font-semibold text-ink cursor-pointer"
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
                      ? 'text-primary hover:bg-surface-elevated'
                      : 'text-ink-secondary hover:text-ink hover:bg-surface-elevated'
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
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
              {onClone && (
                <button
                  type="button"
                  onClick={() => onClone(preset)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-ink-secondary hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Clone
                </button>
              )}
              {preset.isBuiltInOverride && onResetDefault && (
                <button
                  type="button"
                  onClick={() => onResetDefault(preset)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-accent hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Reset
                </button>
              )}
              {preset.isCustom && onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-semibold text-[#8C4A4F] dark:text-[#C48A8E] hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  Delete
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onApply(preset)}
              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Icon name="sparkles" className="w-3.5 h-3.5" />
              <span>Generate</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
};
