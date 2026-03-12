import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { callApi, callConfiguredApi } from './api.js';
import { formatToolResult } from '../types.js';

const CRYPTO_RESEARCH_API_LABEL = 'Crypto Research API';
const DEFAULT_CRYPTO_API_KEY_HEADER = 'x-api-key';

const assetField = z
  .string()
  .optional()
  .describe('Ticker, token symbol, protocol name, or pair identifier. Example: BTC, ETH, SOL, HYPE, UNI, or BTC-USD.');

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

function createCryptoResearchTool(params: {
  name: string;
  description: string;
  endpoint: string;
  schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
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
      );

      return formatToolResult(data, [url]);
    },
  });
}

export function hasCryptoResearchApi(): boolean {
  return Boolean(getCryptoResearchBaseUrl());
}

const CryptoPriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch the price snapshot for. For example, 'BTC-USD' for Bitcoin."
    ),
});

export const getCryptoPriceSnapshot = new DynamicStructuredTool({
  name: 'get_crypto_price_snapshot',
  description:
    "Fetch the most recent price snapshot for a cryptocurrency, including price, OHLC, and volume. Use 'CRYPTO-USD' or 'CRYPTO-CRYPTO' tickers such as 'BTC-USD' or 'BTC-ETH'.",
  schema: CryptoPriceSnapshotInputSchema,
  func: async (input) => {
    const params = { ticker: input.ticker };
    const { data, url } = await callApi('/crypto/prices/snapshot/', params);
    return formatToolResult(data.snapshot || {}, [url]);
  },
});

const CryptoPricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch aggregated prices for. For example, 'BTC-USD' for Bitcoin."
    ),
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
    "Retrieve historical OHLCV data for a cryptocurrency over a date range. Use 'CRYPTO-USD' or 'CRYPTO-CRYPTO' tickers such as 'BTC-USD' or 'BTC-ETH'.",
  schema: CryptoPricesInputSchema,
  func: async (input) => {
    const params = {
      ticker: input.ticker,
      interval: input.interval,
      interval_multiplier: input.interval_multiplier,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const endDate = new Date(`${input.end_date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, url } = await callApi('/crypto/prices/', params, { cacheable: endDate < today });
    return formatToolResult(data.prices || [], [url]);
  },
});

export const getCryptoTickers = new DynamicStructuredTool({
  name: 'get_available_crypto_tickers',
  description: 'Retrieve the list of cryptocurrency tickers that can be used with Dexter price tools.',
  schema: z.object({}),
  func: async () => {
    const { data, url } = await callApi('/crypto/prices/tickers/', {});
    return formatToolResult(data.tickers || [], [url]);
  },
});

export const getTokenMetadata = createCryptoResearchTool({
  name: 'get_token_metadata',
  description:
    'Fetch token or protocol reference data such as chain, contract address, category, current supply references, and official links.',
  endpoint: '/crypto/research/token-metadata/',
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
  schema: z.object({
    asset: assetField,
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
