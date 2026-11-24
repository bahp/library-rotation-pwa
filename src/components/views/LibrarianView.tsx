import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { normalizeCollectionStatus } from '../../types/models.js';

export const LibrarianView: React.FC = () => {
  const {
    state,
    activeProfile,
    activeRotation,
    navigate,
    setAiRecsModal,
    setAiCuratorModal,
  } = useApp();

  const ownedCount = useMemo(
    () =>
      state.books.filter((b) => normalizeCollectionStatus(b.collectionStatus) === 'owned')
        .length,
    [state.books]
  );

  const activeRotationCount = useMemo(() => {
    if (!activeProfile) return 0;
    return state.rotations.filter(
      (r) => r.profileId === activeProfile.id && r.status === 'active'
    ).length;
  }, [state.rotations, activeProfile]);

  const upcomingCapabilities = [
    {
      title: 'Conversational Read-Aloud Advice',
      description:
        'Ask for bedtime, calming, or curiosity-sparking titles matched to tonight’s mood and energy.',
    },
    {
      title: 'Shelf & Topic Gap Insights',
      description:
        'Spot underrepresented themes, age transitions, and reading stages across your owned books.',
    },
    {
      title: 'Guided Rotation Planning',
      description:
        'Describe a season, upcoming trip, or learning focus and assemble a balanced face-out shelf together.',
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-8">
      {/* Editorial Header */}
      <header className="space-y-2.5 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
          Reading Companion
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-ink tracking-tight text-balance">
          Family Librarian
        </h1>
        <p className="text-sm text-ink-secondary leading-relaxed max-w-2xl">
          Your conversational AI Librarian will live here—ready to answer questions about your home collection, recommend what to read tonight, and shape upcoming shelves for {activeProfile?.name || 'your family'}.
        </p>

        <div className="pt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted font-mono-tabular">
          <span>{ownedCount} {ownedCount === 1 ? 'owned book' : 'owned books'}</span>
          <span aria-hidden="true">·</span>
          <span>
            {activeRotationCount} active {activeRotationCount === 1 ? 'rotation' : 'rotations'}
          </span>
          {activeProfile && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-sans">Reader: {activeProfile.name}</span>
            </>
          )}
        </div>
      </header>

      {/* Calm Primary Showcase */}
      <section className="rounded-2xl bg-surface border border-edge p-6 sm:p-8 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="shrink-0 flex justify-center sm:justify-start">
            <BotanicalIllustration variant="feature-botanical" className="w-36 sm:w-40 h-auto" />
          </div>

          <div className="space-y-3 flex-1 min-w-0">
            <h2 className="font-display text-xl sm:text-2xl font-semibold text-ink text-balance">
              AI Librarian Chat Coming Soon
            </h2>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              While the full conversational workspace is being prepared, you can already use AI shelf curation and tailored reading picks from your current catalog.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setAiRecsModal({ isOpen: true })}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Icon name="sparkles" className="w-4 h-4 shrink-0" />
                <span>Open AI Picks</span>
              </button>
              <button
                type="button"
                onClick={() => setAiCuratorModal({ isOpen: true })}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs sm:text-sm font-semibold text-ink inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Icon name="wand" className="w-4 h-4 shrink-0 text-primary" />
                <span>Curate Rotation</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hairline Roadmap List */}
        <div className="pt-5 border-t border-edge-subtle space-y-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-secondary">
            Planned in This Space
          </h3>
          <div className="divide-y divide-edge-subtle">
            {upcomingCapabilities.map((item, idx) => (
              <div key={item.title} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <p className="text-sm font-semibold text-ink">
                  0{idx + 1}. {item.title}
                </p>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Secondary Quiet Navigation Links */}
      <section className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-edge-subtle/70 text-xs">
        <span className="text-ink-secondary">
          {activeRotation
            ? `Currently reading from "${activeRotation.title}"`
            : 'Ready to explore your shelves'}
        </span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('rotations')}
            className="font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>View Rotations</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate('library')}
            className="font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Browse Library</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
