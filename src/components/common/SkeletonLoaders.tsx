import React from 'react';

export const SearchResultsSkeleton: React.FC<{ rows?: number }> = ({ rows = 3 }) => (
  <div
    role="status"
    aria-label="Searching catalog..."
    className="divide-y divide-linen-200/70 dark:divide-night-800 pt-1"
  >
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 aspect-[3/4] rounded-xl animate-pulse bg-linen-200 dark:bg-night-800 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2 py-0.5">
            <div className="h-4 w-3/4 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
            <div className="h-3 w-1/2 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
            <div className="h-3 w-2/5 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
          </div>
        </div>
        <div className="h-10 w-20 rounded-xl animate-pulse bg-linen-200 dark:bg-night-800 shrink-0" />
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
        className="rounded-xl border border-linen-200/70 dark:border-night-800 p-1.5 space-y-1.5"
      >
        <div className="aspect-[3/4] rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
        <div className="h-2.5 w-2/3 rounded animate-pulse bg-linen-200 dark:bg-night-800" />
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
      <div className="p-3.5 rounded-xl border border-linen-200/70 dark:border-night-800 space-y-2">
        <div className="h-4 w-48 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
        <div className="h-3 w-full rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
        <div className="h-3 w-4/5 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800" />
      </div>
    )}
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="p-3 rounded-xl border border-linen-200/70 dark:border-night-800 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 aspect-[3/4] rounded-lg animate-pulse bg-linen-200 dark:bg-night-800 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-3.5 w-2/3 rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
              <div className="h-3 w-1/3 rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
              <div className="h-2.5 w-5/6 rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
            </div>
          </div>
          <div className="h-8 w-16 rounded-lg animate-pulse bg-linen-200 dark:bg-night-800 shrink-0" />
        </div>
      ))}
    </div>
  </div>
);

export const AiTagsSkeleton: React.FC = () => (
  <div role="status" aria-label="Analyzing book metadata..." className="space-y-4 py-2">
    <div className="p-3 rounded-xl border border-linen-200/70 dark:border-night-800 space-y-2">
      <div className="h-3.5 w-44 rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
      <div className="h-3 w-full rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
    </div>
    {[4, 5, 4].map((chips, groupIdx) => (
      <div key={groupIdx} className="space-y-2">
        <div className="h-3 w-40 rounded-md animate-pulse bg-linen-200 dark:bg-night-800" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: chips }).map((_, cIdx) => (
            <div
              key={cIdx}
              className="h-8 rounded-xl animate-pulse bg-linen-200 dark:bg-night-800"
              style={{ width: `${72 + ((groupIdx + cIdx) % 3) * 24}px` }}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);
