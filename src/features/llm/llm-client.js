/**
 * @fileoverview Frontend LLM client for Library Rotation:
 * Coordinates the three LLM actions with quota-conscious prompt generation and BYOK support:
 * 1. Book Tagging: Extracts categorized tags (interactive formats, developmental themes, concepts) + freeform tags.
 * 2. Smart Rotation Assistant: Analyzes the library and desired rotation criteria to select matching books with explanations.
 * 3. Smart Library Recommendations: Identifies collection gaps or recommends next-read acquisitions based on reader profile.
 */

import { sanitizeTagList } from '../tagging/rule-tagger.js';
import { isBookRotatable } from '../../types/models.js';
import { queryLogger } from '../telemetry/query-logger.js';

export const INTERACTIVE_FORMAT_CATEGORIES = Object.freeze([
  { id: 'lift-the-flap', label: 'Lift-the-Flap' },
  { id: 'slide-and-see', label: 'Slide-and-See / Sliders' },
  { id: 'touch-and-feel', label: 'Touch & Feel / Textures' },
  { id: 'sound-music-book', label: 'Musical / Sound Book' },
  { id: 'pop-up', label: 'Pop-Up Book' },
  { id: 'puppet-book', label: 'Finger / Hand Puppet' },
  { id: 'board-book', label: 'Sturdy Board Book' },
  { id: 'bath-book', label: 'Waterproof / Bath Book' },
  { id: 'search-and-find', label: 'Search & Find / I-Spy' },
  { id: 'tabbed-book', label: 'Tabbed / Shaped Pages' },
]);

export const DEVELOPMENTAL_THEME_CATEGORIES = Object.freeze([
  { id: 'bedtime', label: 'Bedtime & Sleep' },
  { id: 'potty-training', label: 'Potty & Growing Up' },
  { id: 'feelings-emotions', label: 'Feelings & Emotions (SEL)' },
  { id: 'friendship-sharing', label: 'Friendship & Sharing' },
  { id: 'family', label: 'Family & Siblings' },
  { id: 'daily-routines', label: 'Daily Routines & Habits' },
  { id: 'kindness', label: 'Kindness & Empathy' },
  { id: 'mindfulness', label: 'Calm & Mindfulness' },
  { id: 'milestones', label: 'Starting School & Milestones' },
]);

export const CONCEPT_CATEGORIES = Object.freeze([
  { id: 'alphabet', label: 'Alphabet & Phonics' },
  { id: 'counting-numbers', label: 'Numbers & Counting' },
  { id: 'shapes', label: 'Shapes & Patterns' },
  { id: 'colors', label: 'Colors & Visuals' },
  { id: 'opposites', label: 'Opposites & Contrasts' },
  { id: 'first-words', label: 'First Words & Vocabulary' },
  { id: 'animals', label: 'Animals & Pets' },
  { id: 'nature', label: 'Nature & Seasons' },
  { id: 'space', label: 'Space & Astronomy' },
  { id: 'vehicles', label: 'Vehicles & Machines' },
  { id: 'dinosaurs', label: 'Dinosaurs & Fossils' },
  { id: 'science-stem', label: 'STEM & Everyday Science' },
  { id: 'food', label: 'Food & Cooking' },
  { id: 'art-music', label: 'Art, Music & Rhyme' },
]);

/**
 * Extracts and parses a JSON object or array from raw model text (tolerating markdown code fences).
 * @param {string} rawText
 * @returns {any}
 */
export function extractJsonFromText(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Try parsing directly first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Attempt to locate first JSON structure: object '{' or array '['
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket >= 0) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx >= 0 && endIdx > startIdx) {
      const candidate = cleaned.slice(startIdx, endIdx + 1);
      try {
        return JSON.parse(candidate);
      } catch (innerErr) {
        throw new Error(
          `Could not extract valid JSON from LLM output: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`
        );
      }
    }

    throw new Error('Could not extract valid JSON from LLM response.');
  }
}

/**
 * Checks if the backend server has a Gemini API key configured in its environment.
 */
