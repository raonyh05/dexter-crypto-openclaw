import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callConfiguredApi, callCryptoMarketApi, stripFieldsDeep } from './api.js';
import { formatToolResult } from '../types.js';

const CRYPTO_RESEARCH_API_LABEL = 'Crypto Research API';
const DEFAULT_CRYPTO_API_KEY_HEADER = 'x-api-key';

const assetField = z
  .string()
  .optional()
  .describe('Ticker, token symbol, asset name, or pair identifier. Example: BTC, ETH, SOL, HYPE, UNI, or BTC-USD.');

const tickerField = z
  .string()
  .optional()
  .describe('Optional explicit ticker or market symbol, such as BTC-USD or ETH-USD, when the provider requires it.');

const chainField = z
  .string()
  .optional()
  .describe('Blockchain/network identifier when the asset is chain-specific. Example: ethereum, solana, base, arbitrum.');

const contractAddressField = z
  .string()
  .optional()
  .describe('Token or contract address when available. Prefer supplying this for chain-specific assets.');

const protocolSlugField = z
  .string()
  .optional()
  .describe('Canonical protocol/project slug or name. Example: uniswap, hyperliquid, aave.');

const timeframeField = z
  .enum(['24h', '7d', '30d', '90d', '1y'])
  .optional()
  .describe('Time window for aggregations. Defaults vary by tool.');

const marketTypeField = z
  .enum(['spot', 'perpetual', 'futures', 'options'])
  .optional()
  .describe('Market type for derivatives or liquidity queries.');

const limitField = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Maximum number of records to return when the endpoint supports lists.');

type CryptoResearchInput = Record<string, string | number | string[] | undefined>;
type CryptoResearchShape = 'metrics' | 'events' | 'reference';
type NormalizedEntity = {
  asset?: string;
  ticker?: string;
  chain?: string;
  contractAddress?: string;
  protocolSlug?: string;
  vsAsset?: string;
};

function getCryptoResearchBaseUrl(): string | undefined {
  return process.env.CRYPTO_RESEARCH_API_BASE_URL?.trim() || undefined;
}

function getCryptoResearchApiHeader(): string {
  return process.env.CRYPTO_RESEARCH_API_KEY_HEADER?.trim() || DEFAULT_CRYPTO_API_KEY_HEADER;
}

function buildCryptoResearchParams(input: Record<string, unknown>): CryptoResearchInput {
  const params: CryptoResearchInput = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      params[key] = value.map((item) => String(item));
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = value;
    }
  }

  return params;
}

function normalizeVsAsset(value?: string): string {
  return value?.trim().toUpperCase() || 'USD';
}

function normalizeAsset(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

function resolveTicker(input: {
  ticker?: string;
  asset?: string;
  vs_asset?: string;
}): string {
  const explicitTicker = input.ticker?.trim();
  if (explicitTicker) {
    return explicitTicker.toUpperCase();
  }

  const asset = normalizeAsset(input.asset);
  if (!asset) {
    throw new Error('Provide ticker or asset for crypto price tools.');
  }

  return `${asset}-${normalizeVsAsset(input.vs_asset)}`;
}

function buildEntity(input: Record<string, unknown>): NormalizedEntity {
  return {
    asset: typeof input.asset === 'string' ? input.asset : undefined,
    ticker: typeof input.ticker === 'string' ? input.ticker : undefined,
    chain: typeof input.chain === 'string' ? input.chain : undefined,
    contractAddress: typeof input.contract_address === 'string' ? input.contract_address : undefined,
    protocolSlug: typeof input.protocol_slug === 'string' ? input.protocol_slug : undefined,
    vsAsset: typeof input.vs_asset === 'string' ? input.vs_asset : undefined,
  };
}

function pickRecord(payload: unknown, keys: string[]): unknown {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function inferAsOf(payload: unknown): string | null {
  const value = pickRecord(payload, ['asOf', 'as_of', 'timestamp', 'updated_at', 'last_updated']);
  return typeof value === 'string' ? value : null;
}

function inferWindow(input: Record<string, unknown>): string | null {
  const timeframe = typeof input.timeframe === 'string' ? input.timeframe : null;
  const startDate = typeof input.start_date === 'string' ? input.start_date : null;
  const endDate = typeof input.end_date === 'string' ? input.end_date : null;

  if (timeframe) {
    return timeframe;
  }
  if (startDate || endDate) {
    return [startDate ?? '?', endDate ?? '?'].join(' -> ');
  }

  return null;
}

function unwrapProviderPayload(payload: unknown): unknown {
  let current = payload;

  for (let i = 0; i < 2; i += 1) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return current;
    }

    const nested =
      pickRecord(current, ['data', 'result', 'results', 'payload', 'item', 'items']) ?? current;

    if (nested === current) {
      return current;
    }

    current = nested;
  }

  return current;
}

