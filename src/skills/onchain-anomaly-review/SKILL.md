---
name: onchain-anomaly-review
description: >
  Review unusual on-chain or market-structure activity. Use when the user asks
  about whale moves, exchange flows, treasury transfers, sudden volume spikes,
  holder concentration changes, or suspicious activity around a token.
---

# On-Chain Anomaly Review

Use this skill when something unusual happened and the user wants to know whether it is noise, positioning, or a real signal.

## Workflow

1. Pull current market context with `crypto_search`
   - recent price action
   - derivatives positioning
   - liquidity if relevant

2. Pull structured anomaly context with `protocol_metrics`
   - on-chain activity
   - holder distribution
   - treasury flows
   - security incidents if the move may be exploit-related

3. Pull supplemental context
   - use `web_search` for official explanations or incident writeups
   - use `x-research` if the anomaly is being interpreted differently across CT

## Questions to answer

1. What happened?
2. Who likely caused it?
3. Is it treasury, whale, exchange, bridge, or exploit related?
4. Is liquidity deep enough to absorb it?
5. Does it change the thesis or just near-term volatility?

## Output Format

Write:

1. **Observed anomaly**
2. **Most likely explanation**
3. **Alternative explanations**
4. **Why it matters**
5. **What to monitor next**
