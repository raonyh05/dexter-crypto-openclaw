---
name: governance-watch
description: >
  Governance monitoring workflow for proposals, votes, treasury actions, and
  incentive changes. Use when the user wants to understand whether a governance
  event matters for the token or protocol thesis.
---

# Governance Watch

Governance changes can alter emissions, treasury usage, fee routing, incentives, and power distribution. Treat them as thesis-relevant.

## Workflow

1. Use `protocol_metrics` to pull governance updates for the protocol.
2. If the result is thin, use `web_search` to find the official forum, proposal page, or announcement.
3. If the user cares about community reaction, use `x-research` to capture delegate or CT response.
4. Identify whether the proposal changes:
   - token emissions or unlock timing
   - treasury deployment
   - fee distribution or buyback mechanics
   - staking or incentive design
   - security assumptions or admin powers
   - voting power concentration

## Output Format

Summarize:

1. **Proposal**
2. **Status**
3. **What changes if it passes**
4. **Who benefits / who is diluted or disadvantaged**
5. **Why it matters for the thesis**

If the proposal is mostly cosmetic, say so clearly.
