/**
 * @fileoverview Deterministic, zero-latency Local Rule-Based Tagging & Reading-Level Hint Engine
 * for children's literature (English, Spanish, Italian, and major European languages).
 * Extracts normalized themes/topics (holidays, seasons, nature, animals, STEM, emotions/SEL,
 * bedtime, rhyme), refines age/stage bands from explicit cues, and generates parent-friendly
 * reading level hints completely offline.
 */

/**
 * Strips Unicode combining diacritics (e.g. `á -> a`, `ñ -> n`, `ù -> u`) for accent-safe matching.
 * @param {string} value
 * @returns {string}
 */
export function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** @type {Set<string>} */
const NOISE_WORDS = new Set([
  'juvenile',
  'fiction',
  'nonfiction',
  'non-fiction',
  'general',
  'children',
  'childrens',
  "children's",
  'books',
  'book',
  'literature',
  'stories',
  'story',
  'picture books',
  'picture book',
  'juvenile fiction',
  'juvenile literature',
  'english',
  'american',
  'united states',
  'readers',
  'easy',
  'hardcover',
  'paperback',
  'board book',
  // Spanish generic catalog descriptors
  'infantil',
  'infantiles',
  'juvenil',
  'ficcion',
  'ficcion infantil',
  'literatura infantil',
  'cuentos',
  'cuento',
  'cuentos infantiles',
  'libros',
  'libro',
  'narrativa',
  'album',
  'album ilustrado',
  'ilustrado',
  'ilustrados',
  'tapa dura',
  'tapa blanda',
  'rustica',
  'cartone',
  'edicion',
  // Italian generic catalog descriptors
  'bambini',
  'ragazzi',
  'libri per bambini',
  'libri',
  'storie',
  'storia',
  'albo',
  'albo illustrato',
  'albi illustrati',
  'illustrati',
  'copertina rigida',
  'copertina flessibile',
  'brossura',
  'cartonato',
  'edizione',
]);

/**
 * Curated multilingual children's book taxonomy rules ordered by specificity.
 * Patterns run against diacritic-stripped text (`stripDiacritics`).
 * @type {Array<{ tag: string, pattern: RegExp }>}
 */
