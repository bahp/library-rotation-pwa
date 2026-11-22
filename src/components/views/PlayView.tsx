import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { PlayAppCard } from '../cards/PlayAppCard.js';
import { BookCard } from '../cards/BookCard.js';
import { BookCover } from '../common/BookCover.js';
import { BotanicalIllustration } from '../common/BotanicalIllustration.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { PLAY_APPS_CONFIG } from '../../config/play-apps.js';
import { pickStorytimeBooks, createBookHuntChallenge } from '../../features/play/play-activities.js';
import { ReadingPassportStudio } from '../play/ReadingPassportStudio.js';
import type { Book } from '../../types/models.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';

export const PlayView: React.FC = () => {
  const { state, activeProfile, activeRotation, setInspectedBookId } = useApp();

  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  // Storytime Picker state
  const [storyCount, setStoryCount] = useState(3);
  const [storyScope, setStoryScope] = useState<'active-shelf' | 'owned-library'>('active-shelf');
  const [storyTopic, setStoryTopic] = useState('');
  const [storyUnreadFirst, setStoryUnreadFirst] = useState(true);
  const [pickedBooks, setPickedBooks] = useState<Book[]>([]);
  const [pickedReasons, setPickedReasons] = useState<Record<string, string[]>>({});
  const [pickerHasRun, setPickerHasRun] = useState(false);

  // Book Hunt state
  const [huntScope, setHuntScope] = useState<'active-shelf' | 'owned-library'>('active-shelf');
  const [huntBook, setHuntBook] = useState<Book | null>(null);
  const [huntPrompt, setHuntPrompt] = useState('');
  const [huntClue, setHuntClue] = useState('');
  const [huntPeekRevealed, setHuntPeekRevealed] = useState(false);
  const [huntStreak, setHuntStreak] = useState(0);
  const [huntCelebrated, setHuntCelebrated] = useState(false);

  // Logo load error states for sheet headers
  const [storyLogoError, setStoryLogoError] = useState(false);
  const [huntLogoError, setHuntLogoError] = useState(false);
  const [passportLogoError, setPassportLogoError] = useState(false);

  const activeApp = PLAY_APPS_CONFIG.find((a) => a.id === activeAppId) || null;
  useBodyScrollLock(Boolean(activeAppId && activeApp));

  const activeShelfBookCount = activeRotation?.bookIds?.length || 0;
  const ownedBookCount = state.books.filter((b) => b.collectionStatus !== 'wishlist').length;

  const handleOpenApp = (id: string) => {
    setActiveAppId(id);
    if (id === 'book-hunt' && !huntBook) {
      startNextHunt();
    }
  };

  const handleRunStorytimePicker = () => {
    const outcome = pickStorytimeBooks({
      books: state.books,
      activeRotation,
      activeProfile,
      count: storyCount,
      scope: storyScope,
      topicQuery: storyTopic,
      unreadFirst: storyUnreadFirst,
      rotations: state.rotations,
    });

    setPickedBooks(outcome.selectedBooks);
    setPickedReasons(outcome.matchedReasonsByBookId || {});
    setPickerHasRun(true);
  };

  const startNextHunt = (scopeOverride?: 'active-shelf' | 'owned-library') => {
    const effectiveScope = scopeOverride ?? huntScope;
    const challenge = createBookHuntChallenge({
      books: state.books,
      activeRotation,
      activeProfile,
      scope: effectiveScope,
      previousBookId: huntBook?.id || null,
    });

    if (challenge) {
      setHuntBook(challenge.book);
      setHuntPrompt(challenge.prompt);
      setHuntClue(challenge.clueLine);
      setHuntPeekRevealed(false);
      setHuntCelebrated(false);
    } else {
      setHuntBook(null);
      setHuntPrompt('Add more books to your shelf or library to play Book Hunt!');
      setHuntClue('');
    }
  };

  const handleFoundBook = () => {
    setHuntCelebrated(true);
    setHuntStreak((prev) => prev + 1);
  };

  const quickTopics = ['bedtime', 'trucks', 'animals', 'winter', 'space', 'dinosaurs', 'funny'];

  return (
    <div className="space-y-6 text-left max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold text-accent uppercase tracking-[0.12em]">
            Play &amp; Storytime
          </p>
          <h1 className="font-display text-3xl sm:text-[34px] font-semibold tracking-tight text-ink leading-tight mt-0.5">
            Interactive Hub
          </h1>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Quick bedtime draws, shelf treasure hunts, and printable reading passports for{' '}
            <span className="font-semibold text-ink">
              {activeProfile?.name || 'the family'}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-secondary px-3.5 py-2 rounded-lg bg-surface border border-edge shadow-2xs">
          <span>
            <strong className="font-mono-tabular text-ink">
              {activeShelfBookCount}
            </strong>{' '}
            on active shelf
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="font-mono-tabular text-ink">
              {ownedBookCount}
            </strong>{' '}
            in family library
          </span>
        </div>
      </div>

      {/* Showcase Launcher Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {PLAY_APPS_CONFIG.map((app) => (
          <PlayAppCard key={app.id} app={app} onOpen={handleOpenApp} />
        ))}
      </div>

      {/* Slide-Up Bottom Sheet Modal for Active Activity */}
      {activeAppId && activeApp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="play-activity-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          {/* Backdrop */}
          <div
            onClick={() => setActiveAppId(null)}
            className="fixed inset-0 bg-scrim backdrop-blur-sm transition-opacity animate-fade-in"
          />

          {/* Bottom Sheet Container */}
          <div
            className={`relative w-full max-h-[92vh] sm:max-h-[90vh] ${
              activeAppId === 'reading-passport'
                ? 'sm:max-w-5xl'
                : 'sm:max-w-2xl lg:max-w-3xl'
            } flex flex-col rounded-t-2xl sm:rounded-xl bg-surface border border-edge shadow-2xl animate-sheet-up overflow-hidden z-10 pb-safe sm:pb-0`}
          >
            {/* Handle Pill for Mobile Swipe Gesture */}
            <div className="w-10 h-1 rounded-full bg-edge mx-auto mt-3 mb-1 sm:hidden shrink-0" />

            {/* Header bar inside sheet */}
            <div className="px-5 py-3.5 border-b border-edge-subtle flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-edge bg-surface-subtle text-primary flex items-center justify-center shadow-2xs">
                  <Icon name={activeApp.logoIcon || 'play'} className="w-5 h-5" />
                  {activeApp.logoUrl &&
                    ((activeAppId === 'storytime-picker' && !storyLogoError) ||
                      (activeAppId === 'book-hunt' && !huntLogoError) ||
                      (activeAppId === 'reading-passport' && !passportLogoError)) && (
                      <img
                        src={activeApp.logoUrl}
                        alt={`${activeApp.title} logo`}
                        onError={() => {
                          if (activeAppId === 'storytime-picker') setStoryLogoError(true);
                          if (activeAppId === 'book-hunt') setHuntLogoError(true);
                          if (activeAppId === 'reading-passport') setPassportLogoError(true);
                        }}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                </span>
                <div className="min-w-0">
                  <h2
                    id="play-activity-title"
                    className="font-display text-lg sm:text-xl font-semibold text-ink truncate"
                  >
                    {activeApp.title}
                  </h2>
                  <p className="text-xs text-ink-secondary truncate">
                    {activeApp.shortTagline}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                aria-label="Close activity sheet"
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-ink-secondary flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              >
                <Icon name="close" className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>

            {/* Scrollable Sheet Content */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Activity 1: Storytime & Topic Picker */}
              {activeAppId === 'storytime-picker' && (
                <div className="space-y-5">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Number of Books Stepper with - and + buttons */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-ink">
                          Number of Books
                        </label>
                        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge w-fit">
                          <button
                            type="button"
                            onClick={() => setStoryCount((c) => Math.max(1, c - 1))}
                            disabled={storyCount <= 1}
                            aria-label="Decrease book count"
                            className="h-9 w-9 rounded-md bg-surface border border-edge-subtle disabled:opacity-40 font-semibold text-base flex items-center justify-center transition-colors shadow-2xs hover:bg-surface-elevated text-ink cursor-pointer"
                          >
                            −
                          </button>
                          <span className="min-w-[72px] px-2 text-center text-xs sm:text-sm font-semibold font-mono-tabular text-ink">
                            {storyCount} {storyCount === 1 ? 'Book' : 'Books'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setStoryCount((c) => c + 1)}
                            aria-label="Increase book count"
                            className="h-9 w-9 rounded-md bg-surface border border-edge-subtle font-semibold text-base flex items-center justify-center transition-colors shadow-2xs hover:bg-surface-elevated text-ink cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Source Book Pool Selector */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-ink">
                          Book Source Pool
                        </label>
                        <select
                          value={storyScope}
                          onChange={(e) => setStoryScope(e.target.value as 'active-shelf' | 'owned-library')}
                          className="w-full h-11 px-3.5 rounded-lg bg-surface-subtle border border-edge text-xs font-semibold text-ink"
                        >
                          <option value="active-shelf">Active Shelf Rotation</option>
                          <option value="owned-library">Entire Family Library</option>
                        </select>
                      </div>
                    </div>

                    {/* Topic / Mood Search */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-ink">
                        Filter by Mood or Theme (Optional)
                      </label>
                      <ClearableInput
                        id="play-topic-input"
                        value={storyTopic}
                        onValueChange={setStoryTopic}
                        placeholder="e.g. bedtime, trucks, animals, space..."
                        className="px-3.5 py-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink"
                      />
                    </div>

                    {/* Quick Topic Shortcut Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStoryTopic('')}
                        aria-pressed={!storyTopic.trim()}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          !storyTopic.trim()
                            ? 'bg-primary text-primary-fg shadow-2xs'
                            : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink'
                        }`}
                      >
                        Any topic
                      </button>
                      {quickTopics.map((topic) => {
                        const isSelected = storyTopic.toLowerCase().trim() === topic;
                        return (
                          <button
                            key={topic}
                            type="button"
                            onClick={() => setStoryTopic(topic)}
                            aria-pressed={isSelected}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-primary text-primary-fg shadow-2xs'
                                : 'bg-surface-subtle border border-edge text-ink-secondary hover:text-ink'
                            }`}
                          >
                            {topic}
                          </button>
                        );
                      })}
                    </div>

                    {/* Unread Priority Checkbox & Primary Draw Button */}
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-edge-subtle">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={storyUnreadFirst}
                          onChange={(e) => setStoryUnreadFirst(e.target.checked)}
                          className="w-4 h-4 rounded accent-[var(--primary)]"
                        />
                        <span className="font-semibold text-ink-secondary">
                          Prefer unread books first
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={handleRunStorytimePicker}
                        className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <Icon name="dice" className="w-4 h-4" />
                        <span>Draw Storytime Books!</span>
                      </button>
                    </div>
                  </div>

                  {/* Draw Results */}
                  {pickerHasRun && (
                    <div className="pt-4 border-t border-edge-subtle space-y-3">
                      <h3 className="font-display font-semibold text-lg text-ink">
                        Tonight’s Selection ({pickedBooks.length}):
                      </h3>

                      {pickedBooks.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                          {pickedBooks.map((book) => (
                            <div key={book.id} className="space-y-1">
                              <BookCard
                                book={book}
                                variant="grid"
                                onInspect={() => setInspectedBookId(book.id)}
                              />
                              {pickedReasons[book.id] && (
                                <p className="text-[10px] text-primary font-medium leading-tight">
                                  Matched: {pickedReasons[book.id].join(', ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 rounded-xl bg-surface-subtle border border-edge text-center space-y-2">
                          <BotanicalIllustration variant="empty-shelf" className="w-32 h-auto mx-auto" />
                          <p className="font-display text-lg font-semibold text-ink">
                            No books matched that topic filter.
                          </p>
                          <p className="text-xs text-ink-secondary">
                            Try broadening your theme or switching source to Entire Family Library.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Activity 2: Book Hunt ("Find It!") */}
              {activeAppId === 'book-hunt' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-edge-subtle">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-ink">
                        Hunt Book Pool
                      </label>
                      <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                        <button
                          type="button"
                          onClick={() => {
                            setHuntScope('active-shelf');
                            startNextHunt('active-shelf');
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            huntScope === 'active-shelf'
                              ? 'bg-surface text-ink shadow-2xs'
                              : 'text-ink-secondary hover:text-ink'
                          }`}
                        >
                          Active Shelf
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHuntScope('owned-library');
                            startNextHunt('owned-library');
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                            huntScope === 'owned-library'
                              ? 'bg-surface text-ink shadow-2xs'
                              : 'text-ink-secondary hover:text-ink'
                          }`}
                        >
                          Entire Library
                        </button>
                      </div>
                    </div>

                    {huntStreak > 0 && (
                      <div className="text-xs font-semibold text-accent font-mono-tabular">
                        Streak: {huntStreak} found
                      </div>
                    )}
                  </div>

                  {/* Treasure Clue Card */}
                  <div className="p-6 sm:p-8 rounded-xl bg-surface-elevated border border-edge text-center space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                      Book Clue
                    </p>

                    <h3 className="font-display text-2xl sm:text-3xl font-semibold text-ink max-w-lg mx-auto leading-snug">
                      “{huntPrompt || huntClue}”
                    </h3>

                    {huntBook && (
                      <div className="pt-2 flex flex-col items-center gap-3">
                        {huntPeekRevealed ? (
                          <div className="w-32 aspect-[3/4] rounded-lg overflow-hidden shadow-lg animate-sheet-up">
                            <BookCover book={huntBook} size="md" aspectRatio="portrait" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setHuntPeekRevealed(true)}
                            className="px-4 py-2 rounded-lg bg-surface hover:bg-surface-subtle text-ink text-xs font-semibold flex items-center gap-1.5 transition-colors border border-edge shadow-2xs cursor-pointer"
                          >
                            <Icon name="eye" className="w-4 h-4" />
                            <span>Peek Cover Artwork</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Celebration Feedback */}
                  {huntCelebrated && (
                    <div className="p-5 rounded-xl bg-surface-subtle border border-primary/40 text-center space-y-1.5 animate-sheet-up shadow-xs">
                      <BotanicalIllustration variant="reading-achievement" className="w-28 h-auto mx-auto" />
                      <h4 className="font-display font-semibold text-lg text-ink">
                        You Found It! Great Job!
                      </h4>
                      <p className="text-xs text-ink-secondary">
                        {huntBook?.title} has been spotted on your shelf.
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => startNextHunt()}
                      className="px-4 py-2.5 rounded-lg text-ink-secondary hover:bg-surface-elevated text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Skip / Next Clue
                    </button>

                    {!huntCelebrated ? (
                      <button
                        type="button"
                        onClick={handleFoundBook}
                        className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <Icon name="check" className="w-4 h-4" />
                        <span>Found It!</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startNextHunt()}
                        className="px-6 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <span>Play Next Clue →</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Activity 3: Reading Passport & Stamp Book Studio */}
              {activeAppId === 'reading-passport' && (
                <ReadingPassportStudio onClose={() => setActiveAppId(null)} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
