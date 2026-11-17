import React from 'react';

export const SearchResultsSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div
    role="status"
    aria-label="Searching catalog..."
    className="divide-y divide-edge-subtle pt-1"
  >
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 aspect-[3/4] rounded-lg animate-pulse bg-surface-elevated shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 py-0.5">
            <div className="h-4 w-3/4 rounded bg-surface-elevated animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-surface-elevated animate-pulse" />
            <div className="h-3 w-2/5 rounded bg-surface-elevated animate-pulse" />
          </div>
        </div>
        <div className="h-10 w-20 rounded-lg animate-pulse bg-surface-elevated shrink-0" />
      </div>
    ))}
  </div>
);

export const CoverGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div
    role="status"
    aria-label="Loading covers..."
    className="grid grid-cols-2 sm:grid-cols-4 gap-3"
  >
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="rounded-lg border border-edge-subtle p-1.5 space-y-1.5 bg-surface"
      >
        <div className="aspect-[3/4] rounded animate-pulse bg-surface-elevated" />
        <div className="h-2.5 w-2/3 rounded animate-pulse bg-surface-elevated" />
      </div>
    ))}
  </div>
);

export const AiListSkeleton: React.FC<{ rows?: number; showHeaderBanner?: boolean }> = ({
  rows = 4,
  showHeaderBanner = true,
}) => (
  <div role="status" aria-label="Generating AI results..." className="space-y-3 py-2">
    {showHeaderBanner && (
      <div className="p-3.5 rounded-lg border border-edge-subtle space-y-2">
        <div className="h-4 w-48 rounded animate-pulse bg-surface-elevated" />
        <div className="h-3 w-full rounded animate-pulse bg-surface-elevated" />
        <div className="h-3 w-4/5 rounded animate-pulse bg-surface-elevated" />
      </div>
    )}
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="p-3 rounded-lg border border-edge-subtle flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 aspect-[3/4] rounded animate-pulse bg-surface-elevated shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-3.5 w-2/3 rounded animate-pulse bg-surface-elevated" />
              <div className="h-3 w-1/3 rounded animate-pulse bg-surface-elevated" />
              <div className="h-2.5 w-5/6 rounded animate-pulse bg-surface-elevated" />
            </div>
          </div>
          <div className="h-8 w-16 rounded-lg animate-pulse bg-surface-elevated shrink-0" />
        </div>
      ))}
    </div>
  </div>
);

export const AiTagsSkeleton: React.FC = () => (
  <div role="status" aria-label="Analyzing book metadata..." className="space-y-4 py-2">
    <div className="p-3 rounded-lg border border-edge-subtle space-y-2">
      <div className="h-3.5 w-44 rounded animate-pulse bg-surface-elevated" />
      <div className="h-3 w-full rounded animate-pulse bg-surface-elevated" />
    </div>
    {[4, 5, 4].map((chips, groupIdx) => (
      <div key={groupIdx} className="space-y-2">
        <div className="h-3 w-40 rounded animate-pulse bg-surface-elevated" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: chips }).map((_, cIdx) => (
            <div
              key={cIdx}
              className="h-8 rounded-lg animate-pulse bg-surface-elevated"
              style={{ width: `${72 + ((groupIdx + cIdx) % 3) * 24}px` }}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);