export const TAXONOMY_RULES = [
  // Holidays & Cultural Celebrations
  {
    tag: 'christmas',
    pattern:
      /\b(christmas|santa|reindeer|nutcracker|nativity|yuletide|xmas|stocking|sleigh|grinch|polar express|navidad|nochebuena|reyes magos|papa noel|natale|babbo natale|befana)\b/i,
  },
  {
    tag: 'halloween',
    pattern:
      /\b(halloween|pumpkin|jack-o-lantern|trick-or-treat|spooky|witch|ghosts?|monster mash|calabaza|brujas?|fantasmas?|zucca|streghe|strega)\b/i,
  },
  {
    tag: 'hanukkah',
    pattern: /\b(hanukkah|chanukah|menorah|dreidel|latkes?|januca)\b/i,
  },
  {
    tag: 'valentines',
    pattern: /\b(valentine|valentines|sweetheart|san valentin|san valentino)\b/i,
  },
  {
    tag: 'holidays',
    pattern:
      /\b(holiday|holidays|festive|celebration|diwali|eid|lunar new year|easter|passover|thanksgiving|pascua|pasqua|fiestas?)\b/i,
  },

  // Seasons & Weather
  {
    tag: 'winter',
    pattern:
      /\b(winter|snow|snowy|snowflake|snowman|blizzard|frost|icicle|sled|sledding|mitten|mittens|invierno|nieve|copo de nieve|muneco de nieve|inverno|neve|fiocco di neve|pupazzo di neve)\b/i,
  },
  {
    tag: 'autumn',
    pattern:
      /\b(autumn|harvest|acorn|acorns|falling leaves|apple picking|otono|bellotas?|hojas de otono|autunno|ghiande|foglie)\b/i,
  },
  {
    tag: 'spring',
    pattern:
      /\b(springtime|blossom|sprout|puddle|raindrop|caterpillar|hatching|primavera|oruga|bruco)\b/i,
  },
  {
    tag: 'summer',
    pattern:
      /\b(summertime|sunshine|camping|fireflies|firefly|picnic|popsicle|verano|vacaciones de verano|luciérnagas|luciernagas|estate|lucciole)\b/i,
  },
  {
    tag: 'seasons',
    pattern:
      /\b(season|seasons|four seasons|solstice|equinox|estaciones del ano|cuatro estaciones|stagioni|quattro stagioni)\b/i,
  },

  // Nature, Animals & Ecosystems
  {
    tag: 'animals',
    pattern:
      /\b(animals?|bears?|owls?|dogs?|pupp(?:y|ies)|cats?|kittens?|fox(?:es)?|birds?|frogs?|toads?|rabbits?|bunn(?:y|ies)|ducks?|ducklings?|elephants?|lions?|tigers?|monkeys?|mice|mouse|otters?|penguins?|wolves|wolf|badgers?|squirrels?|wildlife|animales|animali|osos?|orsi|orso|buhos?|lechuzas?|gufi|gufo|perros?|perrito|cani|cane|cuccioli|gatos?|gatito|gatti|gatto|zorros?|volpi|volpe|pajaros?|aves|uccelli|ranas?|rane|conejos?|conejito|conigli|coniglio|patos?|anatre|elefantes?|elefanti|leones?|leoni|raton|ratones|topi|topolino|pinguinos?|pinguini|lobos?|lupi|lupo|ardillas?|scoiattoli)\b/i,
  },
  {
    tag: 'dinosaurs',
    pattern:
      /\b(dinosaurs?|dino|t-rex|tyrannosaurus|triceratops|stegosaurus|velociraptor|prehistoric|fossils?|dinosaurios?|dinosauri|prehistoria|preistoria)\b/i,
  },
  {
    tag: 'ocean',
    pattern:
      /\b(ocean|sea|sharks?|whales?|dolphins?|octopus|coral|reef|marine|beach|tide|underwater|fish|turtle|oceano|mar|mare|tiburones?|squali|ballenas?|balene|delfines?|delfini|pulpo|polpo|playa|spiaggia|peces|pesci|tartaruga|tortugas?)\b/i,
  },
  {
    tag: 'insects',
    pattern:
      /\b(insects?|bugs?|butterfl(?:y|ies)|bees?|ants?|beetles?|ladybugs?|spiders?|cricket|insectos|insetti|mariposas?|farfalle|farfalla|abejas?|api|formiche|hormigas?|mariquita|coccinella)\b/i,
  },
  {
    tag: 'nature',
    pattern:
      /\b(nature|forest|trees?|woods|woodland|garden|plants?|flowers?|seeds?|meadow|mountains?|river|wilderness|outdoors?|blueberr(?:y|ies)|naturaleza|natura|bosque|bosques|bosco|arboles|alberi|jardin|giardino|plantas|piante|flores|fiori|semillas|semi|montana|montagna|rio|fiume)\b/i,
  },
  {
    tag: 'farm',
    pattern:
      /\b(farm|barnyard|tractor|rooster|barn|cows?|pigs?|sheep|chickens?|granja|fattoria|vacas?|mucca|cerdos?|maiali|ovejas?|pecore|gallinas?|galline)\b/i,
  },

  // STEM, Space, Vehicles & Early Concepts
  {
    tag: 'space',
    pattern:
      /\b(space|planets?|astronauts?|moon|rockets?|stars?|galaxy|solar system|mars|cosmos|apollo|nasa|espacio|spazio|planetas?|pianeti|astronautas?|astronauti|luna|cohetes?|razzi|estrellas?|stelle|sistema solar|sistema solare)\b/i,
  },
  {
    tag: 'inventors',
    pattern:
      /\b(inventors?|inventions?|makers?|engineers?|engineering|architect|tinker|ada twist|rosie revere|iggy peck|inventores?|inventos?|invenzioni|inventori|ingegneria|ingenieria)\b/i,
  },
  {
    tag: 'science',
    pattern:
      /\b(science|scientists?|stem|experiments?|discover(?:y|ies)|biology|physics|chemistry|robotics|robots?|curiosity|ciencia|cientificos?|scienza|scienziati|experimentos?|esperimenti|curiosidad|curiosita)\b/i,
  },
  {
    tag: 'vehicles',
    pattern:
      /\b(trains?|trucks?|construction|excavator|bulldozer|vehicles?|cars?|airplanes?|tractors?|boats?|submarines?|fire engine|vehiculos|veicoli|tren|trenes|treno|treni|camion|camiones|excavadora|ruspa|coches?|automobili|macchine|aviones?|aerei|barcos?|navi|bomberos|pompieri)\b/i,
  },
  {
    tag: 'counting',
    pattern:
      /\b(counting|numbers?|1-2-3|123|math|addition|shapes|contar|numeros|matematicas|formas|contare|numeri|matematica|forme)\b/i,
  },
  {
    tag: 'alphabet',
    pattern:
      /\b(alphabet|abcs?|letters|phonics|chicka chicka|abecedario|alfabeto|letras|lettere)\b/i,
  },

  // Bedtime, SEL, Relationships & Literary Craft
  {
    tag: 'bedtime',
    pattern:
      /\b(bedtime|sleep|sleeping|sleepy|goodnight|good night|dreams?|dreaming|lullab(?:y|ies)|pajamas|naptime|nighttime|night|dormir|hora de dormir|buenas noches|suenos?|sonar|pijama|noche|buonanotte|nanna|sogni|sognare|dormire|pigiama|notte)\b/i,
  },
  {
    tag: 'rhyme',
    pattern:
      /\b(rhymes?|rhyming|verse|poetry|poems?|songs?|sing-along|cadence|dr\.?\s*seuss|rimas?|poesia|poemas?|canciones|filastrocche|filastrocca|poesie|rima|canzoni)\b/i,
  },
  {
    tag: 'humor',
    pattern:
      /\b(humor|humorous|funny|silly|laugh|laughter|giggle|hilarious|jokes?|tacos?|underpants|pigeon|divertido|divertente|risa|risas|ridere|umorismo|chistes)\b/i,
  },
  {
    tag: 'feelings',
    pattern:
      /\b(feelings?|emotions?|angry|worry|worried|anxious|brave|courage|calm|mindfulness|grumpy|sad|happy|empathy|emociones|sentimientos|miedo|rabia|enfado|triste|tristeza|feliz|alegria|valiente|calma|empatia|emozioni|sentimenti|paura|rabbia|tristezza|felicita|coraggio|gentilezza)\b/i,
  },
  {
    tag: 'friendship',
    pattern:
      /\b(friends?|friendship|sharing|kindness|cooperation|together|helpful|belonging|amigos?|amistad|compartir|amabilidad|juntos|amici|amicizia|condividere|insieme)\b/i,
  },
  {
    tag: 'family',
    pattern:
      /\b(family|families|mother|mama|mommy|father|papa|daddy|parents?|siblings?|sisters?|brothers?|grandma|grandmother|grandpa|grandfather|baby|familia|familias|madre|padre|padres|hermanos?|hermanas?|abuela|abuelo|abuelos|bebe|famiglia|famiglie|mamma|genitori|fratelli|fratello|sorelle|sorella|nonna|nonno|nonni|neonato)\b/i,
  },
  {
    tag: 'adventure',
    pattern:
      /\b(adventures?|journey|quest|explore|exploring|dragons?|pirates?|treasure|island|wild things|mystery|aventuras?|viaje|explorar|dragones?|piratas?|tesoro|isla|monstruos?|misterio|avventura|avventure|viaggio|esplorare|draghi|drago|pirati|isola|mostri|mostro|mistero)\b/i,
  },
  {
    tag: 'fairy-tales',
    pattern:
      /\b(fairy tales?|folktales?|fables?|folklore|magic|magical|castle|princess|myth|legend|cuentos de hadas|fabulas?|magia|magico|castillo|princesa|leyenda|fiabe|fiaba|favole|favola|castello|principessa|leggenda)\b/i,
  },
  {
    tag: 'art-music',
    pattern:
      /\b(art|artist|painting|drawing|crayon|colors?|music|musical|orchestra|jazz|dance|dancing|arte|artista|pintura|dibujo|colores|musica|baile|bailar|danza|pittura|disegno|colori|ballare)\b/i,
  },
  {
    tag: 'food',
    pattern:
      /\b(food|cooking|baking|kitchen|soup|bread|cookies?|pizza|feast|hungry|comida|cocina|cocinar|sopa|pan|galletas|cibo|cucina|cucinare|zuppa|pane|biscotti)\b/i,
  },
  {
    tag: 'history',
    pattern:
      /\b(history|historical|biography|biographies|true story|civil rights|pioneer|historia|biografia|biografias|storia vera|biografie)\b/i,
  },
  {
    tag: 'interactive',
    pattern:
      /\b(lift-the-flap|touch-and-feel|pop-up|peek-a-boo|flaps?|sound book|sensory|solapas?|alette|tattile|sonoro)\b/i,
  },
  {
    tag: 'school',
    pattern:
      /\b(school|kindergarten|preschool|classroom|teacher|first day|backpack|escuela|colegio|scuola|maestra)\b/i,
  },
  {
    tag: 'classic',
    pattern:
      /\b(classic|caldecott|newbery|beloved|treasury|timeless|clasico|classico)\b/i,
  },
];

