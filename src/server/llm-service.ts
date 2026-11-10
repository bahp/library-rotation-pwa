/**
 * @fileoverview Full-stack LLM service proxy for Google Gemini & BYOK LLMs:
 * - Direct server-side Google GenAI SDK integration (@google/genai) using process.env.GEMINI_API_KEY.
 * - Support for user-provided Cloudflare Worker proxies (e.g. for Gemini API).
 * - Support for Bring-Your-Own-Key (BYOK) for Gemini and OpenAI-compatible endpoints
 *   (Groq, OpenRouter, Mistral, Ollama, Cloudflare Workers AI, etc.).
 * - Rate-limit / Quota-friendly error mapping (429 handling with user guidance).
 */

import { GoogleGenAI } from '@google/genai';

export interface LlmQueryPayload {
  task?: 'book-tagging' | 'rotation-curator' | 'collection-recommendations' | 'test' | 'custom';
  prompt: string;
  systemInstruction?: string;
  model?: string;
  provider?: 'server-gemini' | 'cloudflare-worker' | 'byok-gemini' | 'byok-openai';
  endpointUrl?: string;
  apiKey?: string;
  jsonMode?: boolean;
}

export interface LlmQueryResult {
  ok: boolean;
  text: string;
  data?: unknown;
  error?: string;
  message?: string;
  status?: number;
  modelUsed?: string;
  providerUsed?: string;
}

/**
 * Extracts and parses a JSON object or array from raw model text (tolerating markdown code fences).
 */
export function extractJsonFromText(rawText: string): unknown {
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
      const slice = cleaned.slice(startIdx, endIdx + 1);
      return JSON.parse(slice);
    }
    throw new Error('LLM response did not contain valid JSON.');
  }
}

/**
 * Executes an LLM generation query across Server Gemini, Cloudflare Worker, or OpenAI-compatible endpoints.
 */
export async function executeLlmQuery(payload: LlmQueryPayload): Promise<LlmQueryResult> {
  const provider = payload.provider || 'server-gemini';
  const customKey = (payload.apiKey || '').trim();
  const endpointUrl = (payload.endpointUrl || '').trim();

  // 1. Cloudflare Worker or Custom HTTPS Webhook Proxy
  if (provider === 'cloudflare-worker' && endpointUrl) {
    return executeProxyQuery(endpointUrl, payload, customKey);
  }

  // 2. OpenAI-compatible BYOK (Groq, OpenRouter, Mistral, Ollama, Cloudflare Workers AI)
  if (provider === 'byok-openai') {
    return executeOpenAiCompatibleQuery(endpointUrl, payload, customKey);
  }

  // 3. Gemini via Google GenAI SDK (Server Key or BYOK Gemini Key)
  return executeGeminiSdkQuery(payload, customKey);
}

/**
 * Queries Google Gemini using the official @google/genai SDK on the server.
 */
async function executeGeminiSdkQuery(
  payload: LlmQueryPayload,
  customKey?: string
): Promise<LlmQueryResult> {
  const apiKey = customKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    return {
      ok: false,
      text: '',
      status: 400,
      error: 'MISSING_API_KEY',
      message:
        'No Gemini API key found. Add GEMINI_API_KEY to server environment variables, or enter your personal key in Settings > AI Assistant.',
    };
  }

  const requestedModel = payload.model?.trim() || 'gemini-3.8-flash';
  const modelsToTry = [requestedModel];
  if (requestedModel !== 'gemini-2.5-flash') {
    modelsToTry.push('gemini-2.5-flash');
  }
  if (!modelsToTry.includes('gemini-3.1-flash-lite')) {
    modelsToTry.push('gemini-3.1-flash-lite');
  }

  const isTest = payload.task === 'test';
  // Minimum allowed deadline by Gemini API is 10 seconds.
  const modelTimeoutMs = isTest ? 12000 : 25000;

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      timeout: modelTimeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    try {
      const config: Record<string, unknown> = {};
      if (payload.systemInstruction) {
        config.systemInstruction = payload.systemInstruction;
      }
      if (payload.jsonMode !== false) {
        config.responseMimeType = 'application/json';
      }

      const response = await ai.models.generateContent({
        model,
        contents: payload.prompt,
        config,
      });

      const text = response.text || '';
      let parsedData: unknown = null;
      if (payload.jsonMode !== false) {
        try {
          parsedData = extractJsonFromText(text);
        } catch (_) {
          parsedData = null;
        }
      }

      return {
        ok: true,
        text,
        data: parsedData,
        modelUsed: model,
        providerUsed: customKey ? 'byok-gemini' : 'server-gemini',
      };
    } catch (err: unknown) {
      lastError = err;
      const errorObj = err as { status?: number; code?: string | number; message?: string };
      const errMsg = String(errorObj?.message || err);

      const isTemporaryCapacityOrTimeout =
        errorObj?.status === 503 ||
        errorObj?.status === 504 ||
        errMsg.includes('503') ||
        errMsg.includes('504') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('DEADLINE_EXCEEDED') ||
        errMsg.includes('Deadline expired') ||
        errMsg.includes('high demand') ||
        errMsg.includes('timeout') ||
        errMsg.includes('timed out') ||
        errMsg.includes('ETIMEDOUT');

      // If temporary capacity spike or timeout and we have another model candidate, try next model
      if (isTemporaryCapacityOrTimeout && model !== modelsToTry[modelsToTry.length - 1]) {
        console.warn(`[llm-service] Model ${model} unavailable (${errMsg.slice(0, 80)}). Falling back to next model...`);
        continue;
      }
      break;
    }
  }

  const errorObj = lastError as { status?: number; code?: string | number; message?: string };
  const errMsg = String(errorObj?.message || lastError);

  const isQuotaExhausted =
    errorObj?.status === 429 ||
    errMsg.includes('429') ||
    errMsg.includes('RESOURCE_EXHAUSTED') ||
    errMsg.toLowerCase().includes('quota');

  if (isQuotaExhausted) {
    return {
      ok: false,
      text: '',
      status: 429,
      error: 'RESOURCE_EXHAUSTED',
      message:
        'Gemini rate limit or quota exceeded. Please wait a minute before retrying, or configure your own key/Cloudflare Worker in Settings.',
    };
  }

  const isPermissionDenied =
    errorObj?.status === 403 ||
    errMsg.includes('PERMISSION_DENIED') ||
    errMsg.includes('API_KEY_INVALID');

  if (isPermissionDenied) {
    return {
      ok: false,
      text: '',
      status: 403,
      error: 'PERMISSION_DENIED',
      message: 'Invalid Gemini API key or permission denied. Check your key in Settings.',
    };
  }

  return {
    ok: false,
    text: '',
    status: errorObj?.status || 500,
    error: 'GEMINI_ERROR',
    message: errMsg || 'Failed to query Gemini model.',
  };
}

