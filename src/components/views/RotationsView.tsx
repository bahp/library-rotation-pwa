import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { RotationShelfCard } from '../cards/RotationShelfCard.js';
import { RotationEditorModal } from '../modals/RotationEditorModal.js';
import {
  CreateRotationWizardModal,
  QUICK_RULE_OPTIONS,
  type QuickRuleId,
} from '../modals/CreateRotationWizardModal.js';
import { PresetsView } from './PresetsView.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { computeRotationSchedule } from '../../features/rotations/rotation-schedule.js';
import {
  computePresetStartSchedule,
  findMatchingStartDatePresets,
  getAllRotationPresets,
} from '../../features/rotations/rotation-presets.js';
import { isBookRotatable } from '../../types/models.js';
import type { Book, RotationShelf } from '../../types/models.js';

export const RotationsView: React.FC = () => {
  const {
    state,
    store,
    activeProfile,
    currentRoute,
    navigate,
    routeParams,
    rotationEditor,
    setRotationEditor,
  } = useApp();

  const isPresetsTab = currentRoute === 'presets';

  const editParamId = routeParams.get('edit');
  const [editingShelfId, setEditingShelfId] = useState<string | null>(() => editParamId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    editParamId ? new Set([editParamId]) : new Set()
  );
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardInitialQuickRule, setWizardInitialQuickRule] = useState<QuickRuleId | null>(null);
  const [wizardInitialPresetId, setWizardInitialPresetId] = useState<string | null>(null);

  useEffect(() => {
    setEditingShelfId(editParamId || null);
    if (editParamId) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.add(editParamId);
        return next;
      });
    }
  }, [editParamId]);

  const activeRotations = state.rotations.filter(
    (r) => r.profileId === activeProfile?.id && r.status === 'active'
  );
  const savedRotations = state.rotations.filter(
    (r) => r.profileId === activeProfile?.id && r.status !== 'active'
  );

  const bookMap = useMemo(
    () => new Map(state.books.map((b: Book) => [b.id, b])),
    [state.books]
  );

  const coverAspect = state.settings?.coverAspectRatio || 'square';

  const toggleExpanded = (rotId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rotId)) next.delete(rotId);
      else next.add(rotId);
      return next;
    });
  };

  const handleSwapBook = async (rotId: string, bookId: string) => {
    await store.replaceRotationBookRandom(rotId, bookId);
  };

  const handleReplaceBook = (rotId: string, bookId: string) => {
    setRotationEditor({
      modalMode: 'replace',
      rotationId: rotId,
      targetBookId: bookId,
    });
  };

  const handleOpenAddModal = (rotId: string) => {
    setRotationEditor({
      modalMode: 'add',
      rotationId: rotId,
      targetBookId: null,
    });
  };

  const handleAddRandom = async (rotId: string, count: number) => {
    await store.addBooksToRotationRandom(rotId, count);
  };

  const handleToggleRead = async (rotId: string, bookId: string) => {
    await store.toggleRotationBookRead(rotId, bookId);
  };

  const handleToggleRotationActive = async (rotId: string) => {
    await store.toggleRotationActive(rotId);
  };

  const handleDeleteRotation = async (rotId: string) => {
    await store.deleteRotation(rotId);
  };

  const handleRunQuickRule = (ruleId: QuickRuleId) => {
    if (!activeProfile) {
      store.notify('Select or create a reader profile first.', 'error');
      return;
    }
    const rotatable = state.books.filter((b) => isBookRotatable(b));
    if (rotatable.length === 0) {
      store.notify('Add owned books to your library before creating a rotation.', 'error');
      return;
    }

    if (ruleId === 'seasonal-match') {
      const allPresets = getAllRotationPresets(state).filter((p) => p.isActive !== false);
      const matching = findMatchingStartDatePresets(allPresets, new Date(), {
        activeRotation: activeRotations[0] || null,
        profileRotations: [...activeRotations, ...savedRotations],
        daysBefore: 35,
        daysAfter: 14,
      });
      let chosenPreset = matching[0]?.preset || null;
      if (!chosenPreset) {
        const dated = allPresets
          .map((p) => ({ preset: p, sched: computePresetStartSchedule(p) }))
          .filter((x) => x.sched.daysUntilStart !== null)
          .sort(
            (a, b) =>
              (a.sched.daysUntilStart ?? 999) - (b.sched.daysUntilStart ?? 999)
          );
        chosenPreset = dated[0]?.preset || allPresets[0] || null;
      }
      if (!chosenPreset) {
        store.notify('No presets available to match this season.', 'error');
        return;
      }
      setWizardInitialQuickRule(null);
      setWizardInitialPresetId(chosenPreset.id);
      setIsWizardOpen(true);
      return;
    }

    setWizardInitialPresetId(null);
    setWizardInitialQuickRule(ruleId);
    setIsWizardOpen(true);
  };

  const renderCompactShelfRow = (rot: RotationShelf, isActive: boolean) => {
    const shelfBooks = rot.bookIds
      .map((id) => bookMap.get(id))
      .filter((b): b is Book => Boolean(b));
    const leadBook = shelfBooks[0] || null;
    const totalCount = shelfBooks.length;
    const readCount = shelfBooks.filter((b) =>
      rot.completedBookIds?.includes(b.id)
    ).length;
    const progressPct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;
    const schedule = computeRotationSchedule(rot, activeProfile || state.profiles[0]);
    const isExpanded = expandedIds.has(rot.id) || editingShelfId === rot.id;

    if (isExpanded) {
      return (
        <div key={rot.id} className="space-y-1.5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setExpandedIds((prev) => {
                  const next = new Set(prev);
                  next.delete(rot.id);
                  return next;
                });
                if (editingShelfId === rot.id) {
                  setEditingShelfId(null);
                }
              }}
              className="text-[11px] font-semibold text-ink-secondary hover:text-ink inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              <Icon name="chevronDown" className="w-3.5 h-3.5 rotate-180" />
              <span>Compact card</span>
            </button>
          </div>
          <RotationShelfCard
            rotation={rot}
            books={state.books}
            isActive={isActive}
            isEditorOpen={editingShelfId === rot.id}
            onOpenEditor={() => setEditingShelfId(rot.id)}
            onCloseEditor={() => {
              setEditingShelfId(null);
              if (routeParams.get('edit')) {
                navigate('rotations');
              }
            }}
            onActivate={() => handleToggleRotationActive(rot.id)}
            onDelete={() => handleDeleteRotation(rot.id)}
            onSwapBook={(bookId) => handleSwapBook(rot.id, bookId)}
            onReplaceBook={(bookId) => handleReplaceBook(rot.id, bookId)}
            onAddRandom={(count) => handleAddRandom(rot.id, count)}
            onOpenAddModal={() => handleOpenAddModal(rot.id)}
            onToggleRead={(bookId) => handleToggleRead(rot.id, bookId)}
          />
        </div>
      );
    }

    return (
      <div
        key={rot.id}
        data-rotation-summary={rot.id}
        className={`rounded-2xl bg-surface border transition-all lr-card ${
          isActive
            ? 'border-primary/40 hover:border-primary/70'
            : 'border-edge hover:border-secondary'
        }`}
      >
        <div className="flex items-center gap-3 p-3 sm:p-3.5">
          <button
            type="button"
            onClick={() => toggleExpanded(rot.id)}
            aria-expanded="false"
            aria-label={`Open ${rot.title} shelf`}
            className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
          >
            {leadBook ? (
              <div className="shrink-0 rounded-lg overflow-hidden bg-surface-subtle">
                <BookCover
                  book={leadBook}
                  size="xs"
                  aspectRatio={coverAspect}
                  showBadges={false}
                />
              </div>
            ) : (
              <div className="w-11 h-14 rounded-lg bg-surface-subtle border border-edge flex items-center justify-center text-ink-muted shrink-0">
                <Icon name="book" className="w-5 h-5" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="font-sans text-sm sm:text-base font-semibold text-ink truncate leading-tight">
                  {rot.title}{' '}
                  <span className="font-normal text-ink-secondary font-mono-tabular text-xs">
                    ({totalCount} {totalCount === 1 ? 'book' : 'books'})
                  </span>
                </p>
                <Icon
                  name="chevronRight"
                  className="w-4 h-4 text-ink-muted shrink-0"
                />
              </div>

              <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary dark:bg-accent transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-ink-secondary leading-none">
                <span>
                  Progress ({readCount} / {totalCount})
                </span>
                <span
                  className={
                    isActive && schedule.isDue
                      ? 'text-accent font-semibold'
                      : isActive && schedule.isDueSoon
                        ? 'text-primary font-semibold'
                        : ''
                  }
                >
                  {isActive ? schedule.countdownLabel : `${schedule.cycleDays}d cycle`}
                </span>
              </div>
            </div>
          </button>

          {!isActive && (
            <button
              type="button"
              onClick={() => handleToggleRotationActive(rot.id)}
              className="min-h-[36px] px-3 py-1 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold shrink-0 transition-colors cursor-pointer"
            >
              Activate
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isPresetsTab) {
    return (
      <div className="text-left max-w-6xl mx-auto">
        <PresetsView embedded onBack={() => navigate('rotations')} />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left max-w-6xl mx-auto pb-16 sm:pb-8">

      {/* 1. Active Rotations */}
      <section aria-labelledby="active-rotations-heading" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="active-rotations-heading"
            className="font-display text-xl font-semibold text-ink"
          >
            Active Rotations
          </h2>
          {activeRotations.length > 0 && (
            <span className="text-xs font-mono-tabular text-ink-secondary">
              {activeRotations.length} active
            </span>
          )}
        </div>

        {activeRotations.length > 0 ? (
          <div className="space-y-2.5">
            {activeRotations.map((rot) => renderCompactShelfRow(rot, true))}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-edge p-5 text-center space-y-2.5 lr-card">
            {savedRotations.length === 0 && (
              <BotanicalIllustration variant="empty-shelf" className="w-32 h-auto mx-auto" />
            )}
            <p className="font-display text-base font-semibold text-ink">
              No active rotation yet
            </p>
            <p className="text-xs text-ink-secondary max-w-sm mx-auto">
              Pick a quick rule below or tap the + button to build a custom shelf.
            </p>
          </div>
        )}
      </section>

      {/* 2. Quick Presets & Rules */}
      <section aria-labelledby="quick-rules-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="quick-rules-heading"
            className="font-display text-xl font-semibold text-ink"
          >
            Quick Presets &amp; Rules
          </h2>
          <button
            type="button"
            onClick={() => navigate('presets')}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-0.5 py-1 cursor-pointer"
          >
            <span>All presets</span>
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {QUICK_RULE_OPTIONS.map((rule) => (
            <button
              key={rule.id}
              type="button"
              data-quick-rule={rule.id}
              onClick={() => handleRunQuickRule(rule.id)}
              className="min-h-[78px] sm:min-h-[96px] rounded-xl sm:rounded-2xl bg-surface hover:bg-surface-elevated border border-edge hover:border-primary/45 p-2 sm:p-3 flex flex-col items-center justify-center text-center gap-1.5 sm:gap-2 shadow-2xs transition-all active:scale-[0.98] cursor-pointer lr-card"
            >
              <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-surface-subtle border border-edge-subtle text-primary flex items-center justify-center shrink-0">
                <Icon
                  name={rule.icon}
                  className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5"
                />
              </span>
              <div className="space-y-0.5 min-w-0 w-full">
                <p className="font-sans text-[11px] sm:text-[13px] font-semibold text-ink leading-tight line-clamp-2 sm:line-clamp-1">
                  {rule.label}
                </p>
                <p className="hidden sm:block text-[10px] text-ink-secondary leading-tight line-clamp-1">
                  {rule.subtitle}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Saved / Other Rotations */}
      {savedRotations.length > 0 && (
        <section aria-labelledby="saved-rotations-heading" className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="saved-rotations-heading"
              className="font-display text-xl font-semibold text-ink"
            >
              Saved Rotations
            </h2>
            <span className="text-xs font-mono-tabular text-ink-secondary">
              {savedRotations.length} saved
            </span>
          </div>

          <div className="space-y-2.5">
            {savedRotations.map((rot) => renderCompactShelfRow(rot, false))}
          </div>
        </section>
      )}

      {/* Floating Bottom-Right + New Rotation Button */}
      <button
        type="button"
        data-action="open-new-rotation-wizard"
        onClick={() => {
          setWizardInitialQuickRule(null);
          setWizardInitialPresetId(null);
          setIsWizardOpen(true);
        }}
        aria-label="Create new rotation"
        title="Create new rotation"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 right-4 md:right-6 z-30 w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-primary hover:bg-primary-hover text-primary-fg shadow-xl active:scale-95 flex items-center justify-center border border-primary-fg/20 transition-transform cursor-pointer"
      >
        <Icon name="plus" className="w-6 h-6" strokeWidth={2.2} />
      </button>

      {/* Slide-Up Fixed-Size Create Rotation Wizard */}
      <CreateRotationWizardModal
        isOpen={isWizardOpen}
        initialQuickRule={wizardInitialQuickRule}
        initialPresetId={wizardInitialPresetId}
        onClose={() => {
          setIsWizardOpen(false);
          setWizardInitialQuickRule(null);
          setWizardInitialPresetId(null);
        }}
      />

      {/* Modal for replacing or adding books inside expanded shelves */}
      <RotationEditorModal
        modalMode={rotationEditor.modalMode}
        rotationId={rotationEditor.rotationId}
        targetBookId={rotationEditor.targetBookId}
        onClose={() =>
          setRotationEditor({ modalMode: null, rotationId: null, targetBookId: null })
        }
      />
    </div>
  );
};