/** @type {Set<string>} */
export const VALID_READING_STAGES = new Set([
  'board-toddler',
  'picture-book',
  'early-reader',
  'chapter-book',
]);

/**
 * Escapes regex special characters inside a literal keyword/phrase.
 * @param {string} raw
 * @returns {string}
 */
function escapeRegexLiteral(raw) {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles an array of plain-text keywords into a single diacritic-stripped, case-insensitive
 * whole-word/phrase RegExp without risking invalid regex syntax from user input.
 * @param {string[]} keywords
 * @returns {RegExp | null}
 */
export function buildSafeKeywordRegex(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return null;
  const parts = [];
  for (const kw of keywords) {
    const cleaned = stripDiacritics(String(kw || ''))
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!cleaned) continue;
    const escaped = escapeRegexLiteral(cleaned).replace(/\s+/g, '\\s+');
    parts.push(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
  }
  if (parts.length === 0) return null;
  try {
    return new RegExp(`(?:${parts.join('|')})`, 'gi');
  } catch (_) {
    return null;
  }
}

/**
 * Extracts readable keyword examples from a built-in TAXONOMY_RULES RegExp for display in Settings.
 * @param {RegExp} pattern
 * @returns {string[]}
 */
export function extractDefaultKeywordsFromRule(pattern) {
  const src = String(pattern?.source || '')
    .replace(/^\\b\(/, '')
    .replace(/\)\\b$/, '')
    .replace(/^\(/, '')
    .replace(/\)$/, '');
  if (!src) return [];
  return src
    .split('|')
    .map((token) =>
      token
        .replace(/\(\?:([^)|]+)\|([^)]+)\)/g, '$1')
        .replace(/\\\.\\s\*/g, '. ')
        .replace(/\\s\*/g, ' ')
        .replace(/\\\+/g, '+')
        .replace(/\?/g, '')
        .replace(/\\b/g, '')
        .trim()
    )
    .filter((token) => token && token.length >= 2 && !/[()[\]\\]/.test(token));
}

