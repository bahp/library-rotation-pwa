import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import {
  formatBookCondition,
  formatCollectionStatus,
  formatReadingStage,
  normalizeCollectionStatus,
  type Book,
  type BookCondition,
  type BookFormat,
  type CollectionStatus,
  type ReadingStage,
} from '../../types/models.js';

export type EditorialFieldKey =
  | 'title'
  | 'authors'
  | 'collectionStatus'
  | 'genre'
  | 'format'
  | 'readingStage'
  | 'publishedYear'
  | 'pageCount'
  | 'estimatedValue'
  | 'ages'
  | 'isbn'
  | 'publisher'
  | 'edition'
  | 'language'
  | 'condition'
  | 'dimensions'
  | 'description';

export interface PublisherOption {
  name: string;
  count: number;
}

interface EditorialFieldSheetProps {
  field: EditorialFieldKey | null;
  book: Book;
  existingPublishers?: PublisherOption[];
  onClose: () => void;
  onPatchBook: (patch: Record<string, unknown>) => Promise<void>;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
}

const POPULAR_GENRE_PILLS = [
  'Fiction',
  'Bedtime',
  'Animals',
  'Nature',
  'Adventure',
  'Fairy Tales',
  'STEM',
  'Space',
  'Dinosaurs',
  'Humor',
  'Mystery & Thriller',
  'Romance',
  'Historical Fiction',
  'Biography & Memoir',
  'History',
  'Poetry',
];

const LANGUAGE_SUGGESTIONS = [
  'English',
  'Spanish',
  'Italian',
  'French',
  'German',
  'Bilingual',
];

const FORMAT_OPTIONS: Array<{ id: BookFormat; label: string; desc: string; icon: string }> = [
  { id: 'paperback', label: 'Paperback', desc: 'Soft flexible cover', icon: 'bookOpen' },
  { id: 'hardcover', label: 'Hardcover', desc: 'Sturdy cloth or jacketed boards', icon: 'book' },
  { id: 'board-book', label: 'Board Book', desc: 'Thick toddler-proof board pages', icon: 'layers' },
];

const STAGE_OPTIONS: Array<{ id: ReadingStage; label: string; ages: string }> = [
  { id: 'board-toddler', label: formatReadingStage('board-toddler'), ages: '0–2 yrs' },
  { id: 'picture-book', label: formatReadingStage('picture-book'), ages: '3–5 yrs' },
  { id: 'early-reader', label: formatReadingStage('early-reader'), ages: '6–8 yrs' },
  { id: 'chapter-book', label: formatReadingStage('chapter-book'), ages: '7–10 yrs' },
  { id: 'middle-grade', label: formatReadingStage('middle-grade'), ages: '9–12 yrs' },
  { id: 'teen-ya', label: formatReadingStage('teen-ya'), ages: '13–17 yrs' },
  { id: 'adult', label: formatReadingStage('adult'), ages: '18+ yrs' },
];

const CONDITION_OPTIONS: Array<{ id: BookCondition; label: string; desc: string }> = [
  { id: 'good', label: formatBookCondition('good'), desc: 'Clean copy ready for rotation shelves' },
  { id: 'torn', label: formatBookCondition('torn'), desc: 'Minor wear, taped pages, still readable' },
  { id: 'broken', label: formatBookCondition('broken'), desc: 'Needs spine or page repair (off rotations)' },
  { id: 'retired', label: formatBookCondition('retired'), desc: 'Archived keepsake (off rotations)' },
];

const COLLECTION_STATUS_OPTIONS: Array<{ id: CollectionStatus; label: string; desc: string; icon: string }> = [
  {
    id: 'owned',
    label: formatCollectionStatus('owned'),
    desc: 'In your home catalog and eligible for shelf rotations',
    icon: 'book',
  },
  {
    id: 'library',
    label: formatCollectionStatus('library'),
    desc: 'Borrowed from a public or school library',
    icon: 'building',
  },
  {
    id: 'wishlist',
    label: formatCollectionStatus('wishlist'),
    desc: 'Books on your future reading or acquisition wish list',
    icon: 'wishlist',
  },
  {
    id: 'interested',
    label: formatCollectionStatus('interested'),
    desc: 'Saved ideas for future reading',
    icon: 'bookmark',
  },
];

