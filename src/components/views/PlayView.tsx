import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.js';
import { PlayAppCard } from '../cards/PlayAppCard.js';
import { BookCard } from '../cards/BookCard.js';
import { BookCover } from '../common/BookCover.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { PLAY_APPS_CONFIG, type PlayAppConfig } from '../../config/play-apps.js';
import { pickStorytimeBooks, createBookHuntChallenge } from '../../features/play/play-activities.js';
import type { Book } from '../../types/models.js';

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

  const activeApp = PLAY_APPS_CONFIG.find((a) => a.id === activeAppId) || null;

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

  const startNextHunt = () => {
    const challenge = createBookHuntChallenge({
      books: state.books,
      activeRotation,
      activeProfile,
      scope: huntScope,
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
    <div className="space-y-6 text-left max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <p className="text-[11px] font-semibold text-espresso-800 dark:text-[#5ED3DA] uppercase tracking-wider">
          Play &amp; Storytime
        </p>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white leading-tight mt-0.5">
          Interactive Hub
        </h1>
        <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
          Quick bedtime draws, theme pickers, and shelf treasure hunts for {activeProfile?.name || 'the family'}.
        </p>
      </div>

      {/* Showcase Launcher Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <div
            onClick={() => setActiveAppId(null)}
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity animate-fade-in"
          />

          {/* Bottom Sheet Container */}
          <div className="relative w-full max-h-[92vh] sm:max-h-[88vh] sm:max-w-2xl flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 shadow-2xl animate-sheet-up overflow-hidden z-10">
            {/* Handle Pill for Mobile Swipe Gesture */}
            <div className="w-12 h-1 rounded-full bg-stone-300 dark:bg-night-700 mx-auto my-2.5 shrink-0" />

            {/* Header bar inside sheet */}
            <div className="px-5 py-3 border-b border-linen-200/80 dark:border-night-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="relative w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-linen-200 dark:border-night-700 bg-linen-100 dark:bg-night-800 text-forest-800 dark:text-[#5ED3DA] flex items-center justify-center shadow-2xs">
                  <Icon name={activeApp.logoIcon || 'play'} className="w-5 h-5" />
                  {activeApp.logoUrl &&
                    ((activeAppId === 'storytime-picker' && !storyLogoError) ||
                      (activeAppId === 'book-hunt' && !huntLogoError)) && (
                      <img
                        src={activeApp.logoUrl}
                        alt={`${activeApp.title} logo`}
                        onError={() => {
                          if (activeAppId === 'storytime-picker') setStoryLogoError(true);
                          if (activeAppId === 'book-hunt') setHuntLogoError(true);
                        }}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    )}
                </span>
                <div className="min-w-0">
                  <h2
                    id="play-activity-title"
                    className="font-display text-base sm:text-lg font-bold text-forest-900 dark:text-white truncate"
                  >
                    {activeApp.title}
                  </h2>
                  <p className="text-xs text-stone-ink dark:text-slate-400 truncate">
                    {activeApp.shortTagline}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                aria-label="Close activity sheet"
                className="w-8 h-8 rounded-full bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-600 dark:text-slate-300 flex items-center justify-center transition-colors"
              >
                <Icon name="close" className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Sheet Content */}
            <div className="overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Activity 1: Storytime & Topic Picker */}
              {activeAppId === 'storytime-picker' && (
                <div className="space-y-5">
                  {/* Controls Form */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Number of Books Stepper with - and + buttons */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
                          Number of Books
                        </label>
                        <div className="flex items-center gap-1 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700 w-fit">
                          <button
                            type="button"
                            onClick={() => setStoryCount((c) => Math.max(1, c - 1))}
                            disabled={storyCount <= 1}
                            aria-label="Decrease book count"
                            className="h-9 w-9 rounded-lg bg-white dark:bg-night-800 disabled:opacity-40 font-bold text-base flex items-center justify-center transition-colors shadow-2xs hover:bg-linen-50 dark:hover:bg-night-700 text-forest-900 dark:text-white"
                          >
                            −
                          </button>
                          <span className="min-w-[72px] px-2 text-center text-xs sm:text-sm font-bold font-mono-tabular text-forest-900 dark:text-white">
                            {storyCount} {storyCount === 1 ? 'Book' : 'Books'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setStoryCount((c) => c + 1)}
                            aria-label="Increase book count"
                            className="h-9 w-9 rounded-lg bg-white dark:bg-night-800 font-bold text-base flex items-center justify-center transition-colors shadow-2xs hover:bg-linen-50 dark:hover:bg-night-700 text-forest-900 dark:text-white"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Source Book Pool Selector */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
                          Book Source Pool
                        </label>
                        <select
                          value={storyScope}
                          onChange={(e) => setStoryScope(e.target.value as any)}
                          className="w-full h-11 px-3.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold text-forest-900 dark:text-white focus:outline-2 focus:outline-forest-700"
                        >
                          <option value="active-shelf">Active Shelf Rotation</option>
                          <option value="owned-library">Entire Family Library</option>
                        </select>
                      </div>
                    </div>

                    {/* Topic / Mood Search */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
                        Filter by Mood or Theme (Optional)
                      </label>
                      <ClearableInput
                        id="play-topic-input"
                        value={storyTopic}
                        onValueChange={setStoryTopic}
                        placeholder="e.g. bedtime, trucks, animals, space..."
                        className="px-3.5 py-2.5 rounded-xl bg-linen-50 dark:bg-night-800 border border-linen-200 dark:border-night-700 text-xs font-semibold"
                      />
                    </div>

                    {/* Quick Topic Shortcut Chips */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStoryTopic('')}
                        aria-pressed={!storyTopic.trim()}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                          !storyTopic.trim()
                            ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold shadow-2xs'
                            : 'bg-linen-100 dark:bg-night-800 text-stone-700 dark:text-slate-300 hover:bg-linen-200 dark:hover:bg-night-700'
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
                            className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-colors ${
                              isSelected
                                ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold shadow-2xs'
                                : 'bg-linen-100 dark:bg-night-800 text-stone-700 dark:text-slate-300 hover:bg-linen-200 dark:hover:bg-night-700'
                            }`}
                          >
                            {topic}
                          </button>
                        );
                      })}
                    </div>

                    {/* Unread Priority Checkbox & Primary Draw Button */}
                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-linen-200/80 dark:border-night-800">
                      <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={storyUnreadFirst}
                          onChange={(e) => setStoryUnreadFirst(e.target.checked)}
                          className="w-4 h-4 rounded text-forest-700 accent-forest-700"
                        />
                        <span className="font-semibold text-stone-700 dark:text-slate-300">
                          Prefer unread books first
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={handleRunStorytimePicker}
                        className="px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 dark:hover:bg-[#4bc2c9] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors"
                      >
                        <Icon name="dice" className="w-4 h-4" />
                        <span>Draw Storytime Books!</span>
                      </button>
                    </div>
                  </div>

                  {/* Draw Results */}
                  {pickerHasRun && (
                    <div className="pt-4 border-t border-linen-200/80 dark:border-night-800 space-y-3">
                      <h3 className="font-display font-bold text-base text-forest-900 dark:text-white">
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
                                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium leading-tight">
                                  Matched: {pickedReasons[book.id].join(', ')}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-6 rounded-2xl bg-linen-50 dark:bg-night-950 text-center space-y-1">
                          <p className="text-sm font-semibold text-forest-900 dark:text-white">
                            No books matched that topic filter.
                          </p>
                          <p className="text-xs text-stone-ink dark:text-slate-400">
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
                  <div className="flex items-center justify-between pb-3 border-b border-linen-200/80 dark:border-night-800">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-stone-700 dark:text-slate-300">
                        Hunt Book Pool
                      </label>
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-linen-100 dark:bg-night-950 border border-linen-200 dark:border-night-700">
                        <button
                          type="button"
                          onClick={() => {
                            setHuntScope('active-shelf');
                            startNextHunt();
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            huntScope === 'active-shelf'
                              ? 'bg-white dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                              : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                          }`}
                        >
                          Active Shelf
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHuntScope('owned-library');
                            startNextHunt();
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            huntScope === 'owned-library'
                              ? 'bg-white dark:bg-night-800 text-forest-900 dark:text-white shadow-2xs'
                              : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                          }`}
                        >
                          Entire Library
                        </button>
                      </div>
                    </div>

                    {huntStreak > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 font-bold text-xs shadow-2xs">
                        <span>Streak: {huntStreak}</span>
                        <span>🔥</span>
                      </div>
                    )}
                  </div>

                  {/* Treasure Clue Card */}
                  <div className="p-6 sm:p-8 rounded-3xl bg-linear-to-br from-linen-100 to-linen-200 dark:from-night-800 dark:to-night-700 text-center space-y-4 shadow-inner">
                    <span className="inline-block px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs">
                      Book Clue
                    </span>

                    <h3 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white max-w-lg mx-auto leading-relaxed">
                      “{huntPrompt || huntClue}”
                    </h3>

                    {huntBook && (
                      <div className="pt-2 flex flex-col items-center gap-3">
                        {huntPeekRevealed ? (
                          <div className="w-32 aspect-[3/4] rounded-xl overflow-hidden shadow-xl animate-sheet-up">
                            <BookCover book={huntBook} size="md" aspectRatio="portrait" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setHuntPeekRevealed(true)}
                            className="px-4 py-2 rounded-xl bg-white/80 hover:bg-white dark:bg-night-900/70 text-stone-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-linen-300 dark:border-night-600 shadow-xs"
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
                    <div className="p-5 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-center space-y-1 animate-sheet-up shadow-xs">
                      <span className="text-3xl">🎉 ⭐️ 📚</span>
                      <h4 className="font-display font-bold text-base text-emerald-900 dark:text-emerald-200">
                        You Found It! Great Job!
                      </h4>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300">
                        {huntBook?.title} has been spotted on your shelf.
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={startNextHunt}
                      className="px-4 py-2.5 rounded-xl text-stone-600 dark:text-slate-400 hover:bg-linen-100 dark:hover:bg-night-800 text-xs font-semibold transition-colors"
                    >
                      Skip / Next Clue
                    </button>

                    {!huntCelebrated ? (
                      <button
                        type="button"
                        onClick={handleFoundBook}
                        className="px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-2 shadow-md transition-colors"
                      >
                        <Icon name="check" className="w-4 h-4" />
                        <span>Found It! 🎯</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={startNextHunt}
                        className="px-6 py-2.5 rounded-xl bg-forest-900 hover:bg-forest-800 text-white dark:bg-[#5ED3DA] dark:text-night-950 font-bold text-xs flex items-center gap-2 shadow-md transition-colors"
                      >
                        <span>Play Next Clue →</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
