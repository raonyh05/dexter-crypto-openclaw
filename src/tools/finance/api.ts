import { readCache, writeCache, describeRequest } from '../../utils/cache.js';
import { logger } from '../../utils/logger.js';

const BASE_URL = 'https://api.financialdatasets.ai';

export interface ApiResponse {
  data: Record<string, unknown>;
  url: string;
}

type ApiKeyResolver = string | (() => string | undefined);

export interface ApiConfig {
  baseUrl: string;
  apiKey?: ApiKeyResolver;
  apiKeyHeader?: string;
  label?: string;
}

/**
 * Remove redundant fields from API payloads before they are returned to the LLM.
 * This reduces token usage while preserving the financial metrics needed for analysis.
 */
export function stripFieldsDeep(value: unknown, fields: readonly string[]): unknown {
  const fieldsToStrip = new Set(fields);

  function walk(node: unknown): unknown {
    if (Array.isArray(node)) {
      return node.map(walk);
    }

    if (!node || typeof node !== 'object') {
      return node;
    }

    const record = node as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(record)) {
      if (fieldsToStrip.has(key)) {
        continue;
      }
      cleaned[key] = walk(child);
    }

    return cleaned;
  }

  return walk(value);
}

function resolveApiKey(apiKey?: ApiKeyResolver): string | undefined {
  if (typeof apiKey === 'function') {
    return apiKey();
  }
  return apiKey;
}

export async function callConfiguredApi(
  config: ApiConfig,
  endpoint: string,
  params: Record<string, string | number | string[] | undefined>,
  options?: { cacheable?: boolean }
): Promise<ApiResponse> {
  const label = describeRequest(endpoint, params);

  // Check local cache first to avoid redundant network calls for immutable data.
  if (options?.cacheable) {
    const cached = readCache(endpoint, params);
    if (cached) {
      return cached;
    }
  }

  const apiKey = resolveApiKey(config.apiKey);
  const apiLabel = config.label ?? 'External API';

  if (!apiKey) {
    logger.warn(`[${apiLabel}] call without key: ${label}`);
  }

  const url = new URL(endpoint, config.baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers[config.apiKeyHeader ?? 'x-api-key'] = apiKey;
    }

    response = await fetch(url.toString(), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${apiLabel}] network error: ${label} -> ${message}`);
    throw new Error(`[${apiLabel}] request failed for ${label}: ${message}`);
  }

  if (!response.ok) {
    const detail = `${response.status} ${response.statusText}`;
    logger.error(`[${apiLabel}] error: ${label} -> ${detail}`);
    throw new Error(`[${apiLabel}] request failed: ${detail}`);
  }

  const data = await response.json().catch(() => {
    const detail = `invalid JSON (${response.status} ${response.statusText})`;
    logger.error(`[${apiLabel}] parse error: ${label} -> ${detail}`);
    throw new Error(`[${apiLabel}] request failed: ${detail}`);
  });

  if (options?.cacheable) {
    writeCache(endpoint, params, data, url.toString());
  }

  return { data, url: url.toString() };
}

export async function callApi(
  endpoint: string,
  params: Record<string, string | number | string[] | undefined>,
  options?: { cacheable?: boolean }
): Promise<ApiResponse> {
  return callConfiguredApi(
    {
      baseUrl: BASE_URL,
      apiKey: () => process.env.FINANCIAL_DATASETS_API_KEY,
      apiKeyHeader: 'x-api-key',
      label: 'Financial Datasets API',
    },
    endpoint,
    params,
    options
  );
}
