import type { StructuredToolInterface } from '@langchain/core/tools';
import { tavilySearch } from './tavily.js';
import { exaSearch } from './exa.js';
import { perplexitySearch } from './perplexity.js';
import { xSearchTool } from './x-search.js';

/**
 * Rich description for the web_search tool.
 * Used in the system prompt to guide the LLM on when and how to use this tool.
 */
export const WEB_SEARCH_DESCRIPTION = `
Search the web for current information on any topic. Returns relevant search results with URLs and content snippets.

## When to Use

- Historical stock prices for equities (current prices available via financial_search)
- Factual questions about entities (companies, people, organizations) where status can change
- Current events, breaking news, recent developments
- Technology updates, product announcements, industry trends
- Verifying claims about real-world state (public/private, active/defunct, current leadership)
- Research on topics outside of structured financial data
- Crypto protocol/news research when structured crypto tools do not cover the question

## When NOT to Use

- Structured company financial data (financials, SEC filings, analyst estimates, key ratios - use financial_search instead)
- Structured crypto research data (tokenomics, protocol metrics, on-chain, governance, unlocks - use crypto_search / protocol_metrics when available)
- Pure conceptual/definitional questions ("What is a DCF?")

## Usage Notes

- Provide specific, well-formed search queries for best results
- Returns up to 5 results with URLs and content snippets
- Use for supplementary research when financial_search, crypto_search, or protocol_metrics do not cover the topic
`.trim();

export { tavilySearch } from './tavily.js';
export { exaSearch } from './exa.js';
export { perplexitySearch } from './perplexity.js';
export { xSearchTool, X_SEARCH_DESCRIPTION } from './x-search.js';

export function getConfiguredWebSearchTool(): StructuredToolInterface | null {
  if (process.env.EXASEARCH_API_KEY) {
    return exaSearch;
  }
  if (process.env.PERPLEXITY_API_KEY) {
    return perplexitySearch;
  }
  if (process.env.TAVILY_API_KEY) {
    return tavilySearch;
  }
  return null;
}

export function hasConfiguredWebSearchTool(): boolean {
  return getConfiguredWebSearchTool() !== null;
}

export function getConfiguredXSearchTool(): StructuredToolInterface | null {
  return process.env.X_BEARER_TOKEN ? xSearchTool : null;
}

export function hasConfiguredXSearchTool(): boolean {
  return getConfiguredXSearchTool() !== null;
}
