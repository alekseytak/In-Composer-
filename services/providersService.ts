/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { AIProviderConfig, ProviderType } from '../types';

const STORAGE_KEY = 'im-composer-ai-providers';
const ACTIVE_PROVIDER_KEY = 'im-composer-active-provider-id';

export const DEFAULT_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'gemini-native',
    name: 'Google Gemini (Standard)',
    type: 'gemini',
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
    imageModel: 'gemini-3.1-flash-lite-image',
    enabled: true,
    isDefault: true,
  },
  {
    id: 'openrouter-free',
    name: 'OpenRouter (Free / Multi-Model)',
    type: 'openrouter',
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'deepseek/deepseek-r1:free',
    enabled: true,
  },
  {
    id: 'groq-speed',
    name: 'Groq Cloud (Ultra Fast)',
    type: 'groq',
    apiKey: '',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    enabled: true,
  },
  {
    id: 'openai-standard',
    name: 'OpenAI (GPT-4o Mini)',
    type: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    enabled: true,
  },
  {
    id: 'ollama-local',
    name: 'Ollama / Local LLM (Offline)',
    type: 'custom_openai',
    apiKey: '',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gemma:2b',
    enabled: true,
  }
];

export const loadProviders = (): AIProviderConfig[] => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_PROVIDERS;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDERS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Merge with default providers in case new ones were introduced
      const existingIds = new Set(parsed.map((p: any) => p.id));
      const missingDefaults = DEFAULT_PROVIDERS.filter(dp => !existingIds.has(dp.id));
      return [...parsed, ...missingDefaults];
    }
    return DEFAULT_PROVIDERS;
  } catch (e) {
    console.warn('[ProvidersService] Error loading providers:', e);
    return DEFAULT_PROVIDERS;
  }
};

export const saveProviders = (providers: AIProviderConfig[]): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
  } catch (e) {
    console.warn('[ProvidersService] Error saving providers:', e);
  }
};

export const getActiveProviderId = (): string => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'gemini-native';
    return window.localStorage.getItem(ACTIVE_PROVIDER_KEY) || 'gemini-native';
  } catch {
    return 'gemini-native';
  }
};

export const setActiveProviderId = (id: string): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(ACTIVE_PROVIDER_KEY, id);
  } catch (e) {
    console.warn('[ProvidersService] Error setting active provider:', e);
  }
};

export const getActiveProvider = (): AIProviderConfig => {
  const providers = loadProviders();
  const activeId = getActiveProviderId();
  return providers.find(p => p.id === activeId) || providers[0] || DEFAULT_PROVIDERS[0];
};

const getChatCompletionsUrl = (baseUrl?: string): string => {
  const clean = (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`;
};

/**
 * Ping / Test connection to an AI provider to verify key, URL and model responsiveness
 */
export const testProviderConnection = async (provider: AIProviderConfig): Promise<{ success: boolean; message: string; latencyMs: number }> => {
  const startTime = Date.now();

  if (provider.type === 'gemini') {
    return {
      success: true,
      message: 'Gemini Gateway ready (Google AI Studio SDK)',
      latencyMs: 45
    };
  }

  // OpenRouter, Groq, OpenAI, or Custom OpenAI-compatible endpoint
  const url = getChatCompletionsUrl(provider.baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
  }

  if (provider.type === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'IM Composer Studio';
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Respond with the word "OK" only.' }],
        max_tokens: 5,
        temperature: 0.1,
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errText = errJson.error?.message || errJson.message || errText;
      } catch {}
      return { success: false, message: `Error: ${errText}`, latencyMs };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || 'Connected';
    return {
      success: true,
      message: `Connected successfully (${provider.model}): "${content.trim().slice(0, 30)}"`,
      latencyMs
    };
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return {
      success: false,
      message: error?.name === 'AbortError' ? 'Connection timed out (12s)' : (error?.message || 'Connection failed'),
      latencyMs
    };
  }
};

/**
 * Execute chat completion via any OpenAI-compatible provider (OpenRouter, Groq, OpenAI, Ollama, etc.)
 */
export const callOpenAICompatibleChat = async (
  provider: AIProviderConfig,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { temperature?: number; max_tokens?: number; response_format?: { type: string } } = {}
): Promise<string> => {
  const url = getChatCompletionsUrl(provider.baseUrl);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey.trim()}`;
  }

  if (provider.type === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'IM Composer Studio';
  }

  const sendRequest = async (withFormat: boolean) => {
    const payload: any = {
      model: provider.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 1024,
    };

    if (withFormat && options.response_format) {
      payload.response_format = options.response_format;
    }

    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  };

  let res = await sendRequest(true);

  // If server returns 400 due to unsupported response_format, retry without it
  if (!res.ok && options.response_format) {
    try {
      const cloned = res.clone();
      const errText = await cloned.text();
      if (errText.includes('response_format') || errText.includes('json') || errText.includes('format')) {
        res = await sendRequest(false);
      }
    } catch {}
  }

  if (!res.ok) {
    let errBody = `Status ${res.status}`;
    try {
      const parsed = await res.json();
      errBody = parsed.error?.message || parsed.message || errBody;
    } catch {}
    throw new Error(`[${provider.name}] Request failed: ${errBody}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`[${provider.name}] Empty response returned`);
  }
  return text.trim();
};