/**
 * Queries a user-configured Cloudflare Worker or HTTPS webhook proxy.
 */
async function executeProxyQuery(
  endpointUrl: string,
  payload: LlmQueryPayload,
  customKey?: string
): Promise<LlmQueryResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (customKey) {
      headers['Authorization'] = `Bearer ${customKey}`;
      headers['x-api-key'] = customKey;
    }

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        task: payload.task || 'custom',
        prompt: payload.prompt,
        systemInstruction: payload.systemInstruction,
        model: payload.model || 'gemini-3.8-flash',
        jsonMode: payload.jsonMode !== false,
      }),
    });

    if (res.status === 429) {
      return {
        ok: false,
        text: '',
        status: 429,
        error: 'RESOURCE_EXHAUSTED',
        message: 'Proxy returned HTTP 429: Rate limit or quota exceeded.',
      };
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        text: '',
        status: res.status,
        error: 'PROXY_ERROR',
        message: `Cloudflare Worker/proxy returned HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }

    const json = await res.json();
    const rawText =
      typeof json === 'string'
        ? json
        : typeof json.text === 'string'
          ? json.text
          : typeof json.response === 'string'
            ? json.response
            : JSON.stringify(json);

    let parsedData = json.data || null;
    if (!parsedData && payload.jsonMode !== false) {
      try {
        parsedData = extractJsonFromText(rawText);
      } catch (_) {
        parsedData = typeof json === 'object' && json !== null ? json : null;
      }
    }

    return {
      ok: true,
      text: rawText,
      data: parsedData,
      modelUsed: payload.model || 'proxy-model',
      providerUsed: 'cloudflare-worker',
    };
  } catch (err: unknown) {
    return {
      ok: false,
      text: '',
      status: 502,
      error: 'PROXY_CONNECTION_FAILED',
      message: `Failed to connect to Cloudflare Worker proxy: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Queries an OpenAI-compatible endpoint (Groq, OpenRouter, Mistral, Ollama, etc.).
 */
async function executeOpenAiCompatibleQuery(
  endpointUrl: string,
  payload: LlmQueryPayload,
  customKey?: string
): Promise<LlmQueryResult> {
  const baseUrl = (endpointUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  const model = payload.model?.trim() || 'llama-3.3-70b-versatile';

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (customKey) {
      headers['Authorization'] = `Bearer ${customKey}`;
    }

    const messages = [];
    if (payload.systemInstruction) {
      messages.push({ role: 'system', content: payload.systemInstruction });
    }
    messages.push({ role: 'user', content: payload.prompt });

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.3,
    };
    if (payload.jsonMode !== false) {
      requestBody.response_format = { type: 'json_object' };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (res.status === 429) {
      return {
        ok: false,
        text: '',
        status: 429,
        error: 'RESOURCE_EXHAUSTED',
        message: 'Endpoint returned HTTP 429: Rate limit or quota exhausted.',
      };
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        text: '',
        status: res.status,
        error: 'BYOK_ERROR',
        message: `Endpoint returned HTTP ${res.status}: ${errBody.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json?.choices?.[0]?.message?.content || '';
    let parsedData = null;
    if (payload.jsonMode !== false) {
      try {
        parsedData = extractJsonFromText(content);
      } catch (_) {
        parsedData = null;
      }
    }

    return {
      ok: true,
      text: content,
      data: parsedData,
      modelUsed: model,
      providerUsed: 'byok-openai',
    };
  } catch (err: unknown) {
    return {
      ok: false,
      text: '',
      status: 502,
      error: 'ENDPOINT_CONNECTION_FAILED',
      message: `Failed to connect to endpoint: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
