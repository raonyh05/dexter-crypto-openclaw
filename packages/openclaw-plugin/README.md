# Dexter Crypto OpenClaw Plugin

This package is a lightweight OpenClaw plugin scaffold for the crypto-first Dexter fork.

## Included

- `openclaw.plugin.json` with config schema for a read-only crypto provider
- sample tool ids for `dexter_crypto_search` and `dexter_protocol_metrics`
- bundled-skill directory hint pointing at `src/skills`
- sample per-agent OpenClaw config in `examples/openclaw.crypto-agent.sample.json`

## Intent

Keep the standalone Dexter CLI and gateway in the app root, and use this package as the place where OpenClaw-specific plugin registration and config wiring can evolve.
