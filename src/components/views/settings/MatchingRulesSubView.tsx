import React, { useMemo, useState } from 'react';
import { useApp } from '../../../context/AppContext.js';
import { Icon } from '../../common/Icon.js';
import { ToggleSwitch } from '../../common/ToggleSwitch.js';
import { SettingsSubViewHeader } from './SettingsPrimitives.js';
import {
  DEFAULT_MATCHING_WEIGHTS,
  createDefaultMatchingWeights,
  createDefaultTaggingRulesConfig,
  normalizeMatchingWeights,
  normalizeTaggingRulesConfig,
} from '../../../config/index.js';
import {
  explainLocalTagMatches,
  getBuiltInTaxonomyRuleCatalog,
} from '../../../features/tagging/rule-tagger.js';
import {
  getProfileRecommendations,
  isBookOwnedAndRotatable,
  scoreSimilarBooksForAnchor,
} from '../../../features/tagging/recommendations.js';
import { scoreEligibleBooks } from '../../../features/rotations/rotation-engine.js';
import type {
  BookSimilarityWeights,
  CustomTagRule,
  MatchingWeightsConfig,
  ProfileRecommendationWeights,
  RotationScoringWeights,
  TaggingRulesConfig,
} from '../../../types/models.js';

interface MatchingRulesSubViewProps {
  onBack: () => void;
  backLabel: string;
}

type MatchingTab = 'weights' | 'rules';
type PreviewEngineMode = 'profile' | 'similarity' | 'rotation';

interface WeightFieldMeta<K extends string> {
  key: K;
  label: string;
  hint: string;
  min: number;
  max: number;
  step?: number;
}

const PROFILE_WEIGHT_FIELDS: WeightFieldMeta<keyof ProfileRecommendationWeights>[] = [
  { key: 'exactAge', label: 'Exact Age Fit', hint: 'Book age span includes reader age', min: 0, max: 100 },
  { key: 'nearAge', label: 'Near Age (+/- 1 yr)', hint: 'Within one year of reader age', min: 0, max: 100 },
  { key: 'outOfAge', label: 'Outside Age Range', hint: 'Fallback points when out of age span', min: -50, max: 50 },
  { key: 'readingStage', label: 'Reading Stage Match', hint: 'Matches reader stage (e.g. picture book)', min: 0, max: 100 },
  { key: 'favoriteTopicPerMatch', label: 'Favorite Topic Match', hint: 'Points per matching reader topic tag', min: 0, max: 50 },
  { key: 'favoriteTopicMax', label: 'Topic Match Cap', hint: 'Maximum points summed from favorite topics', min: 0, max: 150 },
  { key: 'unreadBonus', label: 'Unread Discovery Bonus', hint: 'Boost for stories not read together yet', min: 0, max: 60 },
  { key: 'offCooldownBonus', label: 'Off Cooldown Bonus', hint: 'Eligible book not recently rotated', min: 0, max: 60 },
  { key: 'neverRotatedBonus', label: 'Never Rotated Bonus', hint: 'Brand-new or unseen books in library', min: 0, max: 60 },
  { key: 'cooldownPenalty', label: 'Cooldown Penalty', hint: 'Negative offset when recently rotated', min: -120, max: 0 },
  { key: 'lovedBonus', label: 'Loved Favorite Bonus', hint: 'Hearted books get gentle priority', min: 0, max: 60 },
];

const SIMILARITY_WEIGHT_FIELDS: WeightFieldMeta<keyof BookSimilarityWeights>[] = [
  { key: 'sharedAuthor', label: 'Shared Author', hint: 'Per matching author with the loved book', min: 0, max: 100 },
  { key: 'sharedTag', label: 'Shared Topic Tag', hint: 'Per specific non-generic shared tag', min: 0, max: 100 },
  { key: 'sharedTagMaxCount', label: 'Max Shared Tags Counted', hint: 'Cap on how many overlapping tags count', min: 1, max: 8 },
  { key: 'sameStage', label: 'Same Reading Stage', hint: 'Matches anchor book reading stage', min: 0, max: 60 },
  { key: 'ageOverlap', label: 'Age Span Overlap', hint: 'Book ages overlap anchor book ages', min: 0, max: 60 },
  { key: 'unreadBonus', label: 'Unread Bonus', hint: 'Prefers unread similar titles', min: 0, max: 60 },
  { key: 'offCooldownBonus', label: 'Off Cooldown Bonus', hint: 'Book is rested and ready for display', min: 0, max: 60 },
  { key: 'cooldownPenalty', label: 'Cooldown Penalty', hint: 'Negative offset if recently rotated', min: -120, max: 0 },
  { key: 'diversityPenalty', label: 'Row Author Diversity Penalty', hint: 'Applied after 2 books by same author in row', min: -60, max: 0 },
];

