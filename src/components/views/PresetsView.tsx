import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext.js';
import { PresetCard } from '../cards/PresetCard.js';
import { Icon } from '../common/Icon.js';
import { ClearableInput } from '../common/ClearableInput.js';
import { getAllRotationPresets } from '../../features/rotations/rotation-presets.js';
import type { RotationPreset } from '../../types/models.js';

export const PresetsView: React.FC = () => {
  const { state, store, activeProfile, navigate } = useApp();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allPresets = useMemo(() => {
    return getAllRotationPresets(state);
  }, [state]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const p of allPresets) {
      if (p.category) cats.add(p.category);
    }
    return ['all', ...Array.from(cats)];
  }, [allPresets]);

  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allPresets.filter((preset) => {
      if (selectedCategory !== 'all' && preset.category !== selectedCategory) {
        return false;
      }

      if (!q) return true;
      const haystack = `${preset.title} ${preset.description} ${preset.category} ${(
        preset.preferredTags || []
      ).join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allPresets, selectedCategory, searchQuery]);

  const handleApplyPreset = async (preset: RotationPreset) => {
    if (!activeProfile) return;

    try {
      await store.generateRotationFromPreset(preset.id, {
        profileId: activeProfile.id,
      });
      navigate('rotations');
    } catch (err) {
      store.notify(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="space-y-6 text-left max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={() => navigate('rotations')}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-white flex items-center gap-1"
            >
              <span>← Rotations</span>
            </button>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-forest-900 dark:text-white">
            Curated Collection Presets
          </h1>
          <p className="text-xs text-stone-ink dark:text-slate-400 mt-0.5">
            Turnkey thematic and developmental book collections ready to generate shelves in one tap.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <ClearableInput
          id="presets-search-input"
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search presets by theme, tag, or objective…"
          className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-night-900 border border-linen-200 dark:border-night-700 text-sm focus:outline-none focus:ring-1 focus:ring-forest-700 shadow-2xs"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors ${
                selectedCategory === cat
                  ? 'bg-forest-900 text-white dark:bg-[#5ED3DA] dark:text-night-950 shadow-2xs'
                  : 'bg-linen-100 hover:bg-linen-200 dark:bg-night-800 dark:hover:bg-night-700 text-stone-700 dark:text-slate-300'
              }`}
            >
              {cat === 'all' ? 'All Collections' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onApply={handleApplyPreset}
          />
        ))}
      </div>
    </div>
  );
};