export async function checkServerLlmStatus() {
  try {
    const res = await fetch('/api/llm/status');
    if (!res.ok) return { ok: false, serverKeyConfigured: false };
    return await res.json();
  } catch (_) {
    return { ok: false, serverKeyConfigured: false };
  }
}

/**
 * Sends a lightweight 5-token query to verify connection to the configured LLM provider.
 * @param {import('../../types/models.js').AppSettings} settings
 */
export async function testLlmConnection(settings) {
  const provider = settings.llmProvider || 'server-gemini';
  const payload = {
    task: 'test',
    prompt: 'Reply ONLY with JSON: {"status":"connected","provider":"ok"}',
    systemInstruction: 'You are a test probe. Respond with compact JSON.',
    provider,
    model: settings.llmModel || 'gemini-2.5-flash',
    endpointUrl:
      provider === 'cloudflare-worker'
        ? settings.llmCloudflareUrl
        : provider === 'byok-openai'
          ? settings.llmBaseUrl
          : '',
    apiKey: settings.llmApiKey || '',
    jsonMode: true,
  };

  const service = provider === 'byok-openai' ? 'openai' : 'gemini';
  const startTime = Date.now();

  try {
    const res = await fetch('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      try {
        queryLogger?.recordQuery?.({
          service,
          endpoint: `Connection Test (${payload.model})`,
          status: res.status,
          statusText: 'Invalid Response',
          latencyMs: Date.now() - startTime,
        });
      } catch (_) {}
      return {
        ok: false,
        error: 'INVALID_SERVER_RESPONSE',
        message: `Server returned non-JSON response (HTTP ${res.status}). If using a custom proxy or worker, verify the endpoint URL.`,
      };
    }

    try {
      queryLogger?.recordQuery?.({
        service,
        endpoint: `Connection Test (${data?.modelUsed || payload.model})`,
        status: res.ok && data?.ok ? 200 : res.status || 500,
        statusText: res.ok && data?.ok ? 'OK' : data?.error || 'Connection Failed',
        latencyMs: Date.now() - startTime,
        error: !data?.ok ? data?.message : undefined,
      });
    } catch (_) {}

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data?.error || 'CONNECTION_FAILED',
        message: data?.message || `HTTP ${res.status}: Connection failed.`,
      };
    }

    return {
      ok: true,
      message: `Successfully connected to ${data.modelUsed || payload.model} via ${data.providerUsed || provider}!`,
    };
  } catch (err) {
    try {
      queryLogger?.recordQuery?.({
        service,
        endpoint: `Connection Test (${payload.model})`,
        status: 0,
        statusText: 'Network Error',
        latencyMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (_) {}
    return {
      ok: false,
      error: 'NETWORK_ERROR',
      message: `Network error connecting to LLM service: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Dispatches an LLM query to /api/llm/generate with settings-based routing.
 * @param {import('../../types/models.js').AppSettings} settings
 * @param {Record<string, unknown>} queryParams
 */
async function dispatchLlmQuery(settings, queryParams) {
  const provider = settings.llmProvider || 'server-gemini';
  const service = provider === 'byok-openai' ? 'openai' : 'gemini';
  const taskName = String(queryParams.task || 'generate');
  const modelName = String(settings.llmModel || 'gemini-2.5-flash');
  const endpointLabel = `${taskName} (${modelName})`;
  const startTime = Date.now();

  const endpointUrl =
    provider === 'cloudflare-worker'
      ? settings.llmCloudflareUrl
      : provider === 'byok-openai'
        ? settings.llmBaseUrl
        : '';

  const body = {
    ...queryParams,
    provider,
    model: settings.llmModel || 'gemini-2.5-flash',
    endpointUrl,
    apiKey: settings.llmApiKey || '',
    jsonMode: queryParams.jsonMode !== false,
  };

  let res;
  let text = '';
  try {
    res = await fetch('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    text = await res.text();
  } catch (fetchErr) {
    try {
      queryLogger?.recordQuery?.({
        service,
        endpoint: endpointLabel,
        status: 0,
        statusText: 'Network Error',
        latencyMs: Date.now() - startTime,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    } catch (_) {}
    throw fetchErr;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    try {
      queryLogger?.recordQuery?.({
        service,
        endpoint: endpointLabel,
        status: res.status,
        statusText: 'Invalid JSON',
        latencyMs: Date.now() - startTime,
      });
    } catch (_) {}
    const error = new Error(
      `Server returned non-JSON response (HTTP ${res.status}). If using a custom proxy or worker, verify the endpoint URL.`
    );
    // @ts-ignore
    error.status = res.status;
    // @ts-ignore
    error.code = 'INVALID_SERVER_RESPONSE';
    throw error;
  }

  try {
    queryLogger?.recordQuery?.({
      service,
      endpoint: endpointLabel,
      status: res.ok && data?.ok ? 200 : res.status || 500,
      statusText: res.ok && data?.ok ? 'OK' : data?.error || 'Failed',
      latencyMs: Date.now() - startTime,
      error: !data?.ok ? data?.message : undefined,
    });
  } catch (_) {}

  if (!res.ok || !data.ok) {
    const error = new Error(data?.message || `LLM query failed (HTTP ${res.status})`);
    // @ts-ignore
    error.status = data?.status || res.status;
    // @ts-ignore
    error.code = data?.error;
    throw error;
  }

  return data;
}

/**
 * ACTION 1: Queries the LLM to categorize and tag a book record:
 * Returns both category-based tags (interactive format, developmental themes, concepts)
 * and curated free-form topical tags.
 *
 * @param {import('../../types/models.js').Book | Record<string, any>} book
 * @param {import('../../types/models.js').AppSettings} settings
 */
export async function queryBookCategorizedTags(book, settings) {
  const prompt = JSON.stringify({
    title: book.title,
    authors: book.authors || [],
    format: book.format || 'hardcover',
    pageCount: book.pageCount || null,
    publishedYear: book.publishedYear || null,
    existingTags: book.tags || [],
    summary: (/** @type {any} */ (book).summary || '').slice(0, 400),
    subjects: (/** @type {any} */ (book).subjects || []).slice(0, 8),
  });

  const formatList = INTERACTIVE_FORMAT_CATEGORIES.map((c) => c.id).join(', ');
  const themeList = DEVELOPMENTAL_THEME_CATEGORIES.map((c) => c.id).join(', ');
  const conceptList = CONCEPT_CATEGORIES.map((c) => c.id).join(', ');

  const systemInstruction = `You are a specialist children's book librarian cataloging books for young readers.
Analyze the provided book metadata and return a JSON object with:
1. "interactiveFormats": Array of applicable format/sensory tags selected ONLY from [${formatList}]. Omit if none apply.
2. "developmentalThemes": Array of emotional/social/routine tags selected ONLY from [${themeList}].
3. "concepts": Array of early learning concept tags selected ONLY from [${conceptList}].
4. "freeform": Array of 2 to 5 specific, high-value, lowercase hyphenated topic tags (e.g. "woodland-animals", "bedtime-rituals", "snowy-day", "ocean-creatures", "toddler-humor").
5. "readingStage": One of ["board-toddler", "picture-book", "early-reader", "chapter-book"].
6. "readingLevelHint": Concise read-aloud pacing note (e.g. "Sensory & Interactive · ~3–5 min" or "Storytime Read-Aloud · Rhyming verse · ~5–7 min").

Respond ONLY with valid JSON. Keep tags concise and normalized.`;

  const response = await dispatchLlmQuery(settings, {
    task: 'book-tagging',
    prompt: `Analyze and tag this children's book: ${prompt}`,
    systemInstruction,
    jsonMode: true,
  });

  const result = response.data || {};
  const interactiveFormats = sanitizeTagList(Array.isArray(result.interactiveFormats) ? result.interactiveFormats : [], 6);
  const developmentalThemes = sanitizeTagList(Array.isArray(result.developmentalThemes) ? result.developmentalThemes : [], 6);
  const concepts = sanitizeTagList(Array.isArray(result.concepts) ? result.concepts : [], 6);
  const freeform = sanitizeTagList(Array.isArray(result.freeform) ? result.freeform : [], 6);

  const combinedTags = sanitizeTagList(
    [...interactiveFormats, ...developmentalThemes, ...concepts, ...freeform],
    12
  );

  return {
    interactiveFormats,
    developmentalThemes,
    concepts,
    freeform,
    allTags: combinedTags,
    readingStage: result.readingStage || book.readingStage || 'picture-book',
    readingLevelHint: typeof result.readingLevelHint === 'string' ? result.readingLevelHint : '',
  };
}

/**
 * Formats and compacts a candidate books collection to minimize tokens and stay quota-friendly.
 * @param {import('../../types/models.js').Book[]} books
 * @param {number} [limit=45]
 * @param {Set<string>} [readBookIds]
 * @param {Set<string>} [activeBookIds]
 */
export function formatCompactCandidateBooks(
  books,
  limit = 45,
  readBookIds = new Set(),
  activeBookIds = new Set()
) {
  return (books || [])
    .filter((b) => !b.excludeFromRotations && b.collectionStatus !== 'wishlist')
    .slice(0, limit)
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.authors[0] || 'Unknown',
      format: b.format,
      age: `${b.ageMin ?? 1}-${b.ageMax ?? 6}`,
      stage: b.readingStage,
      tags: (b.tags || []).slice(0, 5),
      loved: Boolean(b.loved),
      read: readBookIds.has(b.id),
      onShelfNow: activeBookIds.has(b.id),
    }));
}