const ROTATION_WEIGHT_FIELDS: WeightFieldMeta<keyof RotationScoringWeights>[] = [
  { key: 'base', label: 'Base Eligibility Score', hint: 'Starting baseline for rotatable books', min: 0, max: 100 },
  { key: 'exactAge', label: 'Exact Age Fit', hint: 'Reader age falls inside book ageMin–ageMax', min: 0, max: 100 },
  { key: 'nearAge', label: 'Near Age (+/- 1 yr)', hint: 'Within 1 year of book age range', min: 0, max: 100 },
  { key: 'outOfAgePenalty', label: 'Out of Age Penalty', hint: 'Penalty when book is too young or advanced', min: -100, max: 0 },
  { key: 'readingStage', label: 'Reading Stage Match', hint: 'Matches reader profile reading stage', min: 0, max: 100 },
  { key: 'preferredTagPerMatch', label: 'Shelf / Profile Tag Match', hint: 'Per matching topic or shelf rule tag', min: 0, max: 50 },
  { key: 'preferredTagMax', label: 'Tag Match Cap', hint: 'Maximum points summed from tag matches', min: 0, max: 150 },
  { key: 'objectiveFormatMatch', label: 'Objective Format Match', hint: 'Matches binding requested in objective text', min: 0, max: 100 },
  { key: 'objectiveFormatMismatch', label: 'Objective Format Mismatch', hint: 'Penalty when objective specifies another binding', min: -100, max: 0 },
  { key: 'objectiveStageMatch', label: 'Objective Stage Match', hint: 'Matches stage keyword in objective text', min: 0, max: 60 },
  { key: 'objectiveKeywordPerHit', label: 'Objective Keyword Hit', hint: 'Per keyword match in title, tags, or author', min: 0, max: 50 },
  { key: 'objectiveKeywordMax', label: 'Objective Keyword Cap', hint: 'Maximum bonus from objective keywords', min: 0, max: 150 },
  { key: 'offCooldownBonus', label: 'Off Cooldown Bonus', hint: 'Boost for books rested past cooldownDays', min: 0, max: 60 },
  { key: 'neverRotatedBonus', label: 'Never Rotated Bonus', hint: 'Surfaces unrotated books first', min: 0, max: 60 },
  { key: 'cooldownPenalty', label: 'Cooldown Penalty', hint: 'Strong offset for recently rotated books', min: -150, max: 0 },
  { key: 'unreadBonus', label: 'Unread Bonus', hint: 'Novelty boost for unread titles', min: 0, max: 60 },
  { key: 'lovedBonus', label: 'Loved Favorite Bonus', hint: 'Boost for hearted family favorites', min: 0, max: 60 },
  { key: 'repeatedAuthorPenalty', label: 'Repeated Author Variety Penalty', hint: 'Greedy diversity offset per author already picked', min: -100, max: 0 },
  { key: 'repeatedTagPenalty', label: 'Repeated Primary Tag Penalty', hint: 'Greedy diversity offset per primary topic repeated', min: -80, max: 0 },
];

