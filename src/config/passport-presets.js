/**
 * @fileoverview Configuration for Reading Passport & Certificate Templates, Series Presets,
 * Stamps, and Achievements.
 *
 * DEVELOPER EXTENSION GUIDE:
 * - To add a new default series or certificate preset:
 *   Add an entry to `DEFAULT_PASSPORT_PRESETS`. Include `id`, `title`, `seriesName`,
 *   `category`, `defaultLayout`, `theme`, `books` (array with title, author, optional coverUrl),
 *   and suggested `achievements`.
 * - To add new stamp badges:
 *   Add an entry to `PASSPORT_STAMPS`.
 * - To add new achievements:
 *   Add an entry to `PASSPORT_ACHIEVEMENTS`.
 */

/**
 * @typedef {'traditional-passport' | 'official-certificate' | 'storytime-bingo' | 'adventure-map' | 'stamp-sheet'} PassportLayoutMode
 */

/**
 * @typedef {'classic' | 'explorer' | 'forest' | 'magic' | 'night' | 'ink-saver'} PassportThemeKey
 */

/**
 * @typedef {Object} PassportBookItem
 * @property {string} id
 * @property {string} title
 * @property {string} [author]
 * @property {string} [coverUrl]
 * @property {string} [description]
 * @property {string} [accentColor]
 */

/**
 * @typedef {Object} PassportAchievement
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} icon - Icon name from common/Icon
 * @property {string} badgeText
 * @property {string} colorClass
 */

/**
 * @typedef {Object} PassportPreset
 * @property {string} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string} seriesName
 * @property {string} description
 * @property {string} category - 'fantasy-series' | 'bedtime-stories' | 'adventure' | 'classics' | 'custom'
 * @property {PassportLayoutMode} defaultLayout
 * @property {PassportThemeKey} theme
 * @property {string} [customBgType] - 'parchment' | 'stars' | 'gradient' | 'meadow' | 'custom'
 * @property {string} [customBgUrl]
 * @property {number} [bgBlur]
 * @property {number} [bgOpacity]
 * @property {string} [borderStyle] - 'filigree' | 'double' | 'vintage' | 'minimal'
 * @property {string} [emblem] - 'ribbon' | 'crown' | 'wand' | 'owl' | 'star' | 'compass'
 * @property {string} [certificateDedication]
 * @property {PassportBookItem[]} books
 * @property {string[]} achievementIds
 * @property {boolean} [isCustom]
 */

/**
 * Built-in Stamp tokens available for digital stamping and printable cutouts.
 */
export const PASSPORT_STAMPS = [
  {
    id: 'read-it',
    label: 'Read It!',
    caption: 'COMPLETED',
    icon: 'check',
    symbol: '✓',
    color: 'lr-stamp-emerald',
    rotation: '-6deg',
  },
  {
    id: 'favorite',
    label: 'Loved It ❤️',
    caption: 'TOP PICK',
    icon: 'heartFilled',
    symbol: '❤️',
    color: 'lr-stamp-rose',
    rotation: '4deg',
  },
  {
    id: 'star-reader',
    label: '5 Stars ⭐️',
    caption: 'EXCELLENT',
    icon: 'starFilled',
    symbol: '★',
    color: 'lr-stamp-amber',
    rotation: '-4deg',
  },
  {
    id: 'wizard',
    label: 'Magic Book 🪄',
    caption: 'SPELLBOUND',
    icon: 'sparkles',
    symbol: '✨',
    color: 'lr-stamp-purple',
    rotation: '8deg',
  },
  {
    id: 'explorer',
    label: 'Explorer 🚀',
    caption: 'DISCOVERY',
    icon: 'compass',
    symbol: '🧭',
    color: 'lr-stamp-indigo',
    rotation: '-8deg',
  },
  {
    id: 'champion',
    label: 'Story Champ 🏆',
    caption: 'HONOR',
    icon: 'award',
    symbol: '🏆',
    color: 'lr-stamp-yellow',
    rotation: '5deg',
  },
  {
    id: 'bedtime-star',
    label: 'Sweet Dreams 🌙',
    caption: 'NIGHT READ',
    icon: 'moon',
    symbol: '🌙',
    color: 'lr-stamp-sky',
    rotation: '-3deg',
  },
  {
    id: 'curious-owl',
    label: 'Wise Reader 🦉',
    caption: 'SMART',
    icon: 'book',
    symbol: '🦉',
    color: 'lr-stamp-teal',
    rotation: '6deg',
  },
];

/**
 * Built-in reading achievements and milestone awards.
 */
