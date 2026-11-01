/**
 * @fileoverview Declarative configuration of pre-configured Rotation Collection Defaults.
 *
 * IMPORTANT: Presets define rotation rules ONLY (title, description/objective, category,
 * topic preferences, book count, swap cycle, cooldown window, binding preference,
 * deterministic PRNG seed, and optional annual `MM-DD` suggested start date)—never hardcoded books.
 * When applied, the Rotation Engine automatically selects matching books from the user's library.
 */

/** @type {readonly import('../types/models.js').RotationPreset[]} */
export const DEFAULT_ROTATION_PRESETS = Object.freeze([
  // ============================================================================
  // Broad & Common — Seasonal & Holiday Traditions (with annual MM-DD start dates)
  // ============================================================================
  {
    id: 'preset-winter-solstice-snow',
    title: 'Deep Winter & Snowy Landscapes',
    description:
      'Quiet snowy landscapes, hibernation, mittens, sledding adventures, and warm fireside reads for crisp winter days.',
    category: 'seasonal-holidays',
    preferredTags: ['winter', 'nature', 'animals', 'bedtime'],
    count: 5,
    swapDays: 21,
    cooldownDays: 30,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-winter-solstice-snow-v1',
    suggestedStartMonthDay: '01-05',
  },
  {
    id: 'preset-valentines-kindness',
    title: 'Valentine’s, Kindness & Friendship',
    description:
      'Heartwarming stories celebrating friendship, empathy, family love, sharing, and caring notes.',
    category: 'seasonal-holidays',
    preferredTags: ['valentines', 'friendship', 'family', 'feelings'],
    count: 5,
    swapDays: 14,
    cooldownDays: 30,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-valentines-kindness-v1',
    suggestedStartMonthDay: '02-01',
  },
  {
    id: 'preset-spring-blossoms',
    title: 'Spring Blossoms, Gardens & New Life',
    description:
      'Sprouting seeds, puddles and raindrops, caterpillars, baby animals hatching, and outdoor garden exploration.',
    category: 'seasonal-holidays',
    preferredTags: ['spring', 'nature', 'insects', 'animals'],
    count: 6,
    swapDays: 21,
    cooldownDays: 21,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-spring-blossoms-v1',
    suggestedStartMonthDay: '03-20',
  },
  {
    id: 'preset-spring-holidays',
    title: 'Spring Holidays & Woodland Gatherings',
    description:
      'Festive springtime traditions, Easter and Passover celebrations, woodland rabbits, and joyful family feasts.',
    category: 'seasonal-holidays',
    preferredTags: ['holidays', 'spring', 'animals', 'family'],
    count: 5,
    swapDays: 14,
    cooldownDays: 30,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-spring-holidays-v1',
    suggestedStartMonthDay: '04-01',
  },
  {
    id: 'preset-summer-sunshine-ocean',
    title: 'Summer Sunshine, Ocean & Camping',
    description:
      'Beach tides, marine creatures, backyard fireflies, family camping trips, and sunny outdoor adventures.',
    category: 'seasonal-holidays',
    preferredTags: ['summer', 'ocean', 'adventure', 'nature'],
    count: 6,
    swapDays: 21,
    cooldownDays: 21,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-summer-sunshine-ocean-v1',
    suggestedStartMonthDay: '06-20',
  },
  {
    id: 'preset-autumn-harvest',
    title: 'Autumn & Harvest',
    description:
      'Stories celebrating fall leaves, pumpkins, crisp weather, woodland animals gathering food, and cozy sweater weather.',
    category: 'seasonal-holidays',
    preferredTags: ['autumn', 'nature', 'animals', 'food'],
    count: 6,
    swapDays: 21,
    cooldownDays: 21,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-autumn-harvest-v1',
    suggestedStartMonthDay: '09-22',
  },
  {
    id: 'preset-halloween-spooky',
    title: 'Halloween & Spooky Season',
    description:
      'Playful pumpkins, friendly ghosts, silly witches, costumes, trick-or-treat adventures, and not-too-scary nighttime fun.',
    category: 'seasonal-holidays',
    preferredTags: ['halloween', 'humor', 'adventure', 'bedtime'],
    count: 5,
    swapDays: 17,
    cooldownDays: 30,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-halloween-spooky-v1',
    suggestedStartMonthDay: '10-15',
  },
  {
    id: 'preset-gratitude-family-feast',
    title: 'Gratitude, Baking & Family Table',
    description:
      'Stories of thankfulness, baking bread and soup together, grandparents, and gathering warmly around the family table.',
    category: 'seasonal-holidays',
    preferredTags: ['family', 'food', 'holidays', 'friendship'],
    count: 5,
    swapDays: 21,
    cooldownDays: 30,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-gratitude-family-feast-v1',
    suggestedStartMonthDay: '11-01',
  },
  {
    id: 'preset-christmas-winter-holidays',
    title: 'Christmas & Winter Holidays',
    description:
      'Books featuring snowy landscapes, holiday traditions, gift-giving, Santa Claus, and winter festive cheer.',
    category: 'seasonal-holidays',
    preferredTags: ['christmas', 'holidays', 'winter', 'family'],
    count: 6,
    swapDays: 25,
    cooldownDays: 30,
    requiredFormat: 'hardcover',
    varietyMix: true,
    seed: 'preset-christmas-winter-holidays-v1',
    suggestedStartMonthDay: '12-01',
  },

  // ============================================================================
  // Cultural & Annual Reading Milestones (with annual MM-DD start dates)
  // ============================================================================
  {
    id: 'preset-earth-day-stewards',
    title: 'Earth Day & Planet Stewards',
    description:
      'Forests, oceans, wildlife habitats, pollinators, and caring for our planet’s living ecosystems.',
    category: 'calendar-events',
    preferredTags: ['nature', 'ocean', 'animals', 'insects', 'science'],
    count: 5,
    swapDays: 14,
    cooldownDays: 21,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-earth-day-stewards-v1',
    suggestedStartMonthDay: '04-22',
  },
  {
    id: 'preset-world-book-day',
    title: 'World Book Day & Classic Folktales',
    description:
      'Timeless fairy tales, fables, dragons, castles, and stories celebrating the magic of books and reading aloud.',
    category: 'calendar-events',
    preferredTags: ['fairy-tales', 'adventure', 'rhyme'],
    count: 5,
    swapDays: 14,
    cooldownDays: 21,
    requiredFormat: 'hardcover',
    varietyMix: true,
    seed: 'preset-world-book-day-v1',
    suggestedStartMonthDay: '04-23',
  },
  {
    id: 'preset-back-to-school',
    title: 'Back to School, Brave Feelings & Friends',
    description:
      'Starting new routines, making friends, navigating big feelings, courage, counting, and ABC curiosity.',
    category: 'calendar-events',
    preferredTags: ['feelings', 'friendship', 'alphabet', 'counting'],
    count: 5,
    swapDays: 14,
    cooldownDays: 21,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-back-to-school-v1',
    suggestedStartMonthDay: '09-01',
  },

  // ============================================================================
  // Everyday & Anytime Collections (no fixed start date suggested)
  // ============================================================================
  {
    id: 'preset-calm-bedtime-ritual',
    title: 'Calm Bedtime & Lullaby Ritual',
    description:
      'Gentle cadences, sleepy animals, starry skies, and soothing read-alouds designed to wind down before lights out.',
    category: 'evergreen',
    preferredTags: ['bedtime', 'rhyme', 'animals', 'space'],
    count: 4,
    swapDays: 10,
    cooldownDays: 14,
    requiredFormat: 'board-book',
    varietyMix: true,
    seed: 'preset-calm-bedtime-ritual-v1',
  },
  {
    id: 'preset-stem-space-dinosaurs',
    title: 'Little Scientists, Space & Dinosaurs',
    description:
      'Rockets, planets, prehistoric fossils, young inventors, and hands-on STEM curiosity for inquisitive readers.',
    category: 'evergreen',
    preferredTags: ['science', 'space', 'dinosaurs', 'inventors'],
    count: 5,
    swapDays: 14,
    cooldownDays: 14,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-stem-space-dinosaurs-v1',
  },
  {
    id: 'preset-silly-laughs-aloud',
    title: 'Silly Laughs & Read-Aloud Favorites',
    description:
      'Playful humor, infectious rhymes, busy vehicles, and interactive stories guaranteed to spark family giggles.',
    category: 'evergreen',
    preferredTags: ['humor', 'rhyme', 'vehicles', 'animals'],
    count: 5,
    swapDays: 14,
    cooldownDays: 14,
    requiredFormat: 'any',
    varietyMix: true,
    seed: 'preset-silly-laughs-aloud-v1',
  },
]);
