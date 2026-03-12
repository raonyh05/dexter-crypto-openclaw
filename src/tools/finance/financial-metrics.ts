import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from './fundamentals.js';
import { getKeyRatios, getHistoricalKeyRatios } from './key-ratios.js';

/**
 * Rich description for the financial_metrics tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const FINANCIAL_METRICS_DESCRIPTION = `
Intelligent meta-tool for public-company fundamentals. Routes natural language queries to financial statements and equity key-ratio tools.

## When to Use

- Income statement data (revenue, gross profit, operating income, net income, EPS)
- Balance sheet data (assets, liabilities, equity, debt, cash)
- Cash flow data (operating cash flow, investing cash flow, financing cash flow, free cash flow)
- Financial metrics (P/E ratio, EV/EBITDA, ROE, ROA, margins, dividend yield)
- Trend analysis across multiple periods
- Multi-company fundamental comparisons

## When NOT to Use

- Tokens, tokenomics, protocol KPIs, governance, or on-chain activity (use crypto_search / protocol_metrics)
- Stock prices, company news, or analyst estimates when financial_search is a better fit
- Non-financial data (use web_search)

## Usage Notes

- Call ONCE with the full natural language query.
- Handles ticker resolution (Apple -> AAPL).
- Handles date inference ("last 5 years", "Q3 2024").
- For current metrics, uses snapshot tools. For historical trends, uses time-series tools.
`.trim();

function formatSubToolName(name: string): string {
  return name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const METRICS_TOOLS: StructuredToolInterface[] = [
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatios,
  getHistoricalKeyRatios,
];

const METRICS_TOOL_MAP = new Map(METRICS_TOOLS.map((tool) => [tool.name, tool]));

function buildRouterPrompt(): string {
  return `You are a public-company fundamentals routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about financial statements or equity metrics, call the appropriate tool(s).

## Guidelines

1. Ticker resolution
   - Convert company names to ticker symbols when needed.
   - Examples: Apple -> AAPL, Tesla -> TSLA, Microsoft -> MSFT, Amazon -> AMZN, Alphabet -> GOOGL, Meta -> META, Nvidia -> NVDA.

2. Domain guardrail
   - This router is for listed companies and equity fundamentals only.
   - If the query is about tokens, protocols, chains, on-chain activity, tokenomics, or governance, those belong in crypto_search / protocol_metrics.

3. Date inference
   - "last year" -> report_period_gte about 1 year ago
   - "last quarter" -> report_period_gte about 3 months ago
   - "past 5 years" -> report_period_gte about 5 years ago, limit 5 (annual) or 20 (quarterly)
   - "YTD" -> report_period_gte Jan 1 of the current year

4. Tool selection
   - Current/latest metrics snapshot -> get_key_ratios
   - Historical metrics over time -> get_historical_key_ratios
   - Revenue, earnings, profitability -> get_income_statements
   - Debt, assets, equity, cash position -> get_balance_sheets
   - Cash flow, free cash flow, operating cash -> get_cash_flow_statements
   - Comprehensive multi-statement analysis -> get_all_financial_statements

5. Period selection
   - Default to annual for multi-year trend analysis.
   - Use quarterly for recent performance or seasonality.
   - Use TTM metrics when the user asks for current profitability or valuation context.

6. Efficiency
   - Prefer specific statement tools over get_all_financial_statements when possible.
   - Use the smallest reasonable limit:
     - Latest question -> limit 1
     - Short trend -> limit 3
     - Medium trend -> limit 5

Call the appropriate tool(s) now.`;
}

const FinancialMetricsInputSchema = z.object({
  query: z.string().describe('Natural language query about company financial statements or equity metrics'),
});

export function createFinancialMetrics(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_metrics',
    description: `Intelligent agentic search for public-company fundamentals. Use for:
- Income statements (revenue, gross profit, operating income, net income, EPS)
- Balance sheets (assets, liabilities, equity, debt, cash)
- Cash flow statements (operating, investing, financing activities, free cash flow)
- Key ratios (P/E, EV/EBITDA, ROE, ROA, margins, dividend yield)
- Multi-period trend analysis
- Multi-company fundamental comparisons
Do not use for crypto-native tokenomics or protocol metrics.`,
    schema: FinancialMetricsInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      onProgress?.('Searching fundamentals...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: METRICS_TOOLS,
      });
      const aiMessage = response as AIMessage;

      const toolCalls = aiMessage.tool_calls as ToolCall[];
      if (!toolCalls || toolCalls.length === 0) {
        return formatToolResult({ error: 'No tools selected for query' }, []);
      }

      const toolNames = [...new Set(toolCalls.map((toolCall) => formatSubToolName(toolCall.name)))];
      onProgress?.(`Fetching from ${toolNames.join(', ')}...`);

      const results = await Promise.all(
        toolCalls.map(async (toolCall) => {
          try {
            const tool = METRICS_TOOL_MAP.get(toolCall.name);
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
        const ticker = (result.args as Record<string, unknown>).ticker as string | undefined;
        const key = ticker ? `${result.tool}_${ticker}` : result.tool;
        combinedData[key] = result.data;
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
