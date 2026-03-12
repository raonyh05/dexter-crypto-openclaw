import { StructuredToolInterface } from '@langchain/core/tools';
import {
  createFinancialSearch,
  createFinancialMetrics,
  createCryptoSearch,
  createProtocolMetrics,
  createReadFilings,
  hasProtocolMetricsTools,
} from './finance/index.js';
import {
  WEB_SEARCH_DESCRIPTION,
  X_SEARCH_DESCRIPTION,
  getConfiguredWebSearchTool,
  getConfiguredXSearchTool,
} from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from './fetch/web-fetch.js';
import { browserTool, BROWSER_DESCRIPTION } from './browser/browser.js';
import { readFileTool, READ_FILE_DESCRIPTION } from './filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './filesystem/edit-file.js';
import { FINANCIAL_SEARCH_DESCRIPTION } from './finance/financial-search.js';
import { FINANCIAL_METRICS_DESCRIPTION } from './finance/financial-metrics.js';
import { CRYPTO_SEARCH_DESCRIPTION } from './finance/crypto-search.js';
import { PROTOCOL_METRICS_DESCRIPTION } from './finance/protocol-metrics.js';
import { READ_FILINGS_DESCRIPTION } from './finance/read-filings.js';
import { heartbeatTool, HEARTBEAT_TOOL_DESCRIPTION } from './heartbeat/heartbeat-tool.js';
import {
  memoryGetTool,
  MEMORY_GET_DESCRIPTION,
  memorySearchTool,
  MEMORY_SEARCH_DESCRIPTION,
  memoryUpdateTool,
  MEMORY_UPDATE_DESCRIPTION,
} from './memory/index.js';
import { discoverSkills } from '../skills/index.js';

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  name: string;
  tool: StructuredToolInterface;
  description: string;
}

export function getToolRegistry(model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [
    {
      name: 'financial_search',
      tool: createFinancialSearch(model),
      description: FINANCIAL_SEARCH_DESCRIPTION,
    },
    {
      name: 'financial_metrics',
      tool: createFinancialMetrics(model),
      description: FINANCIAL_METRICS_DESCRIPTION,
    },
    {
      name: 'crypto_search',
      tool: createCryptoSearch(model),
      description: CRYPTO_SEARCH_DESCRIPTION,
    },
    {
      name: 'read_filings',
      tool: createReadFilings(model),
      description: READ_FILINGS_DESCRIPTION,
    },
    {
      name: 'web_fetch',
      tool: webFetchTool,
      description: WEB_FETCH_DESCRIPTION,
    },
    {
      name: 'browser',
      tool: browserTool,
      description: BROWSER_DESCRIPTION,
    },
    {
      name: 'read_file',
      tool: readFileTool,
      description: READ_FILE_DESCRIPTION,
    },
    {
      name: 'write_file',
      tool: writeFileTool,
      description: WRITE_FILE_DESCRIPTION,
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
    },
    {
      name: 'heartbeat',
      tool: heartbeatTool,
      description: HEARTBEAT_TOOL_DESCRIPTION,
    },
    {
      name: 'memory_search',
      tool: memorySearchTool,
      description: MEMORY_SEARCH_DESCRIPTION,
    },
    {
      name: 'memory_get',
      tool: memoryGetTool,
      description: MEMORY_GET_DESCRIPTION,
    },
    {
      name: 'memory_update',
      tool: memoryUpdateTool,
      description: MEMORY_UPDATE_DESCRIPTION,
    },
  ];

  if (hasProtocolMetricsTools()) {
    tools.splice(3, 0, {
      name: 'protocol_metrics',
      tool: createProtocolMetrics(model),
      description: PROTOCOL_METRICS_DESCRIPTION,
    });
  }

  const webSearchTool = getConfiguredWebSearchTool();
  if (webSearchTool) {
    tools.push({
      name: 'web_search',
      tool: webSearchTool,
      description: WEB_SEARCH_DESCRIPTION,
    });
  }

  const xSearchTool = getConfiguredXSearchTool();
  if (xSearchTool) {
    tools.push({
      name: 'x_search',
      tool: xSearchTool,
      description: X_SEARCH_DESCRIPTION,
    });
  }

  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({
      name: 'skill',
      tool: skillTool,
      description: SKILL_TOOL_DESCRIPTION,
    });
  }

  return tools;
}

export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((entry) => entry.tool);
}

export function buildToolDescriptions(model: string): string {
  return getToolRegistry(model)
    .map((entry) => `### ${entry.name}\n\n${entry.description}`)
    .join('\n\n');
}