function normalizeResearchPayload(params: {
  input: Record<string, unknown>;
  payload: unknown;
  shape: CryptoResearchShape;
  providerLabel: string;
  url: string;
}): unknown {
  const payload = stripFieldsDeep(unwrapProviderPayload(params.payload), [
    'request_id',
    'requestId',
    'trace_id',
    'traceId',
    'debug',
    'raw',
    'headers',
    'status',
  ]);

  const base = {
    entity: buildEntity(params.input),
    asOf: inferAsOf(payload),
    window: inferWindow(params.input),
    source: {
      provider: params.providerLabel,
      urls: [params.url],
    },
  };

  if (params.shape === 'events') {
    const events = Array.isArray(payload) ? payload : pickRecord(payload, ['events', 'items', 'results']) ?? payload;
    return { ...base, events };
  }

  if (params.shape === 'reference') {
    return { ...base, reference: payload };
  }

  const metrics = pickRecord(payload, ['metrics', 'snapshot', 'data', 'values']) ?? payload;
  return { ...base, metrics };
}

function createCryptoResearchTool(params: {
  name: string;
  description: string;
  endpoint: string;
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  shape: CryptoResearchShape;
  cacheable?: boolean;
}): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: params.name,
    description: params.description,
    schema: params.schema,
    func: async (input) => {
      const baseUrl = getCryptoResearchBaseUrl();
      if (!baseUrl) {
        throw new Error(
          `${CRYPTO_RESEARCH_API_LABEL} is not configured. Set CRYPTO_RESEARCH_API_BASE_URL to enable ${params.name}.`
        );
      }

      const { data, url } = await callConfiguredApi(
        {
          baseUrl,
          apiKey: () => process.env.CRYPTO_RESEARCH_API_KEY,
          apiKeyHeader: getCryptoResearchApiHeader(),
          label: CRYPTO_RESEARCH_API_LABEL,
        },
        params.endpoint,
        buildCryptoResearchParams(input),
        { cacheable: params.cacheable ?? true, timeoutMs: 20_000 },
      );

      const normalized = normalizeResearchPayload({
        input,
        payload: data,
        shape: params.shape,
        providerLabel: CRYPTO_RESEARCH_API_LABEL,
        url,
      });
      return formatToolResult(normalized, [url]);
    },
  });
}

export function hasCryptoResearchApi(): boolean {
  return Boolean(getCryptoResearchBaseUrl());
}

const CryptoPriceSnapshotInputSchema = z.object({
  asset: assetField.describe('Asset symbol or name to fetch a price snapshot for. Example: BTC, ETH, SOL.'),
  ticker: tickerField,
  chain: chainField,
  contract_address: contractAddressField,
  vs_asset: z.string().optional().describe('Quote currency or comparison asset. Defaults to USD.'),
});

export const getCryptoPriceSnapshot = new DynamicStructuredTool({
  name: 'get_crypto_price_snapshot',
  description:
    'Fetch the most recent price snapshot for a cryptocurrency, including price, OHLC, and volume. Prefer asset + optional chain/contract address; ticker is optional.',
  schema: CryptoPriceSnapshotInputSchema,
  func: async (input) => {
    const ticker = resolveTicker(input);
    const params = {
      ticker,
      asset: input.asset,
      chain: input.chain,
      contract_address: input.contract_address,
      vs_asset: input.vs_asset ?? 'USD',
    };
    const { data, url } = await callCryptoMarketApi('/crypto/prices/snapshot/', params);
    const snapshot = pickRecord(data, ['snapshot', 'data']) ?? data;
    return formatToolResult(
      {
        entity: buildEntity({ ...input, ticker }),
        asOf: inferAsOf(snapshot),
        metrics: snapshot,
        source: { provider: getCryptoResearchBaseUrl() ? CRYPTO_RESEARCH_API_LABEL : 'Financial Datasets API', urls: [url] },
      },
      [url],
    );
  },
});