/**
 * ACTION 2: Smart Library Rotation Assistant
 * Takes library information and desired rotation criteria (description/objective, book count, reader age)
 * and returns the exact books from the library that should be included on the rotation, with reasons.
 *
 * @param {{
 *   libraryBooks: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   rules: { count: number, objective: string, requiredFormat?: string },
 *   rotations: import('../../types/models.js').RotationList[],
 *   settings: import('../../types/models.js').AppSettings
 * }} params
 */
export async function querySmartRotationPlan(params) {
  const { libraryBooks, profile, rules, rotations, settings } = params;
  const targetCount = Math.max(1, Math.min(20, Number(rules.count) || 5));

  // Filter to rotatable books
  const rotatableBooks = libraryBooks.filter((b) => isBookRotatable(b));
  if (rotatableBooks.length === 0) {
    throw new Error('No rotatable books available in the family library.');
  }

  // Active shelf book IDs to note
  const activeRotation = rotations.find((r) => r.profileId === profile.id && r.status === 'active');
  const activeBookIds = new Set(activeRotation ? activeRotation.bookIds : []);

  // Cooldown & read history
  const readBookIds = new Set(profile.readHistoryBookIds || []);

  // Compact candidates pool to at most 45 to be quota-friendly and fast
  // Sort candidate pool prioritizing unread books, matching themes, and off-shelf books
  const objectiveLower = (rules.objective || '').toLowerCase();
  const sortedCandidates = [...rotatableBooks].sort((a, b) => {
    // If objective mentions format or tags, boost matches
    const aMatch = (a.tags || []).some((t) => objectiveLower.includes(t)) || objectiveLower.includes(a.format);
    const bMatch = (b.tags || []).some((t) => objectiveLower.includes(t)) || objectiveLower.includes(b.format);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;

    // Boost books not currently on active shelf
    const aActive = activeBookIds.has(a.id);
    const bActive = activeBookIds.has(b.id);
    if (!aActive && bActive) return -1;
    if (aActive && !bActive) return 1;

    return 0;
  });

  const candidatesPool = formatCompactCandidateBooks(
    sortedCandidates,
    45,
    readBookIds,
    activeBookIds
  );

  const systemInstruction = `You are an expert children's librarian and rotation curator designing a balanced home bookshelf for a child reader.
Reader: ${profile.name}, Age ${profile.age} years old (${profile.readingStage}).
Favorite Topics: ${(profile.favoriteTopics || []).join(', ') || 'general children topics'}.
Target Shelf Count: ${targetCount} books.
${settings.llmCustomPromptHint ? `Parenting/Educational Focus: ${settings.llmCustomPromptHint}` : ''}

You MUST select exactly ${targetCount} books strictly from the provided candidate library.
Return a JSON object:
{
  "themeTitle": "Engaging 2-5 word shelf title",
  "curatorNote": "1-2 sentences explaining why this curated collection supports the child's development and variety.",
  "selectedBooks": [
    {
      "bookId": "exact string ID from candidates",
      "title": "book title",
      "reason": "Specific 1-sentence reason why this book fits this rotation objective and age ${profile.age}"
    }
  ]
}`;

  const userPrompt = JSON.stringify({
    desiredRotationObjective: rules.objective || 'Balanced developmental storytime rotation with variety',
    requiredFormatPreference: rules.requiredFormat && rules.requiredFormat !== 'any' ? rules.requiredFormat : 'any format',
    candidateBooksInLibrary: candidatesPool,
  });

  const response = await dispatchLlmQuery(settings, {
    task: 'rotation-curator',
    prompt: `Please select the best ${targetCount} books for this rotation: ${userPrompt}`,
    systemInstruction,
    jsonMode: true,
  });

  const data = response.data || {};
  const selectedList = Array.isArray(data.selectedBooks) ? data.selectedBooks : [];

  // Validate that selected IDs actually exist in library
  const libraryById = new Map(libraryBooks.map((b) => [b.id, b]));
  const validatedSelections = [];

  for (const item of selectedList) {
    if (item && item.bookId && libraryById.has(item.bookId)) {
      validatedSelections.push({
        bookId: item.bookId,
        book: libraryById.get(item.bookId),
        title: item.title || libraryById.get(item.bookId)?.title,
        reason: item.reason || 'Selected for developmental balance and variety.',
      });
    }
  }

  // Fallback: If LLM returned fewer than targetCount due to hallucinations, pad with top candidates
  if (validatedSelections.length < targetCount) {
    const selectedSet = new Set(validatedSelections.map((s) => s.bookId));
    for (const cand of candidatesPool) {
      if (!selectedSet.has(cand.id)) {
        const book = libraryById.get(cand.id);
        if (book) {
          validatedSelections.push({
            bookId: cand.id,
            book,
            title: book.title,
            reason: 'Selected to complete shelf count with balanced variety.',
          });
          selectedSet.add(cand.id);
          if (validatedSelections.length >= targetCount) break;
        }
      }
    }
  }

  return {
    themeTitle: data.themeTitle || rules.objective || 'Curated Rotation Shelf',
    curatorNote: data.curatorNote || `Carefully curated for ${profile.name} (Age ${profile.age}).`,
    selectedBooks: validatedSelections.slice(0, targetCount),
    modelUsed: response.modelUsed,
  };
}

