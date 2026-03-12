export type AggregatedResultItem = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  data: unknown;
  sourceUrls: string[];
  error?: string | null;
};

function stableArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildAggregatedToolPayload(
  results: Array<{
    tool: string;
    args: unknown;
    data: unknown;
    sourceUrls?: string[];
    error?: string | null;
  }>,
): { data: { results: AggregatedResultItem[]; errors?: Array<{ tool: string; args: Record<string, unknown>; error: string }> }; sourceUrls: string[] } {
  const items: AggregatedResultItem[] = results.map((result, index) => ({
    id: `${result.tool}:${index + 1}`,
    tool: result.tool,
    args:
      result.args && typeof result.args === 'object' && !Array.isArray(result.args)
        ? stableArgs(result.args as Record<string, unknown>)
        : {},
    data: result.data,
    sourceUrls: result.sourceUrls ?? [],
    error: result.error ?? null,
  }));

  const successful = items.filter((item) => !item.error);
  const failed = items
    .filter((item): item is AggregatedResultItem & { error: string } => typeof item.error === 'string' && item.error.length > 0)
    .map(({ tool, args, error }) => ({ tool, args, error }));

  return {
    data: failed.length > 0 ? { results: successful, errors: failed } : { results: successful },
    sourceUrls: [...new Set(items.flatMap((item) => item.sourceUrls))],
  };
}
