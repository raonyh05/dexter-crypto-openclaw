import { DynamicStructuredTool, type StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { AIMessage, ToolCall } from '@langchain/core/messages';
import { z } from 'zod';
import { callLlm } from '../../model/llm.js';
import { formatToolResult } from '../types.js';
import { getCurrentDate } from '../../agent/prompts.js';
import { getIncomeStatements, getBalanceSheets, getCashFlowStatements, getAllFinancialStatements } from './fundamentals.js';
import { getKeyRatios, getHistoricalKeyRatios } from './key-ratios.js';
import { getAnalystEstimates } from './estimates.js';
import { getSegmentedRevenues } from './segments.js';
import { getInsiderTrades } from './insider_trades.js';
import { getStockPrice, getStockPrices, getStockTickers } from './stock-price.js';
import { getCompanyNews } from './news.js';

/**
 * Rich description for the financial_search tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const FINANCIAL_SEARCH_DESCRIPTION = `
Intelligent meta-tool for equity and company research. Takes a natural language query and automatically routes to company financials, price data, analyst estimates, insider activity, and company news.

## When to Use

- Company facts (sector, industry, market cap, number of employees, listing date, exchange, location, weighted average shares, website)
- Company financials (income statements, balance sheets, cash flow statements)
- Financial metrics (P/E ratio, market cap, EPS, dividend yield, enterprise value)
- Analyst estimates and price targets
- Company news and recent headlines
- Insider trading activity
- Current stock prices for equities
- Historical stock prices over date ranges
- Revenue segment breakdowns
- Multi-company comparisons (pass the full query, it handles routing internally)

## When NOT to Use

- Tokens, protocols, chains, on-chain activity, tokenomics, governance, or crypto market structure (use crypto_search / protocol_metrics)
- General web searches or non-financial topics (use web_search instead)
- Questions that do not require external financial data (answer directly from knowledge)
- Non-public company information
- Real-time trading or order execution

## Usage Notes

- Call ONCE with the complete natural language query. The tool handles complexity internally.
- For comparisons like "compare AAPL vs MSFT revenue", pass the full query as-is.
- For price move explanations and catalysts, this tool can return both price and news headlines.
- Handles ticker resolution automatically (Apple -> AAPL, Microsoft -> MSFT).
- Handles date inference (for example: "last quarter", "past 5 years", "YTD").
- Returns structured JSON data with source URLs for verification.
`.trim();

function formatSubToolName(name: string): string {
  return name.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const FINANCE_TOOLS: StructuredToolInterface[] = [
  getStockPrice,
  getStockPrices,
  getStockTickers,
  getIncomeStatements,
  getBalanceSheets,
  getCashFlowStatements,
  getAllFinancialStatements,
  getKeyRatios,
  getHistoricalKeyRatios,
  getAnalystEstimates,
  getCompanyNews,
  getInsiderTrades,
  getSegmentedRevenues,
];

const FINANCE_TOOL_MAP = new Map(FINANCE_TOOLS.map((tool) => [tool.name, tool]));

function buildRouterPrompt(): string {
  return `You are an equity research data routing assistant.
Current date: ${getCurrentDate()}

Given a user's natural language query about company or equity data, call the appropriate financial tool(s).

## Guidelines

1. Ticker resolution
   - Convert company names to ticker symbols when needed.
   - Examples: Apple -> AAPL, Tesla -> TSLA, Microsoft -> MSFT, Amazon -> AMZN, Alphabet -> GOOGL, Meta -> META, Nvidia -> NVDA.

2. Domain guardrail
   - This router is for public companies and listed equities.
   - Do NOT force token, protocol, chain, or on-chain questions into these tools. Those belong in crypto_search / protocol_metrics.

3. Date inference
   - "last year" -> report_period_gte about 1 year ago
   - "last quarter" -> report_period_gte about 3 months ago
   - "past 5 years" -> report_period_gte about 5 years ago and limit 5 (annual) or 20 (quarterly)
   - "YTD" -> report_period_gte Jan 1 of the current year

4. Tool selection
   - Current stock quote or snapshot -> get_stock_price
   - Historical stock prices over a date range -> get_stock_prices
   - Latest financial metrics snapshot (P/E, margins, ROE, EPS, growth rates) -> get_key_ratios
   - Historical valuation metrics over time -> get_historical_key_ratios
   - Revenue, earnings, profitability -> get_income_statements
   - Debt, assets, equity -> get_balance_sheets
   - Cash flow, free cash flow -> get_cash_flow_statements
   - News, catalysts, recent announcements -> get_company_news
   - "Why did X move?" -> combine get_stock_price + get_company_news
   - Comprehensive statement analysis -> get_all_financial_statements
   - Insider activity -> get_insider_trades
   - Revenue segments -> get_segmented_revenues

5. Efficiency
   - Prefer specific tools over general ones when possible.
   - Use get_all_financial_statements only when multiple statement types are needed.
   - For comparisons between companies, call the same tool for each ticker.
   - Use the smallest reasonable limit:
     - Latest questions -> limit 1
     - Short trend -> limit 3
     - Medium trend -> limit 5
   - Increase limits only when the user explicitly asks for long history.

Call the appropriate tool(s) now.`;
}

const FinancialSearchInputSchema = z.object({
  query: z.string().describe('Natural language query about company or equity data'),
});

export function createFinancialSearch(model: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'financial_search',
    description: `Intelligent agentic search for public-company and equity data. Use for:
- Company financials (income statements, balance sheets, cash flow)
- Financial metrics (P/E ratio, market cap, EPS, dividend yield)
- Analyst estimates and price targets
- Company news and recent headlines
- Insider trading activity
- Current and historical stock prices
- Public company comparisons
Do not use for crypto assets, protocol metrics, or tokenomics.`,
    schema: FinancialSearchInputSchema,
    func: async (input, _runManager, config?: RunnableConfig) => {
      const onProgress = config?.metadata?.onProgress as ((msg: string) => void) | undefined;

      onProgress?.('Searching company data...');
      const { response } = await callLlm(input.query, {
        model,
        systemPrompt: buildRouterPrompt(),
        tools: FINANCE_TOOLS,
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
            const tool = FINANCE_TOOL_MAP.get(toolCall.name);
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