/**
 * Returns structured metadata for all built-in taxonomy rules merged with optional user overrides.
 * @param {import('../../types/models.js').TaggingRulesConfig | null | undefined} [ruleConfig]
 */
export function getBuiltInTaxonomyRuleCatalog(ruleConfig) {
  const disabledSet = new Set((ruleConfig?.disabledBuiltInTags || []).map((t) => String(t).toLowerCase()));
  const extraMap = ruleConfig?.extraKeywordsByTag || {};
  return TAXONOMY_RULES.map((rule) => ({
    tag: rule.tag,
    enabled: !disabledSet.has(rule.tag),
    defaultKeywords: extractDefaultKeywordsFromRule(rule.pattern),
    extraKeywords: Array.isArray(extraMap[rule.tag]) ? [...extraMap[rule.tag]] : [],
  }));
}

/**
 * Normalizes a single candidate tag into a clean lowercase token (`a-z0-9` + single hyphens),
 * preserving accented Spanish/Italian letters as clean ASCII equivalents (`música` -> `musica`).
 * Returns empty string if the tag is noise or invalid.
 *
 * @param {unknown} rawTag
 * @param {Set<string>} [extraNoiseSet]
 * @returns {string}
 */
export function sanitizeTag(rawTag, extraNoiseSet) {
  if (typeof rawTag !== 'string') return '';
  const cleaned = stripDiacritics(rawTag)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (cleaned.length < 2 || cleaned.length > 24) return '';
  const spaced = cleaned.replace(/-/g, ' ');
  if (
    NOISE_WORDS.has(cleaned) ||
    NOISE_WORDS.has(spaced) ||
    (extraNoiseSet && (extraNoiseSet.has(cleaned) || extraNoiseSet.has(spaced)))
  ) {
    return '';
  }
  if (/^\d+$/.test(cleaned)) return '';
  return cleaned;
}

/**
 * Deduplicates and sanitizes an array of candidate tags up to `maxTags`.
 *
 * @param {Iterable<unknown>} rawTags
 * @param {number} [maxTags]
 * @param {Set<string>} [extraNoiseSet]
 * @returns {string[]}
 */