export const MatchingRulesSubView: React.FC<MatchingRulesSubViewProps> = ({
  onBack,
  backLabel,
}) => {
  const { state, store, activeProfile, activeRotation } = useApp();
  const [activeTab, setActiveTab] = useState<MatchingTab>('weights');

  // Normalized current settings
  const matchingWeights = useMemo(
    () => normalizeMatchingWeights(state.settings?.matchingWeights),
    [state.settings?.matchingWeights]
  );
  const taggingRules = useMemo(
    () => normalizeTaggingRulesConfig(state.settings?.taggingRules),
    [state.settings?.taggingRules]
  );

  // Preview inspector state (Tab 1)
  const [previewMode, setPreviewMode] = useState<PreviewEngineMode>('profile');
  const [previewProfileId, setPreviewProfileId] = useState<string>(
    () => activeProfile?.id || state.profiles[0]?.id || ''
  );
  const [previewAnchorBookId, setPreviewAnchorBookId] = useState<string>(() => {
    const owned = state.books.filter(isBookOwnedAndRotatable);
    const loved = owned.find((b) => b.loved);
    return loved?.id || owned[0]?.id || state.books[0]?.id || '';
  });
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null);

  // Rule editor state (Tab 2)
  const [ruleSearch, setRuleSearch] = useState('');
  const [expandedRuleTag, setExpandedRuleTag] = useState<string | null>(null);
  const [extraKwDraftByTag, setExtraKwDraftByTag] = useState<Record<string, string>>({});
  const [customTagInput, setCustomTagInput] = useState('');
  const [customKeywordsInput, setCustomKeywordsInput] = useState('');
  const [noiseWordInput, setNoiseWordInput] = useState('');
  const [isRetagging, setIsRetagging] = useState(false);

  // Live Rule Tester state (Tab 2)
  const [testerMode, setTesterMode] = useState<'book' | 'text'>(() =>
    state.books.length > 0 ? 'book' : 'text'
  );
  const [testerBookId, setTesterBookId] = useState<string>(() => state.books[0]?.id || '');
  const [testerCustomTitle, setTesterCustomTitle] = useState(
    'The Little Blue Truck Goes to Bedtime Farm'
  );
  const [testerCustomSummary, setTesterCustomSummary] = useState(
    'A gentle goodnight rhyming story about friendship, tractors, cows, and sleepy farm animals.'
  );

  const builtInCatalog = useMemo(
    () => getBuiltInTaxonomyRuleCatalog(taggingRules),
    [taggingRules]
  );

  const filteredBuiltInCatalog = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    if (!q) return builtInCatalog;
    return builtInCatalog.filter(
      (entry) =>
        entry.tag.includes(q) ||
        entry.defaultKeywords.some((kw) => kw.includes(q)) ||
        entry.extraKeywords.some((kw) => kw.includes(q))
    );
  }, [builtInCatalog, ruleSearch]);

  const previewProfile = useMemo(
    () => state.profiles.find((p) => p.id === previewProfileId) || activeProfile || state.profiles[0] || null,
    [state.profiles, previewProfileId, activeProfile]
  );

  const ownedBooks = useMemo(
    () => state.books.filter((b) => isBookOwnedAndRotatable(b)),
    [state.books]
  );

  const previewAnchorBook = useMemo(
    () => state.books.find((b) => b.id === previewAnchorBookId) || ownedBooks[0] || null,
    [state.books, previewAnchorBookId, ownedBooks]
  );

  const previewResults = useMemo(() => {
    if (!previewProfile || state.books.length === 0) return [];
    if (previewMode === 'profile') {
      return getProfileRecommendations({
        books: state.books,
        profile: previewProfile,
        rotations: state.rotations,
        weights: matchingWeights,
        limit: 5,
      }).map((item) => ({
        book: item.book,
        score: item.score,
        summary: item.matchReasons[0] || 'Eligible pick',
        breakdown: item.scoreBreakdown || [],
      }));
    }
    if (previewMode === 'similarity') {
      if (!previewAnchorBook) return [];
      return scoreSimilarBooksForAnchor({
        anchorBook: previewAnchorBook,
        candidatePool: ownedBooks,
        profile: previewProfile,
        weights: matchingWeights,
      })
        .slice(0, 5)
        .map((item) => ({
          book: item.book,
          score: item.score,
          summary: item.matchReasons[0] || 'Similar book',
          breakdown: item.scoreBreakdown || [],
        }));
    }
    const rules = activeRotation?.rules || {
      count: previewProfile.defaultRotationSize || 4,
      cooldownDays: previewProfile.cooldownDays || 14,
      preferredTags: previewProfile.favoriteTopics || [],
      requiredFormat: 'any' as const,
      varietyMix: true,
      objective: '',
    };
    return scoreEligibleBooks({
      books: ownedBooks,
      profile: previewProfile,
      rules,
      rotations: state.rotations,
      weights: matchingWeights,
    })
      .sort((a, b) => b.baseScore - a.baseScore)
      .slice(0, 5)
      .map((item) => ({
        book: item.book,
        score: item.baseScore,
        summary: item.matchedReasons[0] || (item.inCooldown ? 'In cooldown' : 'Eligible'),
        breakdown: item.matchedReasons.map((reason) => ({ label: reason, points: 0 })),
      }));
  }, [
    previewMode,
    previewProfile,
    previewAnchorBook,
    ownedBooks,
    state.books,
    state.rotations,
    activeRotation,
    matchingWeights,
  ]);

  const testerExplanation = useMemo(() => {
    if (testerMode === 'book') {
      const selected = state.books.find((b) => b.id === testerBookId) || state.books[0];
      if (!selected) return null;
      return explainLocalTagMatches(
        {
          title: selected.title,
          authors: selected.authors,
          summary: [selected.description || '', selected.notes || ''].filter(Boolean).join(' '),
          format: selected.format,
          pageCount: selected.pageCount,
          language: selected.language,
        },
        taggingRules
      );
    }
    return explainLocalTagMatches(
      {
        title: testerCustomTitle,
        summary: testerCustomSummary,
      },
      taggingRules
    );
  }, [testerMode, testerBookId, state.books, testerCustomTitle, testerCustomSummary, taggingRules]);

  const isGroupModified = <G extends keyof MatchingWeightsConfig>(group: G): boolean => {
    const current = matchingWeights[group];
    const defaults = DEFAULT_MATCHING_WEIGHTS[group];
    return (Object.keys(defaults) as Array<keyof typeof defaults>).some(
      (k) => current[k] !== defaults[k]
    );
  };

  const hasAnyModifiedWeights =
    isGroupModified('profile') || isGroupModified('similarity') || isGroupModified('rotation');

  const hasCustomizedRules =
    taggingRules.disabledBuiltInTags.length > 0 ||
    Object.keys(taggingRules.extraKeywordsByTag).length > 0 ||
    taggingRules.customRules.length > 0 ||
    taggingRules.extraNoiseWords.length > 0;

  const updateWeight = <
    G extends keyof MatchingWeightsConfig,
    K extends keyof MatchingWeightsConfig[G],
  >(
    group: G,
    key: K,
    nextVal: number,
    min: number,
    max: number
  ) => {
    const clamped = Math.max(min, Math.min(max, Math.round(nextVal)));
    const nextConfig = normalizeMatchingWeights({
      ...matchingWeights,
      [group]: {
        ...matchingWeights[group],
        [key]: clamped,
      },
    });
    void store.updateSettings({ matchingWeights: nextConfig });
  };

  const resetWeightGroup = async (group: keyof MatchingWeightsConfig) => {
    const defaults = createDefaultMatchingWeights();
    await store.updateSettings({
      matchingWeights: {
        ...matchingWeights,
        [group]: { ...defaults[group] },
      },
    });
    store.notify(`Reset ${group} scoring weights to defaults.`, 'info');
  };

  const resetAllWeights = async () => {
    await store.updateSettings({ matchingWeights: createDefaultMatchingWeights() });
    store.notify('All matching & similarity weights reset to defaults.', 'info');
  };

  const saveTaggingRules = async (nextRaw: TaggingRulesConfig) => {
    const normalized = normalizeTaggingRulesConfig(nextRaw);
    await store.updateSettings({ taggingRules: normalized });
  };

  const handleToggleBuiltInRule = (tag: string, currentlyEnabled: boolean) => {
    const disabledSet = new Set(taggingRules.disabledBuiltInTags);
    if (currentlyEnabled) {
      disabledSet.add(tag);
    } else {
      disabledSet.delete(tag);
    }
    void saveTaggingRules({
      ...taggingRules,
      disabledBuiltInTags: Array.from(disabledSet),
    });
  };

  const handleAddExtraKeywords = (tag: string) => {
    const raw = (extraKwDraftByTag[tag] || '').trim();
    if (!raw) return;
    const incoming = raw
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (incoming.length === 0) return;

    const existing = taggingRules.extraKeywordsByTag[tag] || [];
    const merged = Array.from(new Set([...existing, ...incoming]));
    setExtraKwDraftByTag((prev) => ({ ...prev, [tag]: '' }));
    void saveTaggingRules({
      ...taggingRules,
      extraKeywordsByTag: {
        ...taggingRules.extraKeywordsByTag,
        [tag]: merged,
      },
    });
  };

  const handleRemoveExtraKeyword = (tag: string, keyword: string) => {
    const existing = taggingRules.extraKeywordsByTag[tag] || [];
    const nextList = existing.filter((k) => k !== keyword);
    const nextMap = { ...taggingRules.extraKeywordsByTag };
    if (nextList.length === 0) {
      delete nextMap[tag];
    } else {
      nextMap[tag] = nextList;
    }
    void saveTaggingRules({
      ...taggingRules,
      extraKeywordsByTag: nextMap,
    });
  };

  const handleAddCustomRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const keywords = customKeywordsInput
      .split(/[,\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const normalized = normalizeTaggingRulesConfig({
      ...taggingRules,
      customRules: [
        ...taggingRules.customRules.filter(
          (r) =>
            r.tag !==
            customTagInput
              .trim()
              .toLowerCase()
              .replace(/\s+/g, '-')
        ),
        { tag: customTagInput, keywords },
      ],
    });
    if (normalized.customRules.length === taggingRules.customRules.length && !taggingRules.customRules.some((r) => r.tag === customTagInput.trim().toLowerCase())) {
      // Check if valid tag/keywords produced a custom rule
      const testSingle = normalizeTaggingRulesConfig({ customRules: [{ tag: customTagInput, keywords }] });
      if (testSingle.customRules.length === 0) {
        store.notify('Enter a short tag name and at least one keyword.', 'error');
        return;
      }
    }
    await store.updateSettings({ taggingRules: normalized });
    setCustomTagInput('');
    setCustomKeywordsInput('');
    store.notify('Saved custom tag rule.', 'success');
  };

  const handleEditCustomRule = (rule: CustomTagRule) => {
    setCustomTagInput(rule.tag);
    setCustomKeywordsInput(rule.keywords.join(', '));
  };

  const handleDeleteCustomRule = (tag: string) => {
    void saveTaggingRules({
      ...taggingRules,
      customRules: taggingRules.customRules.filter((r) => r.tag !== tag),
    });
  };

  const handleAddNoiseWord = (e: React.FormEvent) => {
    e.preventDefault();
    const incoming = noiseWordInput
      .split(/[,\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    if (incoming.length === 0) return;
    setNoiseWordInput('');
    void saveTaggingRules({
      ...taggingRules,
      extraNoiseWords: [...taggingRules.extraNoiseWords, ...incoming],
    });
  };

  const handleRemoveNoiseWord = (word: string) => {
    void saveTaggingRules({
      ...taggingRules,
      extraNoiseWords: taggingRules.extraNoiseWords.filter((w) => w !== word),
    });
  };

  const handleResetAllRules = async () => {
    await store.updateSettings({ taggingRules: createDefaultTaggingRulesConfig() });
    store.notify('Restored default built-in tagging rules.', 'info');
  };

  const handleRetagLibrary = async () => {
    setIsRetagging(true);
    try {
      await store.enrichAllCatalogBooks();
    } finally {
      setIsRetagging(false);
    }
  };

  const renderWeightGroup = <G extends keyof MatchingWeightsConfig>(
    group: G,
    title: string,
    description: string,
    fields: Array<WeightFieldMeta<Extract<keyof MatchingWeightsConfig[G], string>>>
  ) => {
    const modified = isGroupModified(group);
    const values = matchingWeights[group] as Record<string, number>;
    const defaults = DEFAULT_MATCHING_WEIGHTS[group] as Record<string, number>;

    return (
      <section
        key={group}
        data-weight-group={group}
        className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-edge-subtle">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
              {title}
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5">{description}</p>
          </div>
          {modified && (
            <button
              type="button"
              onClick={() => void resetWeightGroup(group)}
              className="min-h-[36px] px-2.5 py-1 rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-xs font-semibold text-ink-secondary hover:text-ink transition-colors cursor-pointer shrink-0"
            >
              Reset group
            </button>
          )}
        </div>

        <div className="divide-y divide-edge-subtle">
          {fields.map((field) => {
            const val = values[field.key] ?? defaults[field.key];
            const def = defaults[field.key];
            const changed = val !== def;
            const step = field.step ?? 1;

            return (
              <div
                key={field.key}
                className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-ink">
                      {field.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono-tabular ${
                        changed ? 'text-primary font-semibold' : 'text-ink-muted'
                      }`}
                    >
                      Default: {def > 0 ? `+${def}` : def}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-secondary mt-0.5">{field.hint}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    aria-label={`Decrease ${field.label}`}
                    onClick={() =>
                      updateWeight(
                        group,
                        field.key as keyof MatchingWeightsConfig[G],
                        val - step,
                        field.min,
                        field.max
                      )
                    }
                    disabled={val <= field.min}
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated disabled:opacity-40 flex items-center justify-center text-sm font-bold text-ink transition-colors cursor-pointer"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    aria-label={field.label}
                    min={field.min}
                    max={field.max}
                    step={step}
                    value={val}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      if (Number.isFinite(parsed)) {
                        updateWeight(
                          group,
                          field.key as keyof MatchingWeightsConfig[G],
                          parsed,
                          field.min,
                          field.max
                        );
                      }
                    }}
                    className="w-16 min-h-[44px] px-2 rounded-lg border border-edge bg-surface-subtle text-center text-sm font-semibold font-mono-tabular text-ink focus:outline-2 focus:outline-primary"
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${field.label}`}
                    onClick={() =>
                      updateWeight(
                        group,
                        field.key as keyof MatchingWeightsConfig[G],
                        val + step,
                        field.min,
                        field.max
                      )
                    }
                    disabled={val >= field.max}
                    className="min-h-[44px] min-w-[44px] rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated disabled:opacity-40 flex items-center justify-center text-sm font-bold text-ink transition-colors cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <>
      <SettingsSubViewHeader
        title="Matching Rules & Weights"
        subtitle="Inspect and tune how local keyword rules tag books and how Home shelves & rotations rank matches."
        backLabel={backLabel}
        onBack={onBack}
      />

      {/* Subsection Switcher */}
      <div
        role="tablist"
        aria-label="Matching rules and weights sections"
        className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-edge shadow-2xs"
      >
        {[
          { id: 'weights' as const, label: 'Scoring Weights', icon: 'sliders' },
          { id: 'rules' as const, label: 'Tag Rules', icon: 'tag' },
        ].map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-matching-tab={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-h-[44px] px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                selected
                  ? 'bg-primary text-primary-fg shadow-xs'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-subtle'
              }`}
            >
              <Icon name={tab.icon} className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SCORING WEIGHTS */}
      {activeTab === 'weights' && (
        <div className="space-y-4">
          {/* Live Score Preview Inspector */}
          <section
            data-score-preview="true"
            className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                  Live Score Preview
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  See how your current weights rank books in real time and expand any title for a point breakdown.
                </p>
              </div>
              {hasAnyModifiedWeights && (
                <button
                  type="button"
                  onClick={() => void resetAllWeights()}
                  className="min-h-[44px] px-3 py-1.5 rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-xs font-semibold text-ink transition-colors cursor-pointer"
                >
                  Reset All Defaults
                </button>
              )}
            </div>

            {/* Preview Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                {(
                  [
                    { id: 'profile' as const, label: 'Reader' },
                    { id: 'similarity' as const, label: 'Similar' },
                    { id: 'rotation' as const, label: 'Rotation' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPreviewMode(m.id)}
                    aria-pressed={previewMode === m.id}
                    className={`flex-1 min-h-[38px] px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      previewMode === m.id
                        ? 'bg-primary text-primary-fg shadow-xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {previewMode === 'similarity' ? (
                <select
                  aria-label="Select anchor book for similarity preview"
                  value={previewAnchorBook?.id || ''}
                  onChange={(e) => setPreviewAnchorBookId(e.target.value)}
                  className="min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs font-medium text-ink focus:outline-2 focus:outline-primary"
                >
                  {ownedBooks.length === 0 ? (
                    <option value="">No owned books yet</option>
                  ) : (
                    ownedBooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.loved ? '♥ ' : ''}
                        {b.title}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                <select
                  aria-label="Select reader profile for score preview"
                  value={previewProfile?.id || ''}
                  onChange={(e) => setPreviewProfileId(e.target.value)}
                  className="min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs font-medium text-ink focus:outline-2 focus:outline-primary"
                >
                  {state.profiles.length === 0 ? (
                    <option value="">No reader profiles</option>
                  ) : (
                    state.profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Age {p.age})
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {previewResults.length === 0 ? (
              <p className="text-xs text-ink-muted py-2">
                Add a few owned books and a reader profile to preview live ranking scores.
              </p>
            ) : (
              <div className="divide-y divide-edge-subtle border-t border-edge-subtle">
                {previewResults.map((entry, idx) => {
                  const isOpen = expandedBreakdownId === entry.book.id;
                  return (
                    <div key={entry.book.id} className="py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBreakdownId((prev) =>
                            prev === entry.book.id ? null : entry.book.id
                          )
                        }
                        aria-expanded={isOpen}
                        className="w-full min-h-[44px] flex items-center justify-between gap-3 text-left cursor-pointer rounded-lg hover:bg-surface-subtle/60 px-1.5 -mx-1.5 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-mono-tabular font-semibold text-ink-muted w-4 shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-ink truncate">
                              {entry.book.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-ink-secondary truncate pl-6 mt-0.5">
                            {entry.summary}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs sm:text-sm font-bold font-mono-tabular text-primary">
                            {entry.score} pts
                          </span>
                          <Icon
                            name="chevronDown"
                            className={`w-4 h-4 text-ink-muted transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {isOpen && entry.breakdown.length > 0 && (
                        <div className="mt-1.5 ml-6 pl-3 border-l border-edge space-y-1 text-[11px]">
                          {entry.breakdown.map((factor, fIdx) => (
                            <div
                              key={fIdx}
                              className="flex items-center justify-between gap-2 text-ink-secondary"
                            >
                              <span>{factor.label}</span>
                              {factor.points !== 0 && (
                                <span
                                  className={`font-mono-tabular font-semibold ${
                                    factor.points > 0 ? 'text-success' : 'text-danger'
                                  }`}
                                >
                                  {factor.points > 0 ? `+${factor.points}` : factor.points}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {renderWeightGroup(
            'profile',
            'Suggested for Reader Weights',
            'Controls the personalized "Suggested for [Reader]" Home shelf.',
            PROFILE_WEIGHT_FIELDS
          )}

          {renderWeightGroup(
            'similarity',
            'Book Similarity Weights ("Because You Loved...")',
            'Controls how anchor books match sibling titles by author, shared topics, and reading stage.',
            SIMILARITY_WEIGHT_FIELDS
          )}

          {renderWeightGroup(
            'rotation',
            'Rotation Shelf Builder Weights',
            'Controls automatic rotation selection, swap replacements, and "Add to Active Rotation" suggestions.',
            ROTATION_WEIGHT_FIELDS
          )}
        </div>
      )}

      {/* TAB 2: TAG MATCHING RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-4">
          {/* Action Strip */}
          <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                Local Rule Engine ({builtInCatalog.length} Built-in + {taggingRules.customRules.length} Custom)
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Rules run offline for free. Re-tag your library after adding custom rules or ignored words.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {hasCustomizedRules && (
                <button
                  type="button"
                  onClick={() => void handleResetAllRules()}
                  className="min-h-[44px] px-3 py-2 rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-xs font-semibold text-ink transition-colors cursor-pointer"
                >
                  Reset Rules
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleRetagLibrary()}
                disabled={isRetagging}
                data-action="retag-library-from-rules"
                className="min-h-[44px] px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Icon name="refresh" className={`w-3.5 h-3.5 ${isRetagging ? 'animate-spin' : ''}`} />
                <span>{isRetagging ? 'Re-tagging…' : 'Re-Tag Library'}</span>
              </button>
            </div>
          </section>

          {/* Live Rule Tester */}
          <section
            data-rule-tester="true"
            className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                  Test Rules Live
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Inspect exactly which keywords trigger tags on a library book or custom text.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-subtle border border-edge">
                {[
                  { id: 'book' as const, label: 'Library Book' },
                  { id: 'text' as const, label: 'Custom Text' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTesterMode(opt.id)}
                    aria-pressed={testerMode === opt.id}
                    className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      testerMode === opt.id
                        ? 'bg-primary text-primary-fg shadow-xs'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {testerMode === 'book' ? (
              <select
                aria-label="Pick a book to test tag matching rules"
                value={testerBookId}
                onChange={(e) => setTesterBookId(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm font-medium text-ink focus:outline-2 focus:outline-primary"
              >
                {state.books.length === 0 ? (
                  <option value="">No books in catalog yet</option>
                ) : (
                  state.books.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title} ({b.authors[0] || 'Unknown'})
                    </option>
                  ))
                )}
              </select>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={testerCustomTitle}
                  onChange={(e) => setTesterCustomTitle(e.target.value)}
                  placeholder="Sample book title…"
                  className="w-full min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm text-ink focus:outline-2 focus:outline-primary"
                />
                <textarea
                  rows={2}
                  value={testerCustomSummary}
                  onChange={(e) => setTesterCustomSummary(e.target.value)}
                  placeholder="Sample description, notes, or subjects…"
                  className="w-full px-3 py-2 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm text-ink focus:outline-2 focus:outline-primary"
                />
              </div>
            )}

            {testerExplanation && (
              <div className="pt-2 border-t border-edge-subtle space-y-2.5 text-xs">
                <div>
                  <p className="font-semibold text-ink-secondary">
                    Triggered Rules ({testerExplanation.ruleHits.length})
                  </p>
                  {testerExplanation.ruleHits.length === 0 ? (
                    <p className="text-ink-muted mt-1">
                      No keyword rules matched this text sample.
                    </p>
                  ) : (
                    <div className="mt-1.5 divide-y divide-edge-subtle">
                      {testerExplanation.ruleHits.map((hit) => (
                        <div
                          key={`${hit.source}-${hit.tag}`}
                          className="py-1.5 flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold ${
                                hit.enabled ? 'text-primary' : 'text-ink-muted line-through'
                              }`}
                            >
                              #{hit.tag}
                            </span>
                            <span className="text-[11px] text-ink-muted">
                              {hit.source === 'custom' ? 'Custom' : 'Built-in'}
                              {!hit.enabled ? ' · Disabled' : ''}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-ink-secondary">
                            matched: {hit.matchedTerms.join(', ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1.5 border-t border-edge-subtle/70">
                  <p className="text-ink">
                    <span className="font-semibold text-ink-secondary">Output tags: </span>
                    <span className="font-mono text-primary">
                      {testerExplanation.tags.join(', ') || 'none'}
                    </span>
                  </p>
                  <p className="text-[11px] text-ink-muted font-mono-tabular">
                    Ages {testerExplanation.ageMin}–{testerExplanation.ageMax} · {testerExplanation.readingStage}
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Custom Tag Rules */}
          <section
            data-custom-rules="true"
            className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
          >
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                Custom Tag Rules
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Create your own topic tag that triggers whenever any of its comma-separated keywords appear.
              </p>
            </div>

            <form onSubmit={handleAddCustomRule} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                placeholder="Tag slug (e.g. rainy-day)"
                aria-label="Custom rule tag name"
                className="sm:col-span-4 min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm text-ink focus:outline-2 focus:outline-primary"
              />
              <input
                type="text"
                value={customKeywordsInput}
                onChange={(e) => setCustomKeywordsInput(e.target.value)}
                placeholder="Keywords: puddle, umbrella, raincoat"
                aria-label="Custom rule keywords"
                className="sm:col-span-6 min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm text-ink focus:outline-2 focus:outline-primary"
              />
              <button
                type="submit"
                className="sm:col-span-2 min-h-[44px] px-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs font-semibold transition-colors cursor-pointer"
              >
                Save Rule
              </button>
            </form>

            {taggingRules.customRules.length > 0 && (
              <div className="divide-y divide-edge-subtle border-t border-edge-subtle">
                {taggingRules.customRules.map((rule) => (
                  <div
                    key={rule.tag}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-primary">#{rule.tag}</p>
                      <p className="text-[11px] text-ink-secondary truncate mt-0.5">
                        Keywords: {rule.keywords.join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditCustomRule(rule)}
                        className="min-h-[44px] px-2.5 rounded-lg text-xs font-semibold text-ink-secondary hover:text-ink hover:bg-surface-subtle transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete custom rule ${rule.tag}`}
                        onClick={() => handleDeleteCustomRule(rule.tag)}
                        className="min-h-[44px] min-w-[44px] rounded-lg text-danger hover:bg-danger/10 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Built-in Taxonomy Rules */}
          <section
            data-builtin-rules="true"
            className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                  Built-in Taxonomy Rules ({builtInCatalog.length})
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Toggle rules on/off or add extra multilingual/nickname keywords to match your household books.
                </p>
              </div>
              <input
                type="search"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Filter tags or keywords…"
                aria-label="Filter built-in tagging rules"
                className="w-full sm:w-56 min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs text-ink focus:outline-2 focus:outline-primary"
              />
            </div>

            <div className="divide-y divide-edge-subtle border-t border-edge-subtle">
              {filteredBuiltInCatalog.map((rule) => {
                const isExpanded = expandedRuleTag === rule.tag;
                const draftKw = extraKwDraftByTag[rule.tag] || '';
                return (
                  <div key={rule.tag} className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRuleTag((prev) => (prev === rule.tag ? null : rule.tag))
                        }
                        aria-expanded={isExpanded}
                        className="min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs sm:text-sm font-semibold ${
                              rule.enabled ? 'text-ink' : 'text-ink-muted line-through'
                            }`}
                          >
                            #{rule.tag}
                          </span>
                          {rule.extraKeywords.length > 0 && (
                            <span className="text-[11px] font-semibold text-primary font-mono-tabular">
                              +{rule.extraKeywords.length} custom
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-secondary truncate mt-0.5">
                          {rule.defaultKeywords.slice(0, 8).join(', ')}
                          {rule.defaultKeywords.length > 8
                            ? ` (+${rule.defaultKeywords.length - 8} more)`
                            : ''}
                        </p>
                      </button>

                      <ToggleSwitch
                        checked={rule.enabled}
                        onChange={() => handleToggleBuiltInRule(rule.tag, rule.enabled)}
                        ariaLabel={`Toggle ${rule.tag} tagging rule`}
                      />
                    </div>

                    {isExpanded && (
                      <div className="pl-2 space-y-2.5 pt-1">
                        <p className="text-[11px] text-ink-secondary leading-relaxed">
                          <span className="font-semibold text-ink">Built-in keywords: </span>
                          {rule.defaultKeywords.join(', ')}
                        </p>

                        {rule.extraKeywords.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-ink">Extra:</span>
                            {rule.extraKeywords.map((kw) => (
                              <button
                                key={kw}
                                type="button"
                                onClick={() => handleRemoveExtraKeyword(rule.tag, kw)}
                                title={`Remove "${kw}"`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/12 text-primary text-[11px] font-medium hover:bg-danger/12 hover:text-danger transition-colors cursor-pointer"
                              >
                                <span>{kw}</span>
                                <Icon name="close" className="w-3 h-3" />
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={draftKw}
                            onChange={(e) =>
                              setExtraKwDraftByTag((prev) => ({
                                ...prev,
                                [rule.tag]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddExtraKeywords(rule.tag);
                              }
                            }}
                            placeholder={`Add extra keywords for #${rule.tag}…`}
                            aria-label={`Add extra keywords for ${rule.tag}`}
                            className="flex-1 min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs text-ink focus:outline-2 focus:outline-primary"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddExtraKeywords(rule.tag)}
                            className="min-h-[44px] px-3.5 rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-xs font-semibold text-ink transition-colors cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Extra Ignored / Noise Words */}
          <section className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3">
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-ink">
                Extra Ignored Words
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Tags or publisher noise terms listed here are stripped during tagging and re-tagging.
              </p>
            </div>

            <form onSubmit={handleAddNoiseWord} className="flex items-center gap-2">
              <input
                type="text"
                value={noiseWordInput}
                onChange={(e) => setNoiseWordInput(e.target.value)}
                placeholder="e.g. scholastic, penguin-random-house"
                aria-label="Add extra ignored tag word"
                className="flex-1 min-h-[44px] px-3 rounded-lg border border-edge bg-surface-subtle text-xs sm:text-sm text-ink focus:outline-2 focus:outline-primary"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 rounded-lg border border-edge bg-surface-subtle hover:bg-surface-elevated text-xs font-semibold text-ink transition-colors cursor-pointer"
              >
                Ignore Word
              </button>
            </form>

            {taggingRules.extraNoiseWords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {taggingRules.extraNoiseWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => handleRemoveNoiseWord(word)}
                    title={`Stop ignoring "${word}"`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-surface-subtle border border-edge text-xs font-medium text-ink hover:border-danger hover:text-danger transition-colors cursor-pointer"
                  >
                    <span>{word}</span>
                    <Icon name="close" className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
};
