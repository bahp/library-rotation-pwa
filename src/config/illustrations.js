/**
 * @fileoverview Centralized & decoupled Collection Illustration Library metadata.
 *
 * Pure ESM JavaScript so both Vite browser components and Node native tests
 * (`node --test`) can inspect artwork coverage, suggested matches, and asset paths
 * without bundler-only `.png`/`.jpg` import errors.
 *
 * Every built-in illustration lives in `/public/assets/illustrations/presets/<slug>.png`
 * with a genuine transparent background and warm editorial storybook palette.
 */

/**
 * @typedef {'seasonal-holidays' | 'cultural-traditions' | 'evergreen' | 'reading-corners' | 'childrens-library' | 'literary-lifestyle' | 'whimsical'} IllustrationCategory
 */

/**
 * @typedef {'winter' | 'spring' | 'summer' | 'autumn' | 'bedtime' | 'wonder'} LegacyWatercolorId
 */

/**
 * @typedef {Object} CollectionIllustrationMeta
 * @property {string} id - Stable slug ID (matches `<id>.png` in `/public/assets/illustrations/presets/`)
 * @property {string} label - Concise human-friendly artwork title
 * @property {string} subject - Recognizable central visual subjects shown in the artwork
 * @property {IllustrationCategory} category - Grouping category for the Artwork Picker
 * @property {string} filename - PNG filename on disk
 * @property {string} path - Portable relative URL path from `public/` root (`assets/illustrations/presets/<slug>.png`)
 * @property {string[]} keywords - Topic, season, holiday, and subject keywords for search & smart matching
 * @property {LegacyWatercolorId} legacyFallbackId - Matching classic watercolor fallback key
 */