export function sanitizeTagList(rawTags, maxTags = 8, extraNoiseSet) {
  /** @type {string[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();

  for (const item of rawTags) {
    const clean = sanitizeTag(item, extraNoiseSet);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= maxTags) break;
  }
  return out;
}

/**
 * Builds an optional Set of normalized extra noise words from TaggingRulesConfig.
 * @param {import('../../types/models.js').TaggingRulesConfig | null | undefined} ruleConfig
 * @returns {Set<string> | undefined}
 */
function buildExtraNoiseSet(ruleConfig) {
  const list = ruleConfig?.extraNoiseWords;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return new Set(
    list
      .map((w) => stripDiacritics(String(w || '')).trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Extracts normalized children's theme tags from title, authors, subjects, and summary prose.
 *
 * @param {{
 *   title?: string,
 *   authors?: string[],
 *   subjects?: string[],
 *   summary?: string,
 *   existingTags?: string[],
 *   maxTags?: number,
 *   taggingRules?: import('../../types/models.js').TaggingRulesConfig,
 *   separateCategories?: boolean
 * }} input
 * @returns {string[]}
 */
export function inferLocalTopicTags(input) {
  const maxTags = input.maxTags || 8;
  const subjects = Array.isArray(input.subjects) ? input.subjects : [];
  const existing = Array.isArray(input.existingTags) ? input.existingTags : [];
  const authors = Array.isArray(input.authors) ? input.authors : [];
  const ruleConfig = input.taggingRules;
  const extraNoiseSet = buildExtraNoiseSet(ruleConfig);
  const disabledSet = new Set(
    (ruleConfig?.disabledBuiltInTags || []).map((t) => String(t || '').toLowerCase())
  );
  const extraKeywordsMap = ruleConfig?.extraKeywordsByTag || {};
  const customRules = Array.isArray(ruleConfig?.customRules) ? ruleConfig.customRules : [];

  const corpus = stripDiacritics(
    [
      input.title || '',
      authors.join(' '),
      subjects.join(' '),
      input.summary || '',
    ].join(' ')
  );

  /** @type {string[]} */
  const matchedTaxonomy = [];
  for (const rule of TAXONOMY_RULES) {
    if (disabledSet.has(rule.tag)) continue;
    let matched = rule.pattern.test(corpus);
    if (!matched) {
      const extraKeywords = extraKeywordsMap[rule.tag];
      const extraRegex = extraKeywords ? buildSafeKeywordRegex(extraKeywords) : null;
      if (extraRegex && extraRegex.test(corpus)) {
        matched = true;
      }
    }
    if (matched) {
      matchedTaxonomy.push(rule.tag);
    }
  }

  for (const customRule of customRules) {
    if (!customRule || !customRule.tag || !Array.isArray(customRule.keywords)) continue;
    const customRegex = buildSafeKeywordRegex(customRule.keywords);
    if (customRegex && customRegex.test(corpus)) {
      matchedTaxonomy.push(customRule.tag);
    }
  }

  // Extract clean concise subject tokens for niche topics only when not keeping raw categories separate
  /** @type {string[]} */
  const subjectExtras = [];
  if (!input.separateCategories) {
    for (const rawSubject of subjects) {
      const parts = String(rawSubject).split(/[\/—–,;:|]/);
      for (const part of parts) {
        const clean = sanitizeTag(part, extraNoiseSet);
        if (clean && clean.split('-').length <= 2) {
          subjectExtras.push(clean);
        }
      }
    }
  }

  // Preserve explicit existing tags first, then high-precision taxonomy rules, then optional subject extras
  return sanitizeTagList([...existing, ...matchedTaxonomy, ...subjectExtras], maxTags, extraNoiseSet);
}

/**
 * Refines age range (`ageMin`, `ageMax`) and `readingStage` using explicit text cues (EN/ES/IT),
 * format, and page count.
 *
 * @param {{
 *   hints?: string[],
 *   pageCount?: number,
 *   format?: import('../../types/models.js').BookFormat,
 *   fallbackAgeMin?: number,
 *   fallbackAgeMax?: number,
 *   fallbackStage?: import('../../types/models.js').ReadingStage,
 *   autoInferAgeRange?: boolean
 * }} input
 * @returns {{ ageMin?: number, ageMax?: number, readingStage: import('../../types/models.js').ReadingStage }}
 */
export function inferAgeAndStageFromSignals(input) {
  const joined = stripDiacritics((input.hints || []).join(' ')).toLowerCase();
  const format = input.format || 'hardcover';
  const pageCount = input.pageCount;
  const allowHeuristicAges = input.autoInferAgeRange !== false;

  // Check explicit "ages X-Y", "de X a Y años", "da X a Y anni", "X-Y anni", or "0+" / "3+" / "+3 años" cues
  const explicitRange =
    joined.match(/\bages?\s*(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})\b/i) ||
    joined.match(/\b(?:de|da)\s*(\d{1,2})\s*(?:a|[-–—])\s*(\d{1,2})\s*(?:anos|anni)\b/i) ||
    joined.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:anos|anni)\b/i);

  const explicitPlus = !explicitRange
    ? joined.match(/\b(?:ages?|edad|eta|from|desde|da)\s*\+?\s*(\d{1,2})\s*\+(?:\s*(?:yrs?|years?|anos|anni))?/i) ||
      joined.match(/(?:^|[\s(\/·,])(\d{1,2})\s*\+(?:\s*(?:yrs?|years?|anos|anni))?(?=$|[\s).,;\/])/i) ||
      joined.match(/\b\+(\d{1,2})\s*(?:anos|anni|yrs?|years?)\b/i)
    : null;

  let explicitMin = explicitRange ? Math.max(0, Math.min(18, Number(explicitRange[1]))) : null;
  let explicitMax = explicitRange ? Math.max(1, Math.min(99, Number(explicitRange[2]))) : null;

  if (explicitPlus && Number.isFinite(Number(explicitPlus[1]))) {
    const plusVal = Math.max(0, Math.min(18, Number(explicitPlus[1])));
    explicitMin = plusVal;
    explicitMax = 99;
  }

  /** @type {import('../../types/models.js').ReadingStage} */
  let readingStage = 'picture-book';
  if (
    format === 'board-book' ||
    /\b(baby|infant|toddler|board\s*book|ages?\s*0|0-3|1-3|bebes?|primera infancia|libro de carton|todo carton|primi passi|cartonato)\b/.test(
      joined
    )
  ) {
    readingStage = 'board-toddler';
  } else if (
    /\b(middle grade|chapter book|novel|ages?\s*8-12|ages?\s*9-12|novela infantil|narrativa juvenil)\b/.test(
      joined
    ) ||
    (pageCount && pageCount >= 96)
  ) {
    readingStage = 'chapter-book';
  } else if (
    /\b(early reader|beginning reader|beginner books|i can read|step into reading|level\s*[123]\s*reader|ages?\s*5-8|ages?\s*6-8|primeros lectores|prime letture)\b/.test(
      joined
    ) ||
    (pageCount && pageCount >= 58 && pageCount < 96)
  ) {
    readingStage = 'early-reader';
  } else if (explicitMin !== null && explicitMax !== null && explicitMax >= explicitMin) {
    if (explicitMax <= 3 || (explicitMax >= 99 && explicitMin <= 1)) readingStage = 'board-toddler';
    else if (explicitMin >= 8) readingStage = 'chapter-book';
    else if (explicitMin >= 5) readingStage = 'early-reader';
  } else if (input.fallbackStage && VALID_READING_STAGES.has(input.fallbackStage)) {
    readingStage = input.fallbackStage;
  }

  if (explicitMin !== null && explicitMax !== null && explicitMax >= explicitMin) {
    return { ageMin: explicitMin, ageMax: explicitMax, readingStage };
  }

  if (
    typeof input.fallbackAgeMin === 'number' &&
    typeof input.fallbackAgeMax === 'number'
  ) {
    return {
      ageMin: input.fallbackAgeMin,
      ageMax: Math.max(input.fallbackAgeMin, input.fallbackAgeMax),
      readingStage,
    };
  }

  if (!allowHeuristicAges) {
    return { ageMin: undefined, ageMax: undefined, readingStage };
  }

  if (readingStage === 'board-toddler') {
    return { ageMin: 1, ageMax: 4, readingStage };
  }
  if (readingStage === 'chapter-book') {
    return { ageMin: 7, ageMax: 11, readingStage };
  }
  if (readingStage === 'early-reader') {
    return { ageMin: 5, ageMax: 8, readingStage };
  }
  return { ageMin: 3, ageMax: 7, readingStage: 'picture-book' };
}

/**
 * Generates a concise, parent-friendly reading level and read-aloud pacing hint.
 *
 * @param {{
 *   readingStage: import('../../types/models.js').ReadingStage,
 *   format?: import('../../types/models.js').BookFormat,
 *   pageCount?: number,
 *   tags?: string[],
 *   textCorpus?: string
 * }} input
 * @returns {string}
 */
export function inferReadingLevelHint(input) {
  const tags = new Set(input.tags || []);
  const corpus = stripDiacritics(input.textCorpus || '').toLowerCase();
  const pages = input.pageCount && input.pageCount > 0 ? input.pageCount : undefined;
  const hasRhyme = tags.has('rhyme') || /\b(rhym(e|ing)|rimas?|filastrocche)\b/.test(corpus);
  const isNonfiction =
    tags.has('science') ||
    tags.has('history') ||
    tags.has('inventors') ||
    /\b(true story|biography|nonfiction|biografia|storia vera)\b/.test(corpus);

  switch (input.readingStage) {
    case 'board-toddler': {
      const style = hasRhyme ? 'Rhyming cadence' : 'Durable pages';
      return `Sensory & Lap Read-Aloud · ${style} · ~2–4 min`;
    }
    case 'early-reader': {
      if (isNonfiction) {
        return 'Transitional Early Reader · Narrative nonfiction · ~6–8 min';
      }
      if (hasRhyme) {
        return 'Transitional Early Reader · Rhyming verse · ~5–7 min';
      }
      return 'Transitional Early Reader · Short decodable sentences · ~5–8 min';
    }
    case 'chapter-book': {
      const pageDetail = pages ? `~${pages} pp` : 'Multi-chapter';
      return `Independent or Serialized Read-Aloud · ${pageDetail}`;
    }
    case 'picture-book':
    default: {
      if (pages && pages >= 48) {
        return 'Extended Storytime Read-Aloud · ~8–10 min';
      }
      if (hasRhyme) {
        return 'Storytime Read-Aloud · Rhyming cadence · ~4–6 min';
      }
      if (isNonfiction) {
        return 'Illustrated Nonfiction Read-Aloud · ~6–8 min';
      }
      return 'Storytime Read-Aloud · Rich illustrations · ~5–7 min';
    }
  }
}

/**
 * Enriches a partial or full Book / BookCandidate using purely local deterministic rules.
 *
 * @param {{
 *   title: string,
 *   authors?: string[],
 *   format?: import('../../types/models.js').BookFormat,
 *   pageCount?: number,
 *   ageMin?: number,
 *   ageMax?: number,
 *   readingStage?: import('../../types/models.js').ReadingStage,
 *   readingLevelHint?: string,
 *   tags?: string[],
 *   summary?: string,
 *   subjects?: string[],
 *   notes?: string,
 *   edition?: string,
 *   language?: string,
 *   bookNotes?: import('../../types/models.js').BookNote[]
 * }} bookInput
 * @param {{
 *   maxTags?: number,
 *   preserveExplicitAgeAndStage?: boolean,
 *   taggingRules?: import('../../types/models.js').TaggingRulesConfig,
 *   autoInferAgeRange?: boolean,
 *   separateCategories?: boolean
 * }} [options]
 * @returns {{
 *   tags: string[],
 *   addedTags: string[],
 *   ageMin?: number,
 *   ageMax?: number,
 *   readingStage: import('../../types/models.js').ReadingStage,
 *   readingLevelHint: string
 * }}
 */
export function enrichBookWithLocalRules(bookInput, options = {}) {
  const maxTags = options.maxTags || 14;
  const ruleConfig = options.taggingRules;
  const extraNoiseSet = buildExtraNoiseSet(ruleConfig);
  const existingSanitized = sanitizeTagList(bookInput.tags || [], maxTags, extraNoiseSet);
  const existingSet = new Set(existingSanitized);

  const noteTexts = Array.isArray(bookInput.bookNotes)
    ? bookInput.bookNotes.map((/** @type {import('../../types/models.js').BookNote} */ n) => n?.text || '').filter(Boolean)
    : [];
  const enrichedSummary = [
    bookInput.summary || '',
    bookInput.notes || '',
    ...noteTexts,
    bookInput.edition || '',
  ]
    .filter(Boolean)
    .join(' ');

  const inferred = inferLocalTopicTags({
    title: bookInput.title,
    authors: bookInput.authors,
    subjects: bookInput.subjects,
    summary: enrichedSummary,
    existingTags: existingSanitized,
    maxTags,
    taggingRules: ruleConfig,
    separateCategories: Boolean(options.separateCategories),
  });

  // Include non-English language tag or structural baseline tag if no topic matched
  const extraRuleTags = [];
  const rawLang = sanitizeTag(String(bookInput.language || ''), extraNoiseSet);
  if (rawLang && rawLang !== 'en' && rawLang !== 'english') {
    extraRuleTags.push(rawLang);
  }

  let tags = sanitizeTagList([...inferred, ...extraRuleTags], maxTags, extraNoiseSet);

  const hints = [
    bookInput.title || '',
    ...(bookInput.subjects || []),
    enrichedSummary,
  ];

  const ageAndStage =
    options.preserveExplicitAgeAndStage &&
    typeof bookInput.ageMin === 'number' &&
    typeof bookInput.ageMax === 'number' &&
    bookInput.readingStage
      ? {
          ageMin: bookInput.ageMin,
          ageMax: Math.max(bookInput.ageMin, bookInput.ageMax),
          readingStage: bookInput.readingStage,
        }
      : inferAgeAndStageFromSignals({
          hints,
          pageCount: bookInput.pageCount,
          format: bookInput.format,
          fallbackAgeMin: bookInput.ageMin,
          fallbackAgeMax: bookInput.ageMax,
          fallbackStage: bookInput.readingStage,
          autoInferAgeRange: options.autoInferAgeRange,
        });

  if (tags.length === existingSanitized.length && tags.length < 3) {
    const structuralFallback =
      bookInput.format === 'board-book' || ageAndStage.readingStage === 'board-toddler'
        ? 'toddler-read'
        : ageAndStage.readingStage === 'chapter-book' ||
            ageAndStage.readingStage === 'middle-grade' ||
            ageAndStage.readingStage === 'teen-ya'
          ? 'chapter-read'
          : 'storytime';
    tags = sanitizeTagList([...tags, structuralFallback], maxTags, extraNoiseSet);
  }

  const addedTags = tags.filter((t) => !existingSet.has(t));

  const readingLevelHint =
    bookInput.readingLevelHint && bookInput.readingLevelHint.trim()
      ? bookInput.readingLevelHint.trim()
      : inferReadingLevelHint({
          readingStage: ageAndStage.readingStage,
          format: bookInput.format,
          pageCount: bookInput.pageCount,
          tags,
          textCorpus: hints.join(' '),
        });

  return {
    tags,
    addedTags,
    ...(typeof ageAndStage.ageMin === 'number' ? { ageMin: ageAndStage.ageMin } : {}),
    ...(typeof ageAndStage.ageMax === 'number' ? { ageMax: ageAndStage.ageMax } : {}),
    readingStage: ageAndStage.readingStage,
    readingLevelHint,
  };
}

/**
 * Explains exactly which built-in and custom tagging rules matched on a book/text sample.
 * Used by the Settings "Matching Rules & Weights" live tester.
 *
 * @param {{
 *   title?: string,
 *   authors?: string[],
 *   subjects?: string[],
 *   summary?: string,
 *   format?: import('../../types/models.js').BookFormat,
 *   pageCount?: number,
 *   language?: string
 * }} bookInput
 * @param {import('../../types/models.js').TaggingRulesConfig | null | undefined} [ruleConfig]
 */
export function explainLocalTagMatches(bookInput, ruleConfig) {
  const disabledSet = new Set(
    (ruleConfig?.disabledBuiltInTags || []).map((t) => String(t || '').toLowerCase())
  );
  const extraKeywordsMap = ruleConfig?.extraKeywordsByTag || {};
  const customRules = Array.isArray(ruleConfig?.customRules) ? ruleConfig.customRules : [];

  const corpus = stripDiacritics(
    [
      bookInput.title || '',
      ...(Array.isArray(bookInput.authors) ? bookInput.authors : []),
      ...(Array.isArray(bookInput.subjects) ? bookInput.subjects : []),
      bookInput.summary || '',
    ].join(' ')
  );

  /** @type {Array<{ tag: string, source: 'builtin' | 'custom', matchedTerms: string[], enabled: boolean }>} */
  const ruleHits = [];

  for (const rule of TAXONOMY_RULES) {
    const globalRe = new RegExp(rule.pattern.source, 'gi');
    const builtInTerms = Array.from(corpus.matchAll(globalRe)).map((m) => m[0].toLowerCase());
    const extraRe = extraKeywordsMap[rule.tag]
      ? buildSafeKeywordRegex(extraKeywordsMap[rule.tag])
      : null;
    const extraTerms = extraRe
      ? Array.from(corpus.matchAll(extraRe)).map((m) => m[0].toLowerCase())
      : [];
    const matchedTerms = Array.from(new Set([...builtInTerms, ...extraTerms]));
    if (matchedTerms.length > 0) {
      ruleHits.push({
        tag: rule.tag,
        source: 'builtin',
        matchedTerms: matchedTerms.slice(0, 6),
        enabled: !disabledSet.has(rule.tag),
      });
    }
  }

  for (const custom of customRules) {
    const customRe = buildSafeKeywordRegex(custom.keywords || []);
    if (!customRe) continue;
    const matchedTerms = Array.from(
      new Set(Array.from(corpus.matchAll(customRe)).map((m) => m[0].toLowerCase()))
    );
    if (matchedTerms.length > 0) {
      ruleHits.push({
        tag: custom.tag,
        source: 'custom',
        matchedTerms: matchedTerms.slice(0, 6),
        enabled: true,
      });
    }
  }

  const enriched = enrichBookWithLocalRules(
    {
      title: bookInput.title || '',
      authors: bookInput.authors || [],
      subjects: bookInput.subjects || [],
      summary: bookInput.summary || '',
      format: bookInput.format,
      pageCount: bookInput.pageCount,
      language: bookInput.language,
    },
    { taggingRules: ruleConfig || undefined }
  );

  return {
    ...enriched,
    ruleHits,
  };
}

