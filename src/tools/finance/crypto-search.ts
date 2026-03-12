import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { CRYPTO_PRICE_TOOLS, getConfiguredCryptoResearchTools, hasCryptoResearchApi } from './crypto.js';
import { getConfiguredWebSearchTool, getConfiguredXSearchTool } from '../search/index.js';

export const CRYPTO_SEARCH_DESCRIPTION = `
Intelligent meta-tool for crypto research. Takes a natural language query and routes to token price, tokenomics, protocol, on-chain, governance, derivatives, security, web, and X/Twitter sources as available.

## When to Use

- Current or historical token prices
- "Why did this token move?" style price + catalyst questions
- Token metadata (chain, contract, category, official links)
- Tokenomics, supply, FDV, emissions, and unlock risk
- Protocol metrics (TVL, fees, revenue, treasury, user growth)
- On-chain activity, holder concentration, flows, and liquidity
- Derivatives positioning (open interest, funding, basis, liquidations)
- Governance, security incidents, and crypto-native newsflow
- Crypto comparisons across multiple tokens or protocols

## When NOT to Use

- Company financial statements, analyst estimates, SEC filings, or insider trades (use financial_search / financial_metrics / read_filings)
- General web research unrelated to crypto markets
- Trading or transaction execution

## Usage Notes

- Call ONCE with the full natural language query
- Prefer this tool over financial_search for tokens, protocols, chains, and crypto market structure
- Uses structured crypto tools first when configured, then falls back to web/X sources for narrative or missing data
- Returns structured JSON data with source URLs for verification
`.trim();

function formatSubToolName(name: string): string {
  return name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function buildResultKey(toolName: string, args: Record<string, unknown>): string {
  const identity =
    (args.ticker as string | undefined) ||
    (args.asset as string | undefined) ||
    (args.protocol_slug as string | undefined) ||
    (args.contract_address as string | undefined) ||
    (args.chain as string | undefined);

  return identity ? `${toolName}_${identity}` : toolName;
}

function getCryptoSearchTools(): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [
    ...CRYPTO_PRICE_TOOLS,
    ...getConfiguredCryptoResearchTools(),
  ];

  const webSearchTool = getConfiguredWebSearchTool();
  if (webSearchTool) {
    tools.push(webSearchTool);
  }

  const xSearchTool = getConfiguredXSearchTool();
  if (xSearchTool) {
    tools.push(xSearchTool);
  }

  return tools;
}

function buildRouterPrompt(): string {
  const structuredAvailability = hasCryptoResearchApi()
    ? '- Structured crypto research API tools are available for tokenomics, protocol, on-chain, governance, liquidity, derivatives, and security data.'
    : '- Structured crypto research API tools are NOT configured. Use price tools plus web_search/x_search for narrative or missing structured context.';

  const webAvailability = getConfiguredWebSearchTool()
    ? '- web_search is available for latest protocol announcements, docs, news, and source discovery.'
    : '- web_search is not available.';

  const xAvailability = getConfiguredXSearchTool()
    ? '- x_search is available for CT/X sentiment and real-time narrative checks.'
    : '- x_search is not available.';

  return `You are a crypto research routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about tokens, protocols, chains, or crypto market structure, call the appropriate tool(s).

## Available surface

${structuredAvailability}
${webAvailability}
${xAvailability}

## Guidelines

1. Asset resolution
   - Prefer exact tickers for price tools (BTC-USD, ETH-USD, SOL-USD).
   - For chain-specific assets, include chain and contract_address when the user provides them.
   - For protocol analysis, prefer protocol_slug or a canonical project name.

2. Tool selection
   - Current token quote or latest move -> get_crypto_price_snapshot
   - Historical price action over a window -> get_crypto_prices
   - Need ticker discovery -> get_available_crypto_tickers
   - Chain, contract, category, official links -> get_token_metadata
   - Supply, FDV, emissions, vesting, unlock setup -> get_tokenomics_snapshot
   - Upcoming unlock schedule -> get_token_unlocks
   - TVL, fees, revenue, users, treasury KPIs -> get_protocol_metrics
   - On-chain activity, bridge flows, exchange flows, whale moves -> get_onchain_activity
   - Holder concentration or whale ownership -> get_holder_distribution
   - Treasury wallets and notable flows -> get_treasury_flows
   - DEX depth, pool liquidity, slippage context -> get_dex_liquidity
   - Open interest, funding, basis, liquidations -> get_derivatives_metrics
   - Governance proposals or votes -> get_governance_updates
   - Exploits, outages, incident history -> get_security_incidents
   - Latest news, official announcements, docs, or source discovery -> web_search
   - CT/X sentiment, narrative divergence, notable accounts -> x_search
   - For "why did X move" questions, combine price tools with derivatives, web_search, and x_search when available

3. Efficiency
   - Prefer structured crypto tools over web_search when available.
   - Use web_search/x_search for narrative, official announcements, or when structured crypto data is unavailable.
   - For comparisons, call the same tool for each token or protocol.
   - Use the smallest reasonable timeframe or limit needed to answer the question.

Call the appropriate tool(s) now.`;
}

const CryptoSearchInputSchema = z.object({
  query: z.string().describe('Natural language query about crypto prices, protocols, tokenomics, market structure, or narrative'),
});

export function createCryptoSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'crypto_search',
    description:
      'Intelligent agentic search for crypto research. Routes natural language queries across token prices, tokenomics, protocol metrics, on-chain activity, governance, security, web search, and X/Twitter sentiment.',
    schema: CryptoSearchInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;
      const cryptoTools = getCryptoSearchTools();

      onProgress?.('Researching crypto data...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: cryptoTools,
      });
      const aiMessage = response as AIMessage;
      const toolCalls = aiMessage.tool_calls as ToolCall[];

      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for crypto query' }, []);
      }

      const toolNames = [...new Set(toolCalls.map((toolCall) => formatSubToolName(toolCall.name)))];
      onProgress?.(`Gathering ${toolNames.join(', ')}...`);

      const toolMap = new Map(cryptoTools.map((tool) => [tool.name, tool]));
      const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
          try {
            const tool = toolMap.get(toolCall.name);
            if (!tool) {
              throw new Error(`Tool '${toolCall.name}' not found`);
            }

            const rawResult = await tool.invoke(toolCall.args);
            const resultText = typeof rawResult === 'string' ? rawResult : JSON.stringify(rawResult);
            const parsed = JSON.parse(resultText);

            return {
              tool: toolCall.name,
              args: toolCall.args,
              data: parsed.data,
              sourceUrls: parsed.sourceUrls || [],
              error: null,
            };
          } catch (error) {
            return {
              tool: toolCall.name,
              args: toolCall.args,
              data: null,
              sourceUrls: [],
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      const successfulResults = results.filter((result) => result.error === null);
      const failedResults = results.filter((result) => result.error !== null);
      const allUrls = results.flatMap((result) => result.sourceUrls);
      const combinedData: Record<string, unknown> = {};

      for (const result of successfulResults) {
        combinedData[buildResultKey(result.tool, result.args as Record<string, unknown>)] = result.data;
      }

      if (failedResults.length > 0) {
        combinedData._errors = failedResults.map((result) => ({
          tool: result.tool,
          args: result.args,
          error: result.error,
        }));
      }

      return formatToolResult(combinedData, allUrls);
    },
  });
}
