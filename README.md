# Dexter Crypto OpenClaw

Crypto-first research engine built from Dexter, with a standalone CLI plus an OpenClaw plugin scaffold.

## What Changed

- `crypto_search` is the primary router for token, protocol, narrative, governance, derivatives, and security research.
- `protocol_metrics` is now a structured-fundamentals router and only loads when `CRYPTO_RESEARCH_API_BASE_URL` is configured.
- crypto meta-tool aggregation preserves every subtool call, so repeated timeframe or repeated web/X searches no longer overwrite each other.
- crypto market data prefers `CRYPTO_RESEARCH_API_BASE_URL` and falls back to `FINANCIAL_DATASETS_API_KEY` only for price endpoints.
- OpenClaw packaging scaffold now lives in `packages/openclaw-plugin/`.

## Install

```bash
git clone https://github.com/raonyh05/dexter-crypto-openclaw.git
cd dexter-crypto-openclaw
bun install
cp env.example .env
```

Minimum setup for this fork:

```bash
XAI_API_KEY=your-xai-key
X_BEARER_TOKEN=your-x-bearer-token
CRYPTO_RESEARCH_API_BASE_URL=https://your-crypto-provider.example.com
CRYPTO_RESEARCH_API_KEY=your-provider-key
```

Optional fallback price provider:

```bash
FINANCIAL_DATASETS_API_KEY=your-financialdatasets-key
```

## Run

```bash
bun start
```

Default provider is xAI. OpenAI credentials are optional in this fork.

## OpenClaw

This repo still contains the standalone Dexter CLI and gateway app. For OpenClaw deployment, start from the plugin scaffold:

- manifest: `packages/openclaw-plugin/openclaw.plugin.json`
- sample agent config: `packages/openclaw-plugin/examples/openclaw.crypto-agent.sample.json`
- bundled skills source: `src/skills/`

Recommended OpenClaw posture:

- use `tools.profile = "minimal"`
- allow only the crypto research tools for the crypto agent
- deny write/exec/browser/gateway/session-spawn style tools
- treat the crypto provider as read-only

## Evals

Default eval dataset is now crypto-first:

```bash
bun run src/evals/run.ts
```

Use a custom dataset:

```bash
bun run src/evals/run.ts --dataset src/evals/dataset/crypto_agent.csv
```

## Notes

- `protocol_metrics` should be treated as structured crypto fundamentals, not a fallback web/X wrapper.
- `financial_search` and `financial_metrics` remain in the codebase for mixed or equity agents, but should usually be hidden from the OpenClaw crypto agent with per-agent tool allowlists.
- This repo does not wire wallet signing or trade execution. Keep crypto automation read-only unless you introduce a separate trust boundary.
