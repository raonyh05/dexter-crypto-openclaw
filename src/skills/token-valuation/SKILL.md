---
name: token-valuation
description: Build a crypto-native valuation snapshot using token structure, protocol metrics, emissions, unlocks, treasury, and peer comps.
---

# Token Valuation

Use this skill when the user asks whether a token looks cheap or expensive, wants relative valuation, or needs a valuation snapshot for a token or protocol.

## Workflow

1. Gather core market structure with `crypto_search`
   - Pull spot price context, recent move, and any obvious narrative drivers.

2. Pull structured fundamentals with `protocol_metrics`
   - Focus on:
   - circulating supply vs FDV
   - fees, revenue, users, treasury
   - unlocks, emissions, staking yield
   - liquidity and derivatives stress when relevant

3. Build peer comparison
   - Compare against the closest token set by sector, chain, and business model.
   - Use ratios like MC/fees, FDV/fees, MC/revenue, FDV/revenue, TVL ratio, and treasury runway when the data exists.

4. Write the answer in this order
   - `valuation snapshot`
   - `peer comps`
   - `cheap/expensive drivers`
   - `invalidation triggers`
   - `cheap-looking but dangerous`

## Guardrails

- Do not force equity DCF language onto tokens unless the protocol clearly has durable cash-flow claims.
- If the structured data is incomplete, say which ratios are missing instead of inventing them.
- Separate spot narrative from actual valuation drivers.
