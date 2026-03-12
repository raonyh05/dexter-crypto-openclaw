---
name: event-driven-trade-check
description: >
  Crypto event-driven check for catalysts and risks. Use when the user asks
  about a token move, unlock, governance vote, listing, exploit, or whether a
  near-term event changes the trade.
---

# Event-Driven Trade Check

Use this skill when the important question is "what event matters here, and how should it change the setup?"

## Workflow

1. Define the event
   - Unlock, listing, governance vote, exploit, incentive change, treasury transfer, partnership, or narrative break.

2. Pull immediate market context
   - Use `crypto_search` for current price, recent price action, and derivatives positioning.

3. Pull event-specific fundamentals
   - Use `protocol_metrics` for unlocks, governance updates, treasury flows, or security incidents.

4. Pull supporting context
   - Use `web_search` for official announcements or governance pages when needed.
   - Use `x-research` if CT reaction is part of the story.

5. Decide what changed
   - Did supply change?
   - Did incentives change?
   - Did governance change?
   - Did security assumptions change?
   - Did positioning become more crowded or more washed out?

## Output Format

Provide:

1. **Event summary**
2. **What changed mechanically**
3. **What changed in positioning or narrative**
4. **Bullish implications**
5. **Bearish implications**
6. **What to watch next**

Avoid abstract market commentary. Anchor the answer in the event itself.
