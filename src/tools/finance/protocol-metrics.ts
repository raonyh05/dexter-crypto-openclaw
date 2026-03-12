import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getConfiguredCryptoResearchTools, hasCryptoResearchApi } from './crypto.js';
import { getConfiguredWebSearchTool, getConfiguredXSearchTool } from '../search/index.js';
import { buildAggregatedToolPayload } from './aggregation.js';

export const PROTOCOL_METRICS_DESCRIPTION = `
Intelligent meta-tool for crypto-native fundamental analysis. Routes natural language queries about tokenomics, protocol metrics, treasury, governance, on-chain activity, liquidity, derivatives, and security context.

## When to Use

- Token supply, FDV, emissions, circulating vs fully diluted structure
- Protocol KPIs such as TVL, fees, revenue, users, treasury, or chain activity
- Holder concentration, wallet distribution, treasury flows, and exchange flows
- DEX liquidity, pool depth, slippage context, and market structure
- Perpetual or derivatives positioning (open interest, funding, basis, liquidations)
- Governance proposals, treasury votes, or incentive changes
- Token unlock calendars and security incident history
- Multi-protocol comparisons on crypto-native fundamentals

## When NOT to Use

- Simple current token price or historical price chart requests (use crypto_search)
- Company financials, SEC filings, or analyst estimates (use financial_search / financial_metrics / read_filings)
- Trade execution or wallet-signing tasks

## Usage Notes

- Call ONCE with the full natural language query
- Prefer this tool for protocol due diligence, thesis checks, and token structure questions
- Uses structured crypto data first when configured, with web/X fallbacks for official announcements or governance context
`.trim();

function formatSubToolName(name: string): string {
  return name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function getProtocolMetricsTools(): StructuredToolInterface[] {
  const tools: StructuredToolInterface[] = [...getConfiguredCryptoResearchTools()];

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

export function hasProtocolMetricsTools(): boolean {
  return hasCryptoResearchApi();
}

function buildRouterPrompt(): string {
  const structuredAvailability = hasCryptoResearchApi()
    ? '- Structured crypto research API tools are available.'
    : '- Structured crypto research API tools are NOT configured.';

  const webAvailability = getConfiguredWebSearchTool()
    ? '- web_search is available for governance docs, blog posts, official announcements, and source discovery.'
    : '- web_search is not available.';

  const xAvailability = getConfiguredXSearchTool()
    ? '- x_search is available for governance/community reaction and real-time narrative checks.'
    : '- x_search is not available.';

  return `You are a crypto protocol fundamentals routing assistant.
Current date: ${getCurrentDate()}

Given a natural language query about crypto-native fundamentals, call the appropriate tool(s).

## Available surface

${structuredAvailability}
${webAvailability}
${xAvailability}

## Guidelines

1. Scope
   - Focus on tokenomics, protocol metrics, treasury, governance, on-chain activity, liquidity, derivatives, and security.
   - Do NOT use this tool for plain spot price requests when crypto_search would be simpler.

2. Tool selection
   - Token metadata or official references -> get_token_metadata
   - Supply structure, FDV, emissions, vesting, unlock setup -> get_tokenomics_snapshot
   - Upcoming unlocks -> get_token_unlocks
   - TVL, fees, revenue, users, treasury KPIs -> get_protocol_metrics
   - On-chain activity, bridge/exchange flows, whale activity -> get_onchain_activity
   - Holder concentration -> get_holder_distribution
   - Treasury wallet flows -> get_treasury_flows
   - DEX liquidity or pool depth -> get_dex_liquidity
   - Open interest, funding, basis, liquidations -> get_derivatives_metrics
   - Governance proposals, votes, incentive changes -> get_governance_updates
   - Exploits, outages, incident history -> get_security_incidents
   - Official docs, forum posts, announcements, proposal pages -> web_search
   - Real-time governance/community sentiment -> x_search

3. Efficiency
   - Prefer structured crypto data tools when available.
   - Use web_search for official sources, governance forums, or supporting context after structured tools.
   - Use x_search only when the user's question depends on community or CT reaction.
   - For comparisons, call the same tool for each protocol or token.

Call the appropriate tool(s) now.`;
}

const ProtocolMetricsInputSchema = z.object({
  query: z.string().describe('Natural language query about tokenomics, protocol metrics, treasury, governance, on-chain activity, or security'),
});

export function createProtocolMetrics(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'protocol_metrics',
    description:
      'Intelligent agentic search for crypto-native fundamentals. Use for tokenomics, protocol KPIs, governance, treasury, liquidity, derivatives positioning, and security context.',
    schema: ProtocolMetricsInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;
      const metricsTools = getProtocolMetricsTools();

      if (metricsTools.length === 0) {
        return formatToolResult(
          {
            error:
              'No structured crypto provider is configured. Set CRYPTO_RESEARCH_API_BASE_URL to enable protocol_metrics.',
          },
          [],
        );
      }

      onProgress?.('Researching protocol fundamentals...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: metricsTools,
      });
      const aiMessage = response as AIMessage;
      const toolCalls = aiMessage.tool_calls as ToolCall[];

      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for protocol metrics query' }, []);
      }

      const toolNames = [...new Set(toolCalls.map((toolCall) => formatSubToolName(toolCall.name)))];
      onProgress?.(`Gathering ${toolNames.join(', ')}...`);

      const toolMap = new Map(metricsTools.map((tool) => [tool.name, tool]));
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

      const aggregated = buildAggregatedToolPayload(results);
      return formatToolResult(aggregated.data, aggregated.sourceUrls);
    },
  });
}