export const PASSPORT_ACHIEVEMENTS = [
  {
    id: 'series-master',
    title: 'Series Connoisseur',
    description: 'Read every volume in a dedicated book collection or story cycle',
    icon: 'award',
    badgeText: 'Complete Series',
    colorClass: 'lr-ach-amber',
  },
  {
    id: 'bedtime-champion',
    title: 'Bedtime Story Hero',
    description: 'Listened to 7 evening read-alouds without missing a single night',
    icon: 'moon',
    badgeText: '7 Nights in a Row',
    colorClass: 'lr-ach-indigo',
  },
  {
    id: 'silly-voices',
    title: 'Voice Actor Extraordinaire',
    description: 'Created 3 hilarious or mysterious character voices during storytime',
    icon: 'sparkles',
    badgeText: 'Great Voices',
    colorClass: 'lr-ach-rose',
  },
  {
    id: 'pillow-fort',
    title: 'Pillow Fort Explorer',
    description: 'Built a secret blanket fort with a flashlight for cozy reading',
    icon: 'compass',
    badgeText: 'Cozy Fort',
    colorClass: 'lr-ach-emerald',
  },
  {
    id: 'curious-questions',
    title: 'Curious Wonderer',
    description: 'Asked "Why?" or predicted how the story would end before the last page',
    icon: 'search',
    badgeText: 'Deep Thinker',
    colorClass: 'lr-ach-sky',
  },
  {
    id: 'first-chapter',
    title: 'Chapter Explorer',
    description: 'Tackled an early chapter book and read to the exciting climax',
    icon: 'book',
    badgeText: 'Chapter Master',
    colorClass: 'lr-ach-purple',
  },
];

/**
 * Default Series Presets & Certificate Sets.
 * Developers can freely append new entries here!
 * Users can also create and store their own via the UI.
 * @type {PassportPreset[]}
 */
