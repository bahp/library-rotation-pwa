import React from 'react';
import bunkoIconPng from '../../assets/images/bunko_icon_clean.png';
import mimirIconPng from '../../assets/images/mimir_icon_clean.png';
import shioriIconPng from '../../assets/images/shiori_icon_clean.png';

export interface BrandEmblemProps {
  presetId?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Resolves the active wordmark display string matching each literary theme identity.
 */
export function resolveBrandWordmark(presetId?: string): string {
  const id = String(presetId || '').trim().toLowerCase();
  if (id === 'mimir') return 'MIMIR';
  if (id === 'shiori') return 'shiori';
  return 'bunko';
}

/**
 * Resolves the bundled square app icon asset for the given theme preset.
 */
export function resolveBrandIconSrc(presetId?: string): string {
  const id = String(presetId || '').trim().toLowerCase();
  if (id === 'mimir') return mimirIconPng;
  if (id === 'shiori') return shioriIconPng;
  return bunkoIconPng;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-9 h-9 rounded-xl',
  lg: 'w-11 h-11 rounded-2xl',
};

export const BrandEmblem: React.FC<BrandEmblemProps> = ({
  presetId,
  size = 'md',
  className = '',
}) => {
  const src = resolveBrandIconSrc(presetId);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden bg-surface-subtle ring-1 ring-black/10 dark:ring-white/15 shadow-2xs ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover select-none"
        draggable={false}
      />
    </span>
  );
};