/** @type {ReadonlyArray<CollectionIllustrationMeta>} */
export const COLLECTION_ILLUSTRATIONS = Object.freeze([
  // ── Seasonal & Calendar ───────────────────────────────────────────────────
  {
    id: 'winter-cozy',
    label: 'Mittens & Hot Cocoa',
    subject: 'Knitted mittens, steaming cocoa mug & snowflakes',
    category: 'seasonal-holidays',
    filename: 'winter-cozy.png',
    path: 'assets/illustrations/presets/winter-cozy.png',
    keywords: ['winter', 'snow', 'cozy', 'cocoa', 'mittens', 'cold', 'fireside', 'frost', 'january'],
    legacyFallbackId: 'winter',
  },
  {
    id: 'valentines-kindness',
    label: 'Songbirds & Sealed Letter',
    subject: 'Two songbirds with wax-sealed envelope & rose',
    category: 'seasonal-holidays',
    filename: 'valentines-kindness.png',
    path: 'assets/illustrations/presets/valentines-kindness.png',
    keywords: ['love', 'valentine', 'friendship', 'kindness', 'birds', 'letter', 'heart', 'february'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'spring-garden',
    label: 'Watering Can & Garden Bugs',
    subject: 'Brass watering can, tulip bulb, ladybug & butterfly',
    category: 'seasonal-holidays',
    filename: 'spring-garden.png',
    path: 'assets/illustrations/presets/spring-garden.png',
    keywords: ['spring', 'garden', 'insects', 'bugs', 'ladybug', 'butterfly', 'tulip', 'seeds', 'flowers'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'earth-day',
    label: 'Brass Globe & Oak Sapling',
    subject: 'Tabletop brass globe with oak leaves & acorns',
    category: 'seasonal-holidays',
    filename: 'earth-day.png',
    path: 'assets/illustrations/presets/earth-day.png',
    keywords: ['earth', 'planet', 'globe', 'nature', 'trees', 'stewards', 'ecology', 'recycling', 'environment'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'summer-ocean',
    label: 'Sailboat & Seashells',
    subject: 'Striped wooden sailboat, waves, nautilus & starfish',
    category: 'seasonal-holidays',
    filename: 'summer-ocean.png',
    path: 'assets/illustrations/presets/summer-ocean.png',
    keywords: ['summer', 'sailboat', 'beach', 'coast', 'ocean', 'shells', 'sun', 'water', 'vacation'],
    legacyFallbackId: 'summer',
  },
  {
    id: 'back-to-school',
    label: 'Satchel, Apple & Compass',
    subject: 'Canvas satchel, pencil, red apple & brass compass',
    category: 'seasonal-holidays',
    filename: 'back-to-school.png',
    path: 'assets/illustrations/presets/back-to-school.png',
    keywords: ['school', 'classroom', 'teacher', 'satchel', 'backpack', 'apple', 'pencil', 'first days', 'learning'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'autumn-harvest',
    label: 'Orchard Basket & Wheat',
    subject: 'Wicker basket with apples, wheat & autumn leaves',
    category: 'seasonal-holidays',
    filename: 'autumn-harvest.png',
    path: 'assets/illustrations/presets/autumn-harvest.png',
    keywords: ['autumn', 'fall', 'harvest', 'apples', 'orchard', 'leaves', 'woodland', 'october', 'september'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'halloween-spooky',
    label: 'Pumpkin & Barn Owl',
    subject: 'Carved jack-o-lantern & perched barn owl',
    category: 'seasonal-holidays',
    filename: 'halloween-spooky.png',
    path: 'assets/illustrations/presets/halloween-spooky.png',
    keywords: ['halloween', 'spooky', 'pumpkin', 'owl', 'nocturnal', 'october', 'costume', 'autumn'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'gratitude-harvest',
    label: 'Warm Pie & Rolling Pin',
    subject: 'Lattice apple pie, wooden rolling pin & cinnamon sticks',
    category: 'seasonal-holidays',
    filename: 'gratitude-harvest.png',
    path: 'assets/illustrations/presets/gratitude-harvest.png',
    keywords: ['gratitude', 'thanksgiving', 'pie', 'baking', 'family', 'table', 'feast', 'november', 'harvest'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'christmas-winter-holidays',
    label: 'Spruce Tree & Rocking Horse',
    subject: 'Trimmed evergreen in pot & wooden rocking horse',
    category: 'seasonal-holidays',
    filename: 'christmas-winter-holidays.png',
    path: 'assets/illustrations/presets/christmas-winter-holidays.png',
    keywords: ['christmas', 'holidays', 'evergreen', 'tree', 'december', 'rocking horse', 'winter', 'gifts'],
    legacyFallbackId: 'winter',
  },

  // ── World Cultural Traditions ─────────────────────────────────────────────
  {
    id: 'lunar-new-year',
    label: 'Red Lantern & Mandarins',
    subject: 'Tasseled festival lantern & leafy mandarin oranges',
    category: 'cultural-traditions',
    filename: 'lunar-new-year.png',
    path: 'assets/illustrations/presets/lunar-new-year.png',
    keywords: ['lunar new year', 'chinese new year', 'lantern', 'mandarin', 'celebration', 'zodiac', 'spring festival'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'carnival-music',
    label: 'Carnival Mask & Tambourine',
    subject: 'Feathered masquerade mask & brass-jingle tambourine',
    category: 'cultural-traditions',
    filename: 'carnival-music.png',
    path: 'assets/illustrations/presets/carnival-music.png',
    keywords: ['carnival', 'masquerade', 'mask', 'tambourine', 'parade', 'costume', 'dance', 'celebration'],
    legacyFallbackId: 'summer',
  },
  {
    id: 'ramadan-eid',
    label: 'Brass Fanous & Crescent Moon',
    subject: 'Ornate brass lantern, crescent moon & warm stars',
    category: 'cultural-traditions',
    filename: 'ramadan-eid.png',
    path: 'assets/illustrations/presets/ramadan-eid.png',
    keywords: ['ramadan', 'eid', 'crescent', 'moon', 'fanous', 'lantern', 'feast', 'generosity', 'stars'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'nowruz-spring',
    label: 'Haft-Sin Sprouts & Painted Eggs',
    subject: 'Ribboned wheatgrass bowl, painted eggs & hyacinth',
    category: 'cultural-traditions',
    filename: 'nowruz-spring.png',
    path: 'assets/illustrations/presets/nowruz-spring.png',
    keywords: ['nowruz', 'equinox', 'spring', 'sprouts', 'painted eggs', 'persian new year', 'renewal', 'traditions'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'world-book-day',
    label: 'Storybook Dragon & Rose',
    subject: 'Friendly storybook dragon, crimson rose & bookmark',
    category: 'cultural-traditions',
    filename: 'world-book-day.png',
    path: 'assets/illustrations/presets/world-book-day.png',
    keywords: ['world book day', 'sant jordi', 'dragon', 'rose', 'storytelling', 'library', 'bookshop', 'reading'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'childrens-day-world',
    label: 'Patchwork Kite & Carp Streamer',
    subject: 'Flying patchwork kite & koinobori windsock',
    category: 'cultural-traditions',
    filename: 'childrens-day-world.png',
    path: 'assets/illustrations/presets/childrens-day-world.png',
    keywords: ['childrens day', 'kodomo no hi', 'kite', 'carp', 'winds', 'play', 'outdoor', 'festival'],
    legacyFallbackId: 'summer',
  },
  {
    id: 'mid-autumn-moon',
    label: 'Mooncake, Teacup & Full Moon',
    subject: 'Golden mooncake, teacup, rabbit silhouette & full moon',
    category: 'cultural-traditions',
    filename: 'mid-autumn-moon.png',
    path: 'assets/illustrations/presets/mid-autumn-moon.png',
    keywords: ['mid-autumn', 'mooncake', 'moon festival', 'rabbit', 'tea', 'lantern', 'harvest moon', 'folklore'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'dia-de-muertos',
    label: 'Marigolds & Monarch Butterfly',
    subject: 'Glowing marigold blossoms, candle & monarch butterfly',
    category: 'cultural-traditions',
    filename: 'dia-de-muertos.png',
    path: 'assets/illustrations/presets/dia-de-muertos.png',
    keywords: ['dia de muertos', 'marigold', 'cempasuchil', 'monarch', 'butterfly', 'candle', 'memories', 'remembrance'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'diwali-lights',
    label: 'Glowing Diyas & Lotus Rangoli',
    subject: 'Two clay oil lamps resting on an ornate lotus rangoli',
    category: 'cultural-traditions',
    filename: 'diwali-lights.png',
    path: 'assets/illustrations/presets/diwali-lights.png',
    keywords: ['diwali', 'diya', 'rangoli', 'festival of lights', 'lamp', 'india', 'light', 'celebration'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'hanukkah-lights',
    label: 'Brass Menorah & Dreidel',
    subject: 'Lit nine-branch brass menorah & carved wooden dreidel',
    category: 'cultural-traditions',
    filename: 'hanukkah-lights.png',
    path: 'assets/illustrations/presets/hanukkah-lights.png',
    keywords: ['hanukkah', 'menorah', 'dreidel', 'candles', 'eight nights', 'festival of lights', 'holidays', 'winter'],
    legacyFallbackId: 'winter',
  },
  {
    id: 'kwanzaa-community',
    label: 'Kinara, Corn & Djembe Drum',
    subject: 'Woven mkeka mat, kinara candles, ear of corn & djembe',
    category: 'cultural-traditions',
    filename: 'kwanzaa-community.png',
    path: 'assets/illustrations/presets/kwanzaa-community.png',
    keywords: ['kwanzaa', 'kinara', 'solstice', 'heritage', 'unity', 'djembe', 'harvest', 'community'],
    legacyFallbackId: 'winter',
  },
  {
    id: 'folktales-legends',
    label: 'Trickster Hare & Archway',
    subject: 'Cloaked woodland hare, brass lantern & ancient stone arch',
    category: 'cultural-traditions',
    filename: 'folktales-legends.png',
    path: 'assets/illustrations/presets/folktales-legends.png',
    keywords: ['folktales', 'folklore', 'fables', 'legends', 'hare', 'trickster', 'traditional', 'storytelling'],
    legacyFallbackId: 'wonder',
  },

  // ── Evergreen Everyday & Developmental ────────────────────────────────────
  {
    id: 'calm-bedtime',
    label: 'Sleeping Fox on Moon Pillow',
    subject: 'Curled sleeping fox on crescent pillow & starry quilt',
    category: 'evergreen',
    filename: 'calm-bedtime.png',
    path: 'assets/illustrations/presets/calm-bedtime.png',
    keywords: ['bedtime', 'sleep', 'calm', 'lullaby', 'fox', 'moon', 'night', 'stars', 'wind-down'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'big-feelings',
    label: 'Patchwork Hot-Air Balloon',
    subject: 'Patchwork hot-air balloon carrying two animal friends',
    category: 'evergreen',
    filename: 'big-feelings.png',
    path: 'assets/illustrations/presets/big-feelings.png',
    keywords: ['feelings', 'emotions', 'empathy', 'kindness', 'friendship', 'balloon', 'sharing', 'sel'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'growing-up-milestones',
    label: 'Sneakers & Height Chart',
    subject: 'Tiny baby bootie beside big-kid sneaker & wooden ruler',
    category: 'evergreen',
    filename: 'growing-up-milestones.png',
    path: 'assets/illustrations/presets/growing-up-milestones.png',
    keywords: ['growing up', 'sibling', 'baby', 'milestone', 'potty', 'big kid', 'shoes', 'independence'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'toddler-board-favorites',
    label: 'Pull-Along Duck & ABC Blocks',
    subject: 'Wooden pull-along duck & carved alphabet blocks',
    category: 'evergreen',
    filename: 'toddler-board-favorites.png',
    path: 'assets/illustrations/presets/toddler-board-favorites.png',
    keywords: ['toddler', 'board book', 'baby', 'blocks', 'wooden duck', 'peekaboo', 'rhythm', 'rhyming'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'animals-habitats',
    label: 'Woodland Fox & Hedgehog',
    subject: 'Red fox, hedgehog & fern fronds in mossy woodland',
    category: 'evergreen',
    filename: 'animals-habitats.png',
    path: 'assets/illustrations/presets/animals-habitats.png',
    keywords: ['animals', 'wildlife', 'fox', 'hedgehog', 'woodland', 'forest', 'habitats', 'creatures'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'stem-space-dinosaurs',
    label: 'Rocket, Saturn & Diplodocus',
    subject: 'Vintage tin rocket, ringed planet, dinosaur & magnifier',
    category: 'evergreen',
    filename: 'stem-space-dinosaurs.png',
    path: 'assets/illustrations/presets/stem-space-dinosaurs.png',
    keywords: ['stem', 'science', 'space', 'rocket', 'planets', 'dinosaurs', 'fossils', 'curiosity', 'inventions'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'silly-read-alouds',
    label: 'Frog on Polka-Dot Umbrella',
    subject: 'Bespectacled green frog balancing on an upside-down umbrella',
    category: 'evergreen',
    filename: 'silly-read-alouds.png',
    path: 'assets/illustrations/presets/silly-read-alouds.png',
    keywords: ['silly', 'humor', 'funny', 'giggles', 'frog', 'umbrella', 'read-aloud', 'wordplay'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'fairy-tales',
    label: 'Castle, Key & Crystal Slipper',
    subject: 'Turreted storybook castle, brass key & sparkling slipper',
    category: 'evergreen',
    filename: 'fairy-tales.png',
    path: 'assets/illustrations/presets/fairy-tales.png',
    keywords: ['fairy tales', 'castle', 'magic', 'kingdom', 'princess', 'fantasy', 'enchanted', 'key'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'mythical-creatures',
    label: 'Heraldic Griffin & Feather',
    subject: 'Winged golden griffin & shimmering phoenix feather',
    category: 'evergreen',
    filename: 'mythical-creatures.png',
    path: 'assets/illustrations/presets/mythical-creatures.png',
    keywords: ['mythology', 'myths', 'mythical', 'griffin', 'phoenix', 'unicorn', 'dragon', 'monsters', 'legends'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'transport-vehicles',
    label: 'Steam Locomotive & Biplane',
    subject: 'Teal steam train engine & vintage propeller biplane',
    category: 'evergreen',
    filename: 'transport-vehicles.png',
    path: 'assets/illustrations/presets/transport-vehicles.png',
    keywords: ['vehicles', 'transport', 'trains', 'locomotive', 'airplanes', 'cars', 'travel', 'journey'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'construction-machines',
    label: 'Excavator & Traffic Cone',
    subject: 'Yellow-gold excavator digger with bucket & traffic cone',
    category: 'evergreen',
    filename: 'construction-machines.png',
    path: 'assets/illustrations/presets/construction-machines.png',
    keywords: ['construction', 'excavator', 'digger', 'trucks', 'bulldozer', 'crane', 'machines', 'building'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'community-helpers',
    label: 'Fire Bell, Stethoscope & Mail',
    subject: 'Brass fire bell, stethoscope & striped postal satchel',
    category: 'evergreen',
    filename: 'community-helpers.png',
    path: 'assets/illustrations/presets/community-helpers.png',
    keywords: ['community', 'helpers', 'firefighter', 'doctor', 'nurse', 'mail', 'careers', 'neighborhood'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'farmyard-country',
    label: 'Red Barn, Cow & Tractor',
    subject: 'Terracotta barn, spotted dairy cow, hen & vintage tractor',
    category: 'evergreen',
    filename: 'farmyard-country.png',
    path: 'assets/illustrations/presets/farmyard-country.png',
    keywords: ['farm', 'farmyard', 'barn', 'cow', 'chicken', 'tractor', 'country', 'animals'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'music-rhythm',
    label: 'Ukulele & Brass Horn',
    subject: 'Wooden ukulele, French horn & floating musical notes',
    category: 'evergreen',
    filename: 'music-rhythm.png',
    path: 'assets/illustrations/presets/music-rhythm.png',
    keywords: ['music', 'instruments', 'ukulele', 'horn', 'rhythm', 'melody', 'singing', 'dance'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'art-creativity',
    label: 'Palette, Brushes & Scissors',
    subject: 'Wooden painter palette, sable brushes, yarn & brass scissors',
    category: 'evergreen',
    filename: 'art-creativity.png',
    path: 'assets/illustrations/presets/art-creativity.png',
    keywords: ['art', 'creativity', 'painting', 'crafts', 'palette', 'makers', 'drawing', 'imagination'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'colors-shapes-patterns',
    label: 'Rainbow Stack & Tangram Blocks',
    subject: 'Wooden rainbow arch stacker & geometric tangram tiles',
    category: 'evergreen',
    filename: 'colors-shapes-patterns.png',
    path: 'assets/illustrations/presets/colors-shapes-patterns.png',
    keywords: ['colors', 'shapes', 'patterns', 'rainbow', 'sorting', 'preschool', 'montessori', 'early learning'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'counting-first-math',
    label: 'Wooden Abacus & Dice',
    subject: 'Beaded wooden abacus, numeral three tile & wooden dice',
    category: 'evergreen',
    filename: 'counting-first-math.png',
    path: 'assets/illustrations/presets/counting-first-math.png',
    keywords: ['numbers', 'counting', 'math', 'abacus', 'dice', 'quantities', 'early math', 'preschool'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'underwater-ocean',
    label: 'Octopus, Sea Turtle & Coral',
    subject: 'Gentle octopus, sea turtle & teal coral reef fan',
    category: 'evergreen',
    filename: 'underwater-ocean.png',
    path: 'assets/illustrations/presets/underwater-ocean.png',
    keywords: ['underwater', 'sea creatures', 'octopus', 'turtle', 'coral', 'marine life', 'ocean', 'fish'],
    legacyFallbackId: 'summer',
  },
  {
    id: 'sports-outdoor-play',
    label: 'Bicycle, Ball & Jump Rope',
    subject: 'Wicker-basket bicycle, stitched ball & wooden jump rope',
    category: 'evergreen',
    filename: 'sports-outdoor-play.png',
    path: 'assets/illustrations/presets/sports-outdoor-play.png',
    keywords: ['sports', 'outdoor play', 'bicycle', 'soccer', 'movement', 'exercise', 'playground', 'teamwork'],
    legacyFallbackId: 'summer',
  },
  {
    id: 'cooking-food',
    label: 'Mixing Bowl, Whisk & Pancakes',
    subject: 'Ceramic mixing bowl, wire whisk, stacked pancakes & carrots',
    category: 'evergreen',
    filename: 'cooking-food.png',
    path: 'assets/illustrations/presets/cooking-food.png',
    keywords: ['cooking', 'food', 'chefs', 'kitchen', 'baking', 'pancakes', 'vegetables', 'recipes'],
    legacyFallbackId: 'autumn',
  },
]);

/**
 * Direct 1-to-1 built-in preset -> illustration ID mapping covering every preset
 * in `DEFAULT_ROTATION_PRESETS` without touching `/src/config/presets.js` logic.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PRESET_ILLUSTRATION_MAP = Object.freeze({
  'preset-winter-cozy': 'winter-cozy',
  'preset-valentines-kindness': 'valentines-kindness',
  'preset-spring-garden': 'spring-garden',
  'preset-earth-day': 'earth-day',
  'preset-summer-ocean': 'summer-ocean',
  'preset-back-to-school': 'back-to-school',
  'preset-autumn-harvest': 'autumn-harvest',
  'preset-halloween-spooky': 'halloween-spooky',
  'preset-gratitude-harvest': 'gratitude-harvest',
  'preset-christmas-winter-holidays': 'christmas-winter-holidays',
  'preset-lunar-new-year': 'lunar-new-year',
  'preset-carnival-music': 'carnival-music',
  'preset-ramadan-eid': 'ramadan-eid',
  'preset-nowruz-spring': 'nowruz-spring',
  'preset-world-book-day': 'world-book-day',
  'preset-childrens-day-world': 'childrens-day-world',
  'preset-mid-autumn-moon': 'mid-autumn-moon',
  'preset-dia-de-muertos': 'dia-de-muertos',
  'preset-diwali-lights': 'diwali-lights',
  'preset-hanukkah-lights': 'hanukkah-lights',
  'preset-kwanzaa-community': 'kwanzaa-community',
  'preset-calm-bedtime': 'calm-bedtime',
  'preset-big-feelings': 'big-feelings',
  'preset-growing-up-milestones': 'growing-up-milestones',
  'preset-toddler-board-favorites': 'toddler-board-favorites',
  'preset-animals-habitats': 'animals-habitats',
  'preset-stem-space-dinosaurs': 'stem-space-dinosaurs',
  'preset-silly-read-alouds': 'silly-read-alouds',
  'preset-folktales-legends': 'folktales-legends',
  'preset-fairy-tales': 'fairy-tales',
  'preset-mythical-creatures': 'mythical-creatures',
  'preset-transport-vehicles': 'transport-vehicles',
  'preset-construction-machines': 'construction-machines',
  'preset-community-helpers': 'community-helpers',
  'preset-farmyard-country': 'farmyard-country',
  'preset-music-rhythm': 'music-rhythm',
  'preset-art-creativity': 'art-creativity',
  'preset-colors-shapes-patterns': 'colors-shapes-patterns',
  'preset-counting-first-math': 'counting-first-math',
  'preset-underwater-ocean': 'underwater-ocean',
  'preset-sports-outdoor-play': 'sports-outdoor-play',
  'preset-cooking-food': 'cooking-food',
});

/**
 * Dedicated transparent library & reading-corner illustrations created for the Sidebar
 * and Explorer Gallery, tagged by category (`reading-corners`, `childrens-library`,
 * `literary-lifestyle`, `whimsical`).
 *
 * @type {ReadonlyArray<CollectionIllustrationMeta>}
 */
export const SIDEBAR_ILLUSTRATIONS = Object.freeze([
  // ── Reading Corners ────────────────────────────────────────────────────────
  {
    id: 'cosy-reading-nook',
    label: 'The Cosy Reading Nook',
    subject: 'Vintage armchair with sage cushion, stacked books, tea cup & brass floor lamp',
    category: 'reading-corners',
    filename: 'cosy-reading-nook.png',
    path: 'assets/illustrations/sidebar/cosy-reading-nook.png',
    keywords: ['sidebar', 'reading corner', 'armchair', 'lamp', 'tea', 'botanical', 'cozy', 'nook'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'miniature-library',
    label: 'The Miniature Library',
    subject: 'Antique wooden bookshelf filled with colourful old books, wooden ladder & trailing ivy',
    category: 'reading-corners',
    filename: 'miniature-library.png',
    path: 'assets/illustrations/sidebar/miniature-library.png',
    keywords: ['sidebar', 'bookshelf', 'library', 'ladder', 'ivy', 'wooden', 'antique', 'corner'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'books-reading-lamp',
    label: 'Books & Reading Lamp',
    subject: 'Vintage hardcover book pile, reading glasses, brass desk lamp & botanical bookmark',
    category: 'reading-corners',
    filename: 'books-reading-lamp.png',
    path: 'assets/illustrations/sidebar/books-reading-lamp.png',
    keywords: ['sidebar', 'lamp', 'glasses', 'hardcover', 'pile', 'desk lamp', 'bookmark'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'window-reading-corner',
    label: 'The Window Reading Corner',
    subject: 'Cushioned window seat with stacked books, knitted blanket, tea cup & potted plants',
    category: 'reading-corners',
    filename: 'window-reading-corner.png',
    path: 'assets/illustrations/sidebar/window-reading-corner.png',
    keywords: ['sidebar', 'window seat', 'blanket', 'pillows', 'tea', 'plants', 'peaceful'],
    legacyFallbackId: 'bedtime',
  },

  // ── Children's Library ─────────────────────────────────────────────────────
  {
    id: 'childrens-bookshelf',
    label: "The Children's Bookshelf",
    subject: 'Low wooden bookshelf with colourful picture books, teddy bear, blocks & toy rabbit',
    category: 'childrens-library',
    filename: 'childrens-bookshelf.png',
    path: 'assets/illustrations/sidebar/childrens-bookshelf.png',
    keywords: ['sidebar', 'children', 'nursery', 'teddy bear', 'blocks', 'rabbit', 'bookshelf'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'little-reader',
    label: 'Little Reader',
    subject: 'Young child reading a colourful picture book on a round rug with cushions & teddy bear',
    category: 'childrens-library',
    filename: 'little-reader.png',
    path: 'assets/illustrations/sidebar/little-reader.png',
    keywords: ['sidebar', 'child', 'reader', 'rug', 'picture book', 'cushions', 'teddy bear'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'book-trolley',
    label: 'The Book Trolley',
    subject: 'Miniature wooden library cart with two shelves of picture books, wooden toy & potted plant',
    category: 'childrens-library',
    filename: 'book-trolley.png',
    path: 'assets/illustrations/sidebar/book-trolley.png',
    keywords: ['sidebar', 'trolley', 'cart', 'nursery', 'picture books', 'wooden toy', 'plant'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'storytime-collection',
    label: 'Storytime Collection',
    subject: 'Whimsical stack of children picture books with a friendly fox, tiny stars & wildflowers',
    category: 'childrens-library',
    filename: 'storytime-collection.png',
    path: 'assets/illustrations/sidebar/storytime-collection.png',
    keywords: ['sidebar', 'storytime', 'fox', 'stars', 'flowers', 'picture books', 'whimsical'],
    legacyFallbackId: 'autumn',
  },

  // ── Literary Lifestyle ─────────────────────────────────────────────────────
  {
    id: 'coffee-and-books',
    label: 'Coffee & Books',
    subject: 'Handmade ceramic coffee cup with steam, vintage hardcover stack, glasses & biscuit',
    category: 'literary-lifestyle',
    filename: 'coffee-and-books.png',
    path: 'assets/illustrations/sidebar/coffee-and-books.png',
    keywords: ['sidebar', 'coffee', 'ceramic cup', 'glasses', 'biscuit', 'cafe', 'literary'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'open-book-flowers',
    label: 'Open Book & Flowers',
    subject: 'Open antique storybook with pressed wildflowers, delicate branches & green botanical leaves',
    category: 'literary-lifestyle',
    filename: 'open-book-flowers.png',
    path: 'assets/illustrations/sidebar/open-book-flowers.png',
    keywords: ['sidebar', 'open book', 'flowers', 'wildflowers', 'botanical', 'pressed', 'leaves'],
    legacyFallbackId: 'spring',
  },
  {
    id: 'readers-desk',
    label: "The Reader's Desk",
    subject: 'Vintage wooden writing desk with stacked books, brass desk lamp, fountain pen & notebook',
    category: 'literary-lifestyle',
    filename: 'readers-desk.png',
    path: 'assets/illustrations/sidebar/readers-desk.png',
    keywords: ['sidebar', 'desk', 'writing', 'notebook', 'fountain pen', 'brass lamp', 'study'],
    legacyFallbackId: 'wonder',
  },
  {
    id: 'literary-explorer',
    label: 'The Literary Explorer',
    subject: 'Vintage leather satchel beside an old world globe, travel books, brass compass & botanical leaves',
    category: 'literary-lifestyle',
    filename: 'literary-explorer.png',
    path: 'assets/illustrations/sidebar/literary-explorer.png',
    keywords: ['sidebar', 'explorer', 'globe', 'satchel', 'compass', 'travel', 'adventure'],
    legacyFallbackId: 'wonder',
  },

  // ── Whimsical Illustrations ────────────────────────────────────────────────
  {
    id: 'library-cat',
    label: 'The Library Cat',
    subject: 'Cozy sleeping cat curled atop a colourful stack of vintage books with delicate botanical leaves',
    category: 'whimsical',
    filename: 'library-cat.png',
    path: 'assets/illustrations/sidebar/library-cat.png',
    keywords: ['sidebar', 'cat', 'sleeping cat', 'books', 'botanical', 'whimsical', 'cozy'],
    legacyFallbackId: 'bedtime',
  },
  {
    id: 'reading-fox',
    label: 'The Reading Fox',
    subject: 'Gentle woodland fox wearing reading glasses while holding an open book among soft wildflowers',
    category: 'whimsical',
    filename: 'reading-fox.png',
    path: 'assets/illustrations/sidebar/reading-fox.png',
    keywords: ['sidebar', 'fox', 'glasses', 'reading', 'woodland', 'wildflowers', 'whimsical'],
    legacyFallbackId: 'autumn',
  },
  {
    id: 'magical-library',
    label: 'The Magical Library',
    subject: 'Glowing antique books floating gently with tiny golden stars, soft light & trailing botanical leaves',
    category: 'whimsical',
    filename: 'magical-library.png',
    path: 'assets/illustrations/sidebar/magical-library.png',
    keywords: ['sidebar', 'magic', 'magical', 'floating books', 'stars', 'glowing', 'whimsical'],
    legacyFallbackId: 'bedtime',
  },
]);

const ALL_ILLUSTRATIONS_BY_ID = new Map(
  [...COLLECTION_ILLUSTRATIONS, ...SIDEBAR_ILLUSTRATIONS].map((item) => [item.id, item])
);
const ILLUSTRATIONS_BY_ID = ALL_ILLUSTRATIONS_BY_ID;

/**
 * Looks up any collection or sidebar illustration by its stable ID.
 * @param {string | undefined | null} id
 * @returns {CollectionIllustrationMeta | undefined}
 */
export function getIllustrationById(id) {
  const key = String(id || '').trim().toLowerCase();
  if (!key) return undefined;
  return ALL_ILLUSTRATIONS_BY_ID.get(key);
}

/**
 * Returns the suggested transparent illustration for any built-in or custom preset
 * by checking explicit ID mapping first, then scoring title, tags, description, and category.
 *
 * @param {{
 *   id?: string,
 *   title?: string,
 *   description?: string,
 *   category?: string,
 *   preferredTags?: string[],
 *   motif?: string
 * } | null | undefined} preset
 * @returns {CollectionIllustrationMeta}
 */
export function getSuggestedIllustrationForPreset(preset) {
  const mappedId = preset?.id ? PRESET_ILLUSTRATION_MAP[preset.id] : undefined;
  if (mappedId && ILLUSTRATIONS_BY_ID.has(mappedId)) {
    return /** @type {CollectionIllustrationMeta} */ (ILLUSTRATIONS_BY_ID.get(mappedId));
  }

  const tags = Array.isArray(preset?.preferredTags)
    ? preset.preferredTags.map((t) => String(t).toLowerCase().trim()).filter(Boolean)
    : [];
  const haystack = `${preset?.title || ''} ${preset?.description || ''} ${tags.join(' ')} ${preset?.motif || ''}`
    .toLowerCase()
    .trim();

  let bestItem = COLLECTION_ILLUSTRATIONS[0];
  let bestScore = -1;

  for (const item of COLLECTION_ILLUSTRATIONS) {
    let score = 0;
    if (preset?.category && item.category === preset.category) {
      score += 1;
    }
    if (preset?.motif && item.keywords.includes(String(preset.motif).toLowerCase())) {
      score += 4;
    }
    for (const kw of item.keywords) {
      if (tags.includes(kw)) {
        score += 6;
      } else if (haystack.includes(kw)) {
        score += kw.includes(' ') ? 5 : 3;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = item;
    }
  }

  if (bestScore > 0) {
    return bestItem;
  }

  if (preset?.category === 'cultural-traditions') {
    return /** @type {CollectionIllustrationMeta} */ (ILLUSTRATIONS_BY_ID.get('folktales-legends'));
  }
  if (preset?.category === 'seasonal-holidays' || preset?.category === 'calendar-events') {
    return /** @type {CollectionIllustrationMeta} */ (ILLUSTRATIONS_BY_ID.get('spring-garden'));
  }
  return /** @type {CollectionIllustrationMeta} */ (ILLUSTRATIONS_BY_ID.get('world-book-day'));
}

/**
 * Determines whether a resolved artwork URL represents an opaque paper-backed image
 * (e.g. legacy `.jpg` watercolors or AI-generated cream-paper images) that needs
 * `mix-blend-*` edge softening, vs. a genuine transparent PNG/SVG/WebP illustration.
 *
 * @param {string | undefined | null} url
 * @returns {boolean}
 */
export function isLegacyOpaqueArtworkUrl(url) {
  const val = String(url || '').trim().toLowerCase();
  if (!val) return false;
  if (val.includes('assets/illustrations/')) return false;
  if (val.startsWith('data:image/jpeg') || val.startsWith('data:image/jpg')) return true;
  if (/\.jpe?g(\?|$)/i.test(val)) return true;
  // AI generator returns warm-cream-paper PNG data URLs
  if (val.startsWith('data:image/png')) return true;
  return false;
}