export const DEFAULT_PASSPORT_PRESETS = [
  {
    id: 'preset-harry-potter',
    title: 'Hogwarts Wizarding Journey',
    subtitle: 'Official 7-Year Magical Reading Passport',
    seriesName: 'Harry Potter Series',
    description: 'Journey from the cupboard under the stairs through the Battle of Hogwarts with an official magical passport and house crest.',
    category: 'fantasy-series',
    defaultLayout: 'traditional-passport',
    theme: 'magic',
    customBgType: 'stars',
    borderStyle: 'filigree',
    emblem: 'wand',
    certificateDedication: 'Awarded for exceptional courage, wit, and magical reading stamina throughout all seven years at Hogwarts.',
    books: [
      { id: 'hp-1', title: "Harry Potter & the Sorcerer's Stone", author: 'J.K. Rowling', description: 'Year 1: The Boy Who Lived', accentColor: '#b91c1c' },
      { id: 'hp-2', title: 'Harry Potter & the Chamber of Secrets', author: 'J.K. Rowling', description: 'Year 2: The Heir of Slytherin', accentColor: '#047857' },
      { id: 'hp-3', title: 'Harry Potter & the Prisoner of Azkaban', author: 'J.K. Rowling', description: 'Year 3: The Marauder’s Map', accentColor: '#4338ca' },
      { id: 'hp-4', title: 'Harry Potter & the Goblet of Fire', author: 'J.K. Rowling', description: 'Year 4: The Triwizard Tournament', accentColor: '#b45309' },
      { id: 'hp-5', title: 'Harry Potter & the Order of the Phoenix', author: 'J.K. Rowling', description: 'Year 5: Dumbledore’s Army', accentColor: '#1e3a8a' },
      { id: 'hp-6', title: 'Harry Potter & the Half-Blood Prince', author: 'J.K. Rowling', description: 'Year 6: The Pensieve Memories', accentColor: '#0f766e' },
      { id: 'hp-7', title: 'Harry Potter & the Deathly Hallows', author: 'J.K. Rowling', description: 'Year 7: The Master of Death', accentColor: '#6b21a8' },
    ],
    achievementIds: ['series-master', 'first-chapter', 'curious-questions'],
  },
  {
    id: 'preset-one-minute-bed',
    title: 'One Minute to Bed & Dreamland Express',
    subtitle: 'Cozy Evening Read-Aloud Certificate',
    seriesName: 'One Minute to Bed & Sleepy Classics',
    description: 'Beloved bedtime stories for winding down, counting stars, and falling asleep with happy dreams.',
    category: 'bedtime-stories',
    defaultLayout: 'official-certificate',
    theme: 'night',
    customBgType: 'gradient',
    borderStyle: 'filigree',
    emblem: 'ribbon',
    certificateDedication: 'Presented to an extraordinary young listener for filling the evening with wonderful quiet stories and sleepy smiles.',
    books: [
      { id: 'bed-1', title: 'Goodnight Moon', author: 'Margaret Wise Brown', description: 'Goodnight room, goodnight moon', accentColor: '#065f46' },
      { id: 'bed-2', title: 'Where the Wild Things Are', author: 'Maurice Sendak', description: 'Let the wild rumpus start!', accentColor: '#1e3a8a' },
      { id: 'bed-3', title: 'The Gruffalo', author: 'Julia Donaldson', description: 'A mouse took a stroll through the deep dark wood', accentColor: '#9a3412' },
      { id: 'bed-4', title: 'Guess How Much I Love You', author: 'Sam McBratney', description: 'I love you right up to the moon and back', accentColor: '#d97706' },
      { id: 'bed-5', title: 'Corduroy', author: 'Don Freeman', description: 'A teddy bear waiting for a friend', accentColor: '#0f766e' },
      { id: 'bed-6', title: 'Brown Bear, Brown Bear, What Do You See?', author: 'Bill Martin Jr.', description: 'I see a red bird looking at me', accentColor: '#b91c1c' },
    ],
    achievementIds: ['bedtime-champion', 'pillow-fort', 'silly-voices'],
  },
  {
    id: 'preset-percy-jackson',
    title: 'Camp Half-Blood Demigod Quest',
    subtitle: 'Hero’s Reading Adventure Trail',
    seriesName: 'Percy Jackson & The Olympians',
    description: 'Track the legendary quest from Mount Olympus through the Underworld with an ancient hero’s map.',
    category: 'adventure',
    defaultLayout: 'adventure-map',
    theme: 'explorer',
    customBgType: 'parchment',
    borderStyle: 'vintage',
    emblem: 'compass',
    certificateDedication: 'Certified by Chiron and Camp Half-Blood for mastering the trials of myth, prophecy, and courageous reading.',
    books: [
      { id: 'pj-1', title: 'The Lightning Thief', author: 'Rick Riordan', description: 'Quest 1: The Master Bolt', accentColor: '#0284c7' },
      { id: 'pj-2', title: 'The Sea of Monsters', author: 'Rick Riordan', description: 'Quest 2: The Golden Fleece', accentColor: '#059669' },
      { id: 'pj-3', title: "The Titan's Curse", author: 'Rick Riordan', description: 'Quest 3: The Hunter of Artemis', accentColor: '#4338ca' },
      { id: 'pj-4', title: 'The Battle of the Labyrinth', author: 'Rick Riordan', description: 'Quest 4: Daedalus’s Maze', accentColor: '#b45309' },
      { id: 'pj-5', title: 'The Last Olympian', author: 'Rick Riordan', description: 'Quest 5: Defense of Olympus', accentColor: '#7c3aed' },
    ],
    achievementIds: ['series-master', 'first-chapter', 'curious-questions'],
  },
  {
    id: 'preset-rhyme-time',
    title: 'Silly Rhymes & Giggles Bingo',
    subtitle: 'Interactive Laughter & Story Card',
    seriesName: 'Rhyme Time Classics',
    description: 'Fast-paced, tongue-twisting rhymes and silly tales to get young readers laughing and guessing rhymes.',
    category: 'classics',
    defaultLayout: 'storytime-bingo',
    theme: 'classic',
    customBgType: 'gradient',
    borderStyle: 'double',
    emblem: 'star',
    certificateDedication: 'Awarded for extraordinary giggle power, tongue-twister speed, and joy in words.',
    books: [
      { id: 'rt-1', title: 'Green Eggs and Ham', author: 'Dr. Seuss', description: 'Try them and you may, I say!', accentColor: '#16a34a' },
      { id: 'rt-2', title: 'The Cat in the Hat', author: 'Dr. Seuss', description: 'Look at me! Look at me now!', accentColor: '#dc2626' },
      { id: 'rt-3', title: 'Chicka Chicka Boom Boom', author: 'Bill Martin Jr.', description: 'Will there be enough room?', accentColor: '#ea580c' },
      { id: 'rt-4', title: 'Fox in Socks', author: 'Dr. Seuss', description: 'Knox in box. Fox in socks.', accentColor: '#d97706' },
      { id: 'rt-5', title: 'Room on the Broom', author: 'Julia Donaldson', description: 'Is there room on the broom for a dog like me?', accentColor: '#7c3aed' },
      { id: 'rt-6', title: 'Giraffes Can’t Dance', author: 'Giles Andreae', description: 'Listen to the swaying grass and the trees', accentColor: '#0891b2' },
      { id: 'rt-7', title: 'Click, Clack, Moo: Cows That Type', author: 'Doreen Cronin', description: 'Farmer Brown has a problem', accentColor: '#4b5563' },
      { id: 'rt-8', title: 'Dragons Love Tacos', author: 'Adam Rubin', description: 'Beware of the spicy salsa!', accentColor: '#b91c1c' },
    ],
    achievementIds: ['silly-voices', 'pillow-fort', 'curious-questions'],
  },
  {
    id: 'preset-nature-explorers',
    title: 'Little Naturalist Safari & Ocean Trek',
    subtitle: 'Wildlife & Nature Explorer Passport',
    seriesName: 'Nature & Animal Wonders',
    description: 'Track ocean creatures, dinosaur bones, jungle tracks, and deep forest secrets in an expedition passport.',
    category: 'adventure',
    defaultLayout: 'traditional-passport',
    theme: 'forest',
    customBgType: 'meadow',
    borderStyle: 'filigree',
    emblem: 'owl',
    certificateDedication: 'Certified Field Naturalist honor awarded for observing wild stories and discovering the secrets of our earth.',
    books: [
      { id: 'ne-1', title: 'Over and Under the Snow', author: 'Kate Messner', description: 'A secret kingdom under the drifts', accentColor: '#0284c7' },
      { id: 'ne-2', title: 'The Very Hungry Caterpillar', author: 'Eric Carle', description: 'In the light of the moon', accentColor: '#16a34a' },
      { id: 'ne-3', title: 'National Geographic Little Kids First Big Book of Dinosaurs', author: 'Catherine D. Hughes', description: 'Fossils and giant footprints', accentColor: '#b45309' },
      { id: 'ne-4', title: 'The Big Book of the Blue', author: 'Yuval Zommer', description: 'Whales, turtles, and coral reefs', accentColor: '#0369a1' },
      { id: 'ne-5', title: 'Up in the Garden and Down in the Dirt', author: 'Kate Messner', description: 'Worms, honeybees, and sprouts', accentColor: '#65a30d' },
      { id: 'ne-6', title: 'Stellaluna', author: 'Janell Cannon', description: 'A little fruit bat finding her way', accentColor: '#7c3aed' },
    ],
    achievementIds: ['curious-questions', 'pillow-fort', 'series-master'],
  },
];