export function formatBookDimensionsLabel(dimensions: Book['dimensions']): string {
  if (!dimensions) return '';
  if (typeof dimensions === 'string') return dimensions.trim();
  if (typeof dimensions === 'object') {
    const d = dimensions as Record<string, unknown>;
    const parts = [d.height, d.width, d.thickness]
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
      .map((v) => String(v).trim());
    if (parts.length > 0) return parts.join(' × ');
  }
  return '';
}

function normalizeTagSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export const EditorialFieldSheet: React.FC<EditorialFieldSheetProps> = ({
  field,
  book,
  existingPublishers = [],
  onClose,
  onPatchBook,
  onAddTag,
  onRemoveTag,
}) => {
  const currentYear = new Date().getFullYear();
  const yearsList = useMemo(() => {
    const out: number[] = [];
    for (let y = currentYear + 1; y >= 1900; y -= 1) {
      out.push(y);
    }
    return out;
  }, [currentYear]);

  const [textValue, setTextValue] = useState('');
  const [secondaryText, setSecondaryText] = useState('');
  const [selectedYear, setSelectedYear] = useState<number>(book.publishedYear || currentYear);
  const [genreSearch, setGenreSearch] = useState('');
  const [publisherQuery, setPublisherQuery] = useState('');
  const [currency, setCurrency] = useState(book.estimatedCurrency || book.listPriceCurrency || 'USD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedYearRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!field) return;
    setError('');
    setSaving(false);
    setGenreSearch('');
    setPublisherQuery('');
    switch (field) {
      case 'title':
        setTextValue(book.title || '');
        break;
      case 'authors':
        setTextValue((book.authors || []).join(', '));
        break;
      case 'isbn':
        setTextValue(book.isbn13 || book.isbn10 || '');
        break;
      case 'publisher':
        setTextValue(book.publisher || '');
        setPublisherQuery('');
        break;
      case 'edition':
        setTextValue(book.edition || '');
        break;
      case 'language':
        setTextValue(book.language || '');
        break;
      case 'pageCount':
        setTextValue(book.pageCount ? String(book.pageCount) : '');
        break;
      case 'estimatedValue':
        setTextValue(
          book.estimatedValue !== undefined && book.estimatedValue !== null
            ? String(book.estimatedValue)
            : ''
        );
        setCurrency(book.estimatedCurrency || book.listPriceCurrency || 'USD');
        break;
      case 'ages':
        setTextValue(typeof book.ageMin === 'number' ? String(book.ageMin) : '');
        setSecondaryText(typeof book.ageMax === 'number' ? String(book.ageMax) : '');
        break;
      case 'publishedYear':
        setSelectedYear(book.publishedYear || currentYear);
        setTextValue(book.publishedYear ? String(book.publishedYear) : '');
        break;
      case 'dimensions':
        setTextValue(formatBookDimensionsLabel(book.dimensions));
        break;
      case 'description':
        setTextValue(book.description || '');
        break;
      default:
        setTextValue('');
        break;
    }

    const focusTimer = window.setTimeout(() => {
      if (field === 'publishedYear') {
        selectedYearRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      } else if (field === 'title') {
        titleTextareaRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 60);
    return () => window.clearTimeout(focusTimer);
  }, [field, book, currentYear]);

  const filteredGenreRows = useMemo(() => {
    const q = genreSearch.trim().toLowerCase();
    const combined = Array.from(
      new Set([
        ...POPULAR_GENRE_PILLS,
        ...book.tags.map((tag) =>
          tag
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
        ),
      ])
    );
    if (!q) return combined;
    return combined.filter((g) => g.toLowerCase().includes(q));
  }, [genreSearch, book.tags]);

  const filteredPublishers = useMemo(() => {
    const q = publisherQuery.trim().toLowerCase();
    if (!q) return existingPublishers;
    return existingPublishers.filter((p) => p.name.toLowerCase().includes(q));
  }, [existingPublishers, publisherQuery]);

  if (!field) return null;

  const isSelectListField =
    field === 'collectionStatus' ||
    field === 'format' ||
    field === 'readingStage' ||
    field === 'condition' ||
    field === 'genre';

  const commitAndClose = async (patch: Record<string, unknown>) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onPatchBook(patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (saving) return;

    switch (field) {
      case 'title': {
        const cleanTitle = textValue.replace(/\s*\n\s*/g, ' ').trim();
        if (!cleanTitle) {
          setError('Book title is required.');
          return;
        }
        await commitAndClose({ title: cleanTitle });
        return;
      }
      case 'authors': {
        const list = textValue
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);
        await commitAndClose({ authors: list.length > 0 ? list : ['Unknown Author'] });
        return;
      }
      case 'isbn': {
        const clean = textValue.replace(/[-\s]/g, '').toUpperCase();
        if (clean && clean.length !== 10 && clean.length !== 13) {
          setError('Enter a valid 10- or 13-digit ISBN, or leave blank to clear.');
          return;
        }
        await commitAndClose({ isbn: clean || undefined, isbn13: clean.length === 13 ? clean : '', isbn10: clean.length === 10 ? clean : undefined });
        return;
      }
      case 'publisher':
        await commitAndClose({
          publisher: publisherQuery.trim() || textValue.trim(),
        });
        return;
      case 'edition':
        await commitAndClose({ edition: textValue.trim() });
        return;
      case 'language':
        await commitAndClose({ language: textValue.trim().toLowerCase() });
        return;
      case 'dimensions':
        await commitAndClose({ dimensions: textValue.trim() });
        return;
      case 'description':
        await commitAndClose({ description: textValue.trim() || null });
        return;
      case 'pageCount': {
        const trimmed = textValue.trim();
        if (!trimmed) {
          await commitAndClose({ pageCount: null });
          return;
        }
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 1 || n > 10000) {
          setError('Enter a page count between 1 and 10,000.');
          return;
        }
        await commitAndClose({ pageCount: Math.round(n) });
        return;
      }
      case 'estimatedValue': {
        const trimmed = textValue.trim().replace(',', '.');
        if (!trimmed) {
          await commitAndClose({ estimatedValue: null, estimatedCurrency: currency });
          return;
        }
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 0) {
          setError('Enter a valid non-negative amount.');
          return;
        }
        await commitAndClose({
          estimatedValue: Math.round(n * 100) / 100,
          estimatedCurrency: currency,
        });
        return;
      }
      case 'ages': {
        const minTrim = textValue.trim();
        const maxTrim = secondaryText.trim();
        if (!minTrim && !maxTrim) {
          await commitAndClose({ ageMin: null, ageMax: null });
          return;
        }
        const rawMin = Number(minTrim);
        if (!minTrim || !Number.isFinite(rawMin)) {
          setError('Enter a minimum age (e.g. 3) or clear both fields.');
          return;
        }
        const minVal = Math.max(0, Math.min(120, Math.round(rawMin)));
        const rawMax = maxTrim ? Number(maxTrim) : 99;
        const maxVal = Number.isFinite(rawMax)
          ? Math.max(minVal, Math.min(120, Math.round(rawMax)))
          : 99;
        await commitAndClose({ ageMin: minVal, ageMax: maxVal });
        return;
      }
      case 'publishedYear': {
        const manualTrim = textValue.trim();
        const resolved = manualTrim ? Number(manualTrim) : selectedYear;
        if (!Number.isFinite(resolved) || resolved < 1400 || resolved > currentYear + 5) {
          setError(`Enter a year between 1400 and ${currentYear + 5}.`);
          return;
        }
        await commitAndClose({ publishedYear: Math.round(resolved) });
        return;
      }
      default:
        onClose();
    }
  };

  const isbnDigitsCount = textValue.replace(/[^0-9Xx]/g, '').length;

  const metaByField: Record<EditorialFieldKey, { eyebrow: string; question: string; hint?: string }> = {
    title: { eyebrow: 'Title', question: "What's the book's title?" },
    authors: {
      eyebrow: 'Authors',
      question: 'Who wrote or illustrated it?',
      hint: 'Separate multiple names with commas.',
    },
    collectionStatus: { eyebrow: 'Collection Status', question: 'Where does this book belong?' },
    genre: { eyebrow: 'Genre', question: 'Pick a genre' },
    format: { eyebrow: 'Format', question: 'Which format is this copy?' },
    readingStage: { eyebrow: 'Reading Stage', question: 'Which reading stage fits best?' },
    publishedYear: { eyebrow: 'Pub. Year', question: 'Publication Year' },
    pageCount: {
      eyebrow: 'Pages',
      question: 'How many pages does it have?',
      hint: 'Check the last numbered page or catalog listing.',
    },
    estimatedValue: {
      eyebrow: 'Est. Value',
      question: 'What is its estimated value?',
      hint:
        book.listPriceAmount !== undefined
          ? `Catalog list price: ${book.listPriceCurrency || 'USD'} ${book.listPriceAmount.toFixed(2)}`
          : 'Optional replacement or keepsake value for your catalog.',
    },
    ages: {
      eyebrow: 'Reading Ages',
      question: 'What age range is this best for?',
    },
    isbn: {
      eyebrow: 'ISBN',
      question: "What's its ISBN?",
      hint: 'Usually above the barcode, or on the copyright page.',
    },
    publisher: { eyebrow: 'Publisher', question: 'Who published this copy?' },
    edition: { eyebrow: 'Edition', question: 'Which edition is yours?' },
    language: {
      eyebrow: 'Language',
      question: 'What language is it in?',
    },
    condition: { eyebrow: 'Condition', question: 'What condition is this copy in?' },
    dimensions: {
      eyebrow: 'Dimensions',
      question: 'What are its dimensions?',
      hint: 'Height × width × thickness (e.g. 22 × 22 cm).',
    },
    description: {
      eyebrow: 'Description',
      question: 'Synopsis / Back-Cover Blurb',
      hint: 'Helps match books for bedtime, mood shelves, and search.',
    },
  };

  const sheetMeta = metaByField[field];

  const toggleGenreTag = async (label: string) => {
    const slug = normalizeTagSlug(label);
    if (!slug) return;
    if (book.tags.includes(slug)) {
      await onRemoveTag(slug);
    } else {
      await onAddTag(slug);
    }
  };

  return (
    <div
      data-editorial-sheet-backdrop="true"
      className="fixed inset-0 z-[70] bg-scrim backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={sheetMeta.eyebrow}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[86dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Shared Elegant Sheet Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              {sheetMeta.eyebrow}
            </p>
            <h3 className="font-display text-2xl font-semibold text-ink mt-1 leading-tight">
              {sheetMeta.question}
            </h3>
            {sheetMeta.hint && (
              <p className="mt-1.5 font-serif-italic italic text-xs text-ink-secondary leading-relaxed">
                {sheetMeta.hint}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        {/* Field-Specific Editor Body */}
        {isSelectListField ? (
          <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2 space-y-3">
            {field === 'genre' && (
              <>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
                    <Icon name="search" className="w-4 h-4" />
                  </span>
                  <ClearableInput
                    id="editorial-genre-search"
                    value={genreSearch}
                    onValueChange={setGenreSearch}
                    placeholder="Search genres…"
                    className="w-full h-11 pl-10 pr-9 rounded-xl bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2 inline-flex items-center gap-1.5">
                    <Icon name="star" className="w-3.5 h-3.5 text-accent" />
                    <span>Popular</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_GENRE_PILLS.slice(0, 6).map((label) => {
                      const active = book.tags.includes(normalizeTagSlug(label));
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleGenreTag(label)}
                          aria-pressed={active}
                          className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                            active
                              ? 'bg-primary text-primary-fg'
                              : 'bg-surface-subtle border border-edge text-ink hover:border-primary/50'
                          }`}
                        >
                          {active && <Icon name="check" className="w-3 h-3" />}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {genreSearch.trim() && !book.tags.includes(normalizeTagSlug(genreSearch)) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onAddTag(normalizeTagSlug(genreSearch));
                      setGenreSearch('');
                    }}
                    className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-primary/50 text-xs font-semibold text-primary flex items-center gap-2 cursor-pointer"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Add “{genreSearch.trim()}”</span>
                  </button>
                )}

                <div className="space-y-1.5 pt-1">
                  {filteredGenreRows.map((label) => {
                    const active = book.tags.includes(normalizeTagSlug(label));
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleGenreTag(label)}
                        aria-pressed={active}
                        className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl border text-left text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          active
                            ? 'bg-surface-elevated border-primary text-primary'
                            : 'bg-surface-subtle/70 border-edge text-ink hover:border-primary/40'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5 truncate">
                          <Icon name="starFilled" className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span className="truncate">{label}</span>
                        </span>
                        {active && <Icon name="check" className="w-4 h-4 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            {field === 'format' && (
              <div className="divide-y divide-edge-subtle">
                {FORMAT_OPTIONS.map((opt) => {
                  const active = book.format === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitAndClose({ format: opt.id })}
                      className="w-full py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 px-1 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon name={opt.icon} className="w-4 h-4 text-ink-secondary shrink-0" />
                        <span className="min-w-0">
                          <span className={`block font-display text-base ${active ? 'font-semibold text-primary' : 'text-ink'}`}>
                            {opt.label}
                          </span>
                          <span className="block text-[11px] text-ink-muted">{opt.desc}</span>
                        </span>
                      </span>
                      {active && <Icon name="check" className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {field === 'readingStage' && (
              <div className="divide-y divide-edge-subtle">
                {STAGE_OPTIONS.map((opt) => {
                  const active = book.readingStage === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitAndClose({ readingStage: opt.id })}
                      className="w-full py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 px-1 rounded-lg transition-colors"
                    >
                      <span>
                        <span className={`block font-display text-base ${active ? 'font-semibold text-primary' : 'text-ink'}`}>
                          {opt.label}
                        </span>
                        <span className="block text-[11px] text-ink-muted">{opt.ages}</span>
                      </span>
                      {active && <Icon name="check" className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {field === 'collectionStatus' && (
              <div className="divide-y divide-edge-subtle">
                {COLLECTION_STATUS_OPTIONS.map((opt) => {
                  const active = normalizeCollectionStatus(book.collectionStatus) === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitAndClose({ collectionStatus: opt.id })}
                      className="w-full py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 px-1 rounded-lg transition-colors"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon name={opt.icon} className="w-4 h-4 text-ink-secondary shrink-0" />
                        <span className="min-w-0">
                          <span className={`block font-display text-base ${active ? 'font-semibold text-primary' : 'text-ink'}`}>
                            {opt.label}
                          </span>
                          <span className="block text-[11px] text-ink-muted">{opt.desc}</span>
                        </span>
                      </span>
                      {active && <Icon name="check" className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {field === 'condition' && (
              <div className="divide-y divide-edge-subtle">
                {CONDITION_OPTIONS.map((opt) => {
                  const active = (book.condition || 'good') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => commitAndClose({ condition: opt.id })}
                      className="w-full py-3.5 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-elevated/40 px-1 rounded-lg transition-colors"
                    >
                      <span>
                        <span className={`block font-display text-base ${active ? 'font-semibold text-primary' : 'text-ink'}`}>
                          {opt.label}
                        </span>
                        <span className="block text-[11px] text-ink-muted">{opt.desc}</span>
                      </span>
                      {active && <Icon name="check" className="w-4 h-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSaveSubmit} className="flex-1 flex flex-col min-h-0 px-5 pb-5 pt-2">
            {error && (
              <p role="alert" className="mb-3 text-xs font-medium text-danger">
                {error}
              </p>
            )}

            {field === 'isbn' && (
              <div className="py-4 space-y-3 text-center">
                <div className="border-b-2 border-primary/80 pb-2 flex justify-center">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="e.g. 9780064400558"
                    className="w-full max-w-xs text-center font-mono-tabular text-lg font-semibold tracking-widest bg-surface-subtle rounded-md px-3 py-1.5 text-ink placeholder:text-ink-muted placeholder:font-sans placeholder:italic placeholder:tracking-normal focus:outline-none"
                  />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                  {isbnDigitsCount} DIGITS
                </p>
              </div>
            )}

            {field === 'publishedYear' && (
              <div className="space-y-3 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-secondary shrink-0">Type or pick:</span>
                  <input
                    type="number"
                    min={1400}
                    max={currentYear + 5}
                    value={textValue}
                    onChange={(e) => {
                      setTextValue(e.target.value);
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= currentYear + 1) {
                        setSelectedYear(parsed);
                      }
                    }}
                    placeholder={`e.g. ${currentYear}`}
                    className="w-28 h-9 px-2.5 rounded-lg bg-surface-subtle border border-edge text-sm font-mono-tabular text-ink focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex-1 min-h-[180px] max-h-[240px] overflow-y-auto rounded-xl bg-surface-subtle/60 border border-edge divide-y divide-edge-subtle">
                  {yearsList.map((yr) => {
                    const isSelected = selectedYear === yr && (!textValue || Number(textValue) === yr);
                    return (
                      <button
                        key={yr}
                        ref={yr === selectedYear ? selectedYearRef : undefined}
                        type="button"
                        onClick={() => {
                          setSelectedYear(yr);
                          setTextValue(String(yr));
                        }}
                        className={`w-full py-2.5 text-center font-mono-tabular text-base transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary/15 font-bold text-primary'
                            : 'text-ink-secondary hover:text-ink hover:bg-surface-elevated/40'
                        }`}
                      >
                        {yr}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {field === 'language' && (
              <div className="space-y-4 py-2">
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGE_SUGGESTIONS.map((lang) => {
                    const active = textValue.trim().toLowerCase() === lang.toLowerCase();
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setTextValue(lang.toLowerCase())}
                        className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-primary text-primary-fg'
                            : 'bg-surface-subtle border border-edge text-ink hover:border-primary/50'
                        }`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
                <div className="border-b-2 border-primary/80 pb-1.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="e.g. English, Spanish, Bilingual"
                    className="w-full bg-transparent text-lg font-display text-ink placeholder:text-ink-muted placeholder:font-serif-italic placeholder:italic focus:outline-none capitalize"
                  />
                </div>
              </div>
            )}

            {field === 'estimatedValue' && (
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-2">
                  {['USD', 'EUR', 'GBP'].map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setCurrency(code)}
                      className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        currency === code
                          ? 'bg-primary text-primary-fg'
                          : 'bg-surface-subtle border border-edge text-ink-secondary'
                      }`}
                    >
                      {code}
                    </button>
                  ))}
                </div>
                <div className="border-b-2 border-primary/80 pb-1.5 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink-secondary font-mono-tabular">
                    {currency}
                  </span>
                  <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder="e.g. 16.99"
                    className="flex-1 bg-transparent text-xl font-mono-tabular text-ink placeholder:text-ink-muted placeholder:font-serif-italic placeholder:italic focus:outline-none"
                  />
                </div>
              </div>
            )}

            {field === 'ages' && (
              <div className="space-y-4 py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    [0, 2],
                    [2, 5],
                    [3, 99],
                    [4, 8],
                    [7, 10],
                    [9, 12],
                    [13, 17],
                    [18, 99],
                  ].map(([minA, maxA]) => (
                    <button
                      key={`${minA}-${maxA}`}
                      type="button"
                      onClick={() => {
                        setTextValue(String(minA));
                        setSecondaryText(String(maxA));
                      }}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold font-mono-tabular border cursor-pointer ${
                        textValue !== '' &&
                        Number(textValue) === minA &&
                        Number(secondaryText) === maxA
                          ? 'bg-primary text-primary-fg border-primary'
                          : 'bg-surface-subtle border-edge text-ink'
                      }`}
                    >
                      {maxA >= 99 ? `${minA}+` : `${minA}–${maxA}`}
                    </button>
                  ))}
                  {(textValue !== '' || secondaryText !== '' || typeof book.ageMin === 'number') && (
                    <button
                      type="button"
                      onClick={() => commitAndClose({ ageMin: null, ageMax: null })}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold border border-edge bg-surface text-danger hover:bg-danger/10 cursor-pointer ml-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                      Min Age
                    </label>
                    <input
                      ref={inputRef}
                      type="number"
                      min={0}
                      max={120}
                      placeholder="e.g. 3"
                      value={textValue}
                      onChange={(e) => setTextValue(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
                      Max Age (99 = +)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      placeholder="99 for open"
                      value={secondaryText}
                      onChange={(e) => setSecondaryText(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg bg-surface-subtle border border-edge text-base font-mono-tabular text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {field === 'title' && (
              <div className="py-3">
                <textarea
                  ref={titleTextareaRef}
                  rows={3}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSaveSubmit();
                    }
                  }}
                  placeholder="e.g. Goodnight Moon"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border-2 border-primary/70 text-lg font-display text-ink placeholder:text-ink-muted placeholder:font-serif-italic placeholder:italic leading-snug focus:outline-none focus:border-primary resize-none"
                />
              </div>
            )}

            {field === 'description' && (
              <div className="py-3">
                <textarea
                  rows={5}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  placeholder="Short book blurb or story summary…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border-2 border-primary/70 text-sm text-ink placeholder:text-ink-muted placeholder:font-serif-italic placeholder:italic leading-relaxed focus:outline-none focus:border-primary resize-y"
                />
              </div>
            )}

            {field === 'publisher' && (
              <div className="py-2 space-y-3 flex-1 min-h-0 flex flex-col">
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-ink-muted">
                    <Icon name="search" className="w-4 h-4" />
                  </span>
                  <ClearableInput
                    id="editorial-publisher-search"
                    value={publisherQuery}
                    onValueChange={(val) => {
                      setPublisherQuery(val);
                      setTextValue(val);
                    }}
                    placeholder={
                      existingPublishers.length > 0
                        ? 'Search catalog publishers or type a new one…'
                        : 'e.g. Candlewick Press'
                    }
                    className="w-full h-11 pl-10 pr-9 rounded-xl bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                  />
                </div>

                {book.publisher && (
                  <div className="rounded-xl bg-primary/10 border border-primary/35 px-3.5 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Current Publisher
                      </span>
                      <span className="block text-sm font-semibold text-ink truncate">
                        {book.publisher}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => commitAndClose({ publisher: '' })}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg bg-surface border border-edge text-[11px] font-semibold text-danger hover:bg-danger/10 shrink-0 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}

                {publisherQuery.trim() &&
                  !existingPublishers.some(
                    (p) => p.name.toLowerCase() === publisherQuery.trim().toLowerCase()
                  ) && (
                    <button
                      type="button"
                      onClick={() => commitAndClose({ publisher: publisherQuery.trim() })}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-subtle hover:bg-surface-elevated border border-primary/50 text-xs font-semibold text-primary flex items-center gap-2 cursor-pointer"
                    >
                      <Icon name="plus" className="w-4 h-4 shrink-0" />
                      <span className="truncate">Use &amp; Save “{publisherQuery.trim()}”</span>
                    </button>
                  )}

                {filteredPublishers.length > 0 && (
                  <div className="flex-1 min-h-0 max-h-[220px] overflow-y-auto rounded-xl bg-surface-subtle/60 border border-edge divide-y divide-edge-subtle">
                    {filteredPublishers.map((pub) => {
                      const active =
                        (book.publisher || '').trim().toLowerCase() === pub.name.toLowerCase();
                      return (
                        <button
                          key={pub.name}
                          type="button"
                          onClick={() => commitAndClose({ publisher: pub.name })}
                          aria-pressed={active}
                          className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            active
                              ? 'bg-primary/12 text-primary font-semibold'
                              : 'text-ink hover:bg-surface-elevated/60'
                          }`}
                        >
                          <span className="text-sm truncate">{pub.name}</span>
                          <span className="inline-flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono-tabular text-ink-muted">
                              {pub.count} {pub.count === 1 ? 'book' : 'books'}
                            </span>
                            {active && <Icon name="check" className="w-4 h-4 text-primary" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {(field === 'authors' ||
              field === 'edition' ||
              field === 'pageCount' ||
              field === 'dimensions') && (
              <div className="py-4">
                <div className="border-b-2 border-primary/80 pb-1.5">
                  <input
                    ref={inputRef}
                    type={field === 'pageCount' ? 'number' : 'text'}
                    min={field === 'pageCount' ? 1 : undefined}
                    max={field === 'pageCount' ? 10000 : undefined}
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    placeholder={
                      field === 'authors'
                        ? 'e.g. Margaret Wise Brown, Clement Hurd'
                        : field === 'edition'
                          ? 'e.g. First edition'
                          : field === 'pageCount'
                            ? 'e.g. 48'
                            : 'e.g. 22 × 22 × 1 cm'
                    }
                    className="w-full bg-transparent text-xl font-display text-ink placeholder:text-ink-muted placeholder:font-serif-italic placeholder:italic focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Shared Cancel / Save Bar */}
            <div className="pt-4 mt-auto flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-ink-secondary hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] min-w-[116px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
              >
                {saving ? 'Saving…' : field === 'publishedYear' ? 'Done' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