/**
 * ACTION 3: Smart Library Recommendations
 * Passes current library information and asks for X book recommendations + reasons to:
 * - Fill missing gaps (interactive formats, missing themes, underrepresented topics)
 * - Provide similar books to what the reader already loves
 * - Support age progression & next developmental stages
 *
 * @param {{
 *   libraryBooks: import('../../types/models.js').Book[],
 *   profile: import('../../types/models.js').ChildProfile,
 *   goal: 'gaps' | 'similar-favorites' | 'next-stage' | 'custom',
 *   customPrompt?: string,
 *   count?: number,
 *   settings: import('../../types/models.js').AppSettings
 * }} params
 */
export async function queryLibraryRecommendations(params) {
  const { libraryBooks, profile, goal = 'gaps', customPrompt = '', count = 4, settings } = params;
  const targetCount = Math.max(2, Math.min(8, Number(count) || 4));

  // Compute compact summary of collection
  const totalBooks = libraryBooks.length;
  const lovedBooks = libraryBooks
    .filter((b) => b.loved)
    .map((b) => `"${b.title}" by ${b.authors[0] || 'Unknown'} (${(b.tags || []).slice(0, 3).join(', ')})`);

  // Count top topics in library
  const topicFrequency = /** @type {Record<string, number>} */ ({});
  for (const b of libraryBooks) {
    for (const t of b.tags || []) {
      topicFrequency[t] = (topicFrequency[t] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => `${topic} (${count})`);

  const formatCounts = {
    'board-book': libraryBooks.filter((b) => b.format === 'board-book').length,
    'hardcover': libraryBooks.filter((b) => b.format === 'hardcover').length,
    'paperback': libraryBooks.filter((b) => b.format === 'paperback').length,
  };

  const sampleTitles = libraryBooks.slice(0, 15).map((b) => `"${b.title}"`);

  let goalDescription = '';
  switch (goal) {
    case 'gaps':
      goalDescription = `Identify underrepresented genres, formats (e.g. lift-the-flap, sensory books), topics, or skill areas missing from the collection, and suggest ${targetCount} real, award-winning or beloved children's books that fill these gaps.`;
      break;
    case 'similar-favorites':
      goalDescription = `Based on the reader's favorite/loved books (${lovedBooks.join('; ') || sampleTitles.join('; ')}), suggest ${targetCount} new books with similar charm, storytelling style, or humor that the child will adore.`;
      break;
    case 'next-stage':
      goalDescription = `Recommend ${targetCount} bridge books that prepare ${profile.name} (currently Age ${profile.age}, ${profile.readingStage}) for the next developmental reading stage, with slightly richer narrative and vocabulary.`;
      break;
    case 'custom':
    default:
      goalDescription = customPrompt || `Recommend ${targetCount} wonderful children's books tailored for ${profile.name}.`;
      break;
  }

  const systemInstruction = `You are an acclaimed children's literature advisor and family library consultant.
You must recommend ${targetCount} REAL, published, widely available children's books. Do NOT invent fictional books.
Child Reader: ${profile.name}, Age ${profile.age} years old (${profile.readingStage}).
Favorite Topics: ${(profile.favoriteTopics || []).join(', ') || 'early childhood topics'}.
${settings.llmCustomPromptHint ? `Family Preferences: ${settings.llmCustomPromptHint}` : ''}

Goal: ${goalDescription}

Return ONLY valid JSON matching this schema:
{
  "summary": "1-2 sentences assessing the reader's current library and explaining the strategy behind these recommendations.",
  "recommendations": [
    {
      "title": "Exact Real Book Title",
      "author": "Author Full Name",
      "ageRange": "e.g. 2–5",
      "readingStage": "board-toddler | picture-book | early-reader | chapter-book",
      "category": "e.g. Interactive / Sensory or Bedtime / SEL or Nature / Science",
      "reason": "1-2 sentences explaining why this book resonates with ${profile.name}",
      "gapFilled": "Short phrase explaining what gap or growth it brings (e.g. 'Adds tactile flap exploration' or 'Expands emotional vocabulary')"
    }
  ]
}`;

  const collectionSnapshot = JSON.stringify({
    totalBooksInLibrary: totalBooks,
    formats: formatCounts,
    topTopicsCovered: topTopics,
    lovedBooksSample: lovedBooks.slice(0, 8),
    recentBooksSample: sampleTitles,
    childProfile: {
      name: profile.name,
      age: profile.age,
      readingStage: profile.readingStage,
      favoriteTopics: profile.favoriteTopics || [],
    },
    userRequest: customPrompt || goalDescription,
  });

  const response = await dispatchLlmQuery(settings, {
    task: 'collection-recommendations',
    prompt: `Analyze our current family library and generate ${targetCount} book recommendations:\n${collectionSnapshot}`,
    systemInstruction,
    jsonMode: true,
  });

  const data = response.data || {};
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

  return {
    summary: data.summary || `Personalized recommendations for ${profile.name} (Age ${profile.age}).`,
    recommendations: recommendations.slice(0, targetCount),
    modelUsed: response.modelUsed,
  };
}