const CryptoPricesInputSchema = z.object({
  asset: assetField.describe('Asset symbol or name to fetch historical prices for. Example: BTC, ETH, SOL.'),
  ticker: tickerField,
  chain: chainField,
  contract_address: contractAddressField,
  vs_asset: z.string().optional().describe('Quote currency or comparison asset. Defaults to USD.'),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  interval_multiplier: z
    .number()
    .default(1)
    .describe('Multiplier for the interval. Defaults to 1.'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Required.'),
});

export const getCryptoPrices = new DynamicStructuredTool({
  name: 'get_crypto_prices',
  description:
    'Retrieve historical OHLCV data for a cryptocurrency over a date range. Prefer asset + optional chain/contract address; ticker is optional.',
  schema: CryptoPricesInputSchema,
  func: async (input) => {
    const ticker = resolveTicker(input);
    const params = {
      ticker,
      asset: input.asset,
      chain: input.chain,
      contract_address: input.contract_address,
      vs_asset: input.vs_asset ?? 'USD',
      interval: input.interval,
      interval_multiplier: input.interval_multiplier,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const endDate = new Date(`${input.end_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, url } = await callCryptoMarketApi('/crypto/prices/', params, { cacheable: endDate < today });
    const prices = pickRecord(data, ['prices', 'data', 'results']) ?? data;
    return formatToolResult(
      {
        entity: buildEntity({ ...input, ticker }),
        asOf: inferAsOf(data),
        window: `${input.start_date} -> ${input.end_date}`,
        metrics: prices,
        source: { provider: getCryptoResearchBaseUrl() ? CRYPTO_RESEARCH_API_LABEL : 'Financial Datasets API', urls: [url] },
      },
      [url],
    );
  },
});

export const getCryptoTickers = new DynamicStructuredTool({
  name: 'get_available_crypto_tickers',
  description: 'Retrieve the list of cryptocurrency tickers that can be used with Dexter price tools.',
  schema: z.object({}),
  func: async () => {
    const { data, url } = await callCryptoMarketApi('/crypto/prices/tickers/', {});
    return formatToolResult(
      {
        source: { provider: getCryptoResearchBaseUrl() ? CRYPTO_RESEARCH_API_LABEL : 'Financial Datasets API', urls: [url] },
        reference: pickRecord(data, ['tickers', 'data', 'results']) ?? data,
      },
      [url],
    );
  },
});

export const getTokenMetadata = createCryptoResearchTool({
  name: 'get_token_metadata',
  description:
    'Fetch token or protocol reference data such as chain, contract address, category, current supply references, and official links.',
  endpoint: '/crypto/research/token-metadata/',
  shape: 'reference',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    contract_address: contractAddressField,
    protocol_slug: protocolSlugField,
  }),
});

export const getTokenomicsSnapshot = createCryptoResearchTool({
  name: 'get_tokenomics_snapshot',
  description:
    'Fetch tokenomics and supply structure data such as circulating supply, total supply, FDV, emissions, vesting, and unlock context.',
  endpoint: '/crypto/research/tokenomics/snapshot/',
  shape: 'metrics',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    contract_address: contractAddressField,
    protocol_slug: protocolSlugField,
    timeframe: timeframeField,
  }),
});

export const getProtocolMetrics = createCryptoResearchTool({
  name: 'get_protocol_metrics',
  description:
    'Fetch crypto-native protocol metrics such as TVL, fees, revenue, user growth, treasury balances, or other operating KPIs.',
  endpoint: '/crypto/research/protocol-metrics/',
  shape: 'metrics',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    protocol_slug: protocolSlugField,
    chain: chainField,
    timeframe: timeframeField,
  }),
});

export const getOnchainActivity = createCryptoResearchTool({
  name: 'get_onchain_activity',
  description:
    'Fetch on-chain activity such as active addresses, volume, bridge flows, exchange flows, whale transfers, or transaction trends.',
  endpoint: '/crypto/research/onchain-activity/',
  shape: 'metrics',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    protocol_slug: protocolSlugField,
    chain: chainField,
    contract_address: contractAddressField,
    timeframe: timeframeField,
  }),
});

export const getHolderDistribution = createCryptoResearchTool({
  name: 'get_holder_distribution',
  description:
    'Fetch holder concentration and wallet distribution data, including top holders, exchange concentration, or whale ownership changes.',
  endpoint: '/crypto/research/holder-distribution/',
  shape: 'metrics',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    contract_address: contractAddressField,
    timeframe: timeframeField,
  }),
});

export const getTreasuryFlows = createCryptoResearchTool({
  name: 'get_treasury_flows',
  description:
    'Fetch protocol treasury balances and notable inflows or outflows across wallets, venues, or chains.',
  endpoint: '/crypto/research/treasury-flows/',
  shape: 'events',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    protocol_slug: protocolSlugField,
    chain: chainField,
    timeframe: timeframeField,
  }),
});

export const getDexLiquidity = createCryptoResearchTool({
  name: 'get_dex_liquidity',
  description:
    'Fetch DEX liquidity, pool depth, volume, and slippage context for a token, pair, or venue.',
  endpoint: '/crypto/research/dex-liquidity/',
  shape: 'metrics',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    contract_address: contractAddressField,
    market_type: marketTypeField,
    timeframe: timeframeField,
  }),
});

export const getDerivativesMetrics = createCryptoResearchTool({
  name: 'get_derivatives_metrics',
  description:
    'Fetch derivatives data such as perp open interest, funding, basis, liquidations, or exchange positioning.',
  endpoint: '/crypto/research/derivatives-metrics/',
  shape: 'metrics',
  cacheable: false,
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    market_type: marketTypeField,
    timeframe: timeframeField,
  }),
});

export const getTokenUnlocks = createCryptoResearchTool({
  name: 'get_token_unlocks',
  description:
    'Fetch token unlock schedules, vesting cliffs, and upcoming emission or release events.',
  endpoint: '/crypto/research/token-unlocks/',
  shape: 'events',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    chain: chainField,
    contract_address: contractAddressField,
    start_date: z.string().optional().describe('Start date in YYYY-MM-DD format.'),
    end_date: z.string().optional().describe('End date in YYYY-MM-DD format.'),
    limit: limitField,
  }),
});

export const getGovernanceUpdates = createCryptoResearchTool({
  name: 'get_governance_updates',
  description:
    'Fetch governance proposals, votes, and status changes that may affect token holders, incentives, emissions, or treasury decisions.',
  endpoint: '/crypto/research/governance-updates/',
  shape: 'events',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    protocol_slug: protocolSlugField,
    chain: chainField,
    timeframe: timeframeField,
    limit: limitField,
  }),
});

export const getSecurityIncidents = createCryptoResearchTool({
  name: 'get_security_incidents',
  description:
    'Fetch exploit, hack, bug bounty, outage, or security disclosure events relevant to a token, protocol, or chain.',
  endpoint: '/crypto/research/security-incidents/',
  shape: 'events',
  schema: z.object({
    asset: assetField,
    ticker: tickerField,
    protocol_slug: protocolSlugField,
    chain: chainField,
    timeframe: timeframeField,
    limit: limitField,
  }),
});

export const CRYPTO_PRICE_TOOLS: StructuredToolInterface[] = [
  getCryptoPriceSnapshot,
  getCryptoPrices,
  getCryptoTickers,
];

export const CRYPTO_RESEARCH_API_TOOLS: StructuredToolInterface[] = [
  getTokenMetadata,
  getTokenomicsSnapshot,
  getProtocolMetrics,
  getOnchainActivity,
  getHolderDistribution,
  getTreasuryFlows,
  getDexLiquidity,
  getDerivativesMetrics,
  getTokenUnlocks,
  getGovernanceUpdates,
  getSecurityIncidents,
];

export function getConfiguredCryptoResearchTools(): StructuredToolInterface[] {
  return hasCryptoResearchApi() ? CRYPTO_RESEARCH_API_TOOLS : [];
}