/**
 * Printable cut-out sticker token definitions for the 'stamp-sheet' layout.
 */
export const PRINTABLE_STICKER_TOKENS = [
  { id: 'tok-1', title: 'READ IT!', subtitle: 'Finished Book', icon: 'check', badgeClass: 'lr-stamp-emerald', symbol: '✓' },
  { id: 'tok-2', title: 'FAVORITE', subtitle: '5 Stars Loved', icon: 'heartFilled', badgeClass: 'lr-stamp-rose', symbol: '❤️' },
  { id: 'tok-3', title: 'GOLD STAR', subtitle: 'Story Master', icon: 'starFilled', badgeClass: 'lr-stamp-amber', symbol: '★' },
  { id: 'tok-4', title: 'WIZARD', subtitle: 'Spellbound Read', icon: 'sparkles', badgeClass: 'lr-stamp-purple', symbol: '✨' },
  { id: 'tok-5', title: 'EXPLORER', subtitle: 'Discovery Trip', icon: 'compass', badgeClass: 'lr-stamp-indigo', symbol: '🧭' },
  { id: 'tok-6', title: 'NIGHT OWL', subtitle: 'Bedtime Read', icon: 'moon', badgeClass: 'lr-stamp-sky', symbol: '🌙' },
  { id: 'tok-7', title: 'CHAMPION', subtitle: 'Grand Reader', icon: 'award', badgeClass: 'lr-stamp-yellow', symbol: '🏆' },
  { id: 'tok-8', title: 'SUPER SMILE', subtitle: 'Fun & Giggles', icon: 'sparkles', badgeClass: 'lr-stamp-amber', symbol: '😄' },
  { id: 'tok-9', title: 'PAW PRINT', subtitle: 'Animal Friend', icon: 'book', badgeClass: 'lr-stamp-teal', symbol: '🐾' },
  { id: 'tok-10', title: 'ROCKET', subtitle: 'Fast Reader', icon: 'compass', badgeClass: 'lr-stamp-rose', symbol: '🚀' },
  { id: 'tok-11', title: 'HONOR MEDAL', subtitle: 'Great Effort', icon: 'award', badgeClass: 'lr-stamp-amber', symbol: '🎖️' },
  { id: 'tok-12', title: 'STORY QUEST', subtitle: 'New Horizon', icon: 'book', badgeClass: 'lr-stamp-indigo', symbol: '📖' },
];
