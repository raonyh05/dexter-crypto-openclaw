---
name: x-research
description: >
  Crypto CT and X/Twitter research. Searches X for real-time sentiment,
  catalysts, governance reactions, exploit chatter, and narrative divergence.
  Use when the user asks "what's CT saying", "check X/Twitter", "market
  sentiment", "community reaction", or wants to know how crypto-native
  accounts are framing a token, protocol, chain, or event.
---

# X Research Skill

Agentic research over X/Twitter using the `x_search` tool. This skill is tuned
for crypto topics, where signal often lives in the split between official
accounts, sophisticated CT, and noisy shill traffic.

## Research Loop

### 1. Break the question into search lanes

Turn the research question into 3-5 targeted searches:

- **Core narrative**: token, protocol, chain, or event keywords
- **Official lane**: project account, founder, foundation, or governance handle
- **Bull case lane**: catalyst, upside, adoption, inflow, listing, revenue, fee growth
- **Bear case lane**: unlock, dilution, exploit, governance risk, emissions, outflow, overvalued
- **Evidence lane**: `has:links` to surface posts that cite dashboards, governance posts, docs, or articles

### 2. Use crypto-specific noise control

Default operators for crypto topics:

- `-is:reply` to focus on original posts
- `-airdrop -giveaway -whitelist -points -referral` to cut spam
- Add `lang:en` when the result set is too broad
- Use cashtags and protocol names together when collisions are common
- Raise `min_likes` quickly if results are low quality

### 3. Execute searches

Use `x_search` with `command: "search"`:

- Start with `sort: "likes"` and `limit: 15`
- Use `since: "1d"` for fast-moving events and `since: "7d"` for broader narrative checks
- If the query is noisy, increase `min_likes` and narrow terms
- If the query is too sparse, broaden with `OR` terms and remove restrictive filters

### 4. Prioritize account tiers

When multiple posts say the same thing, prioritize:

1. Official protocol or foundation accounts
2. Founders, core contributors, governance delegates, and major ecosystem builders
3. High-signal researchers, analysts, or traders with evidence
4. Broader CT sentiment

### 5. Follow threads when needed

If a high-signal tweet appears to be a thread starter or contains a partial claim:

- Use `command: "thread"` to get the full context
- Pull the whole thread before summarizing if the claim changes materially across posts

### 6. Synthesize around decision-useful buckets

Group findings into:

1. **Narrative**: what CT thinks is happening
2. **Catalysts**: launches, governance votes, listings, partnerships, fee/revenue changes
3. **Risks**: exploit chatter, unlock concern, emissions, treasury selling, governance capture
4. **Divergence**: where official messaging and CT interpretation differ

## Refinement Heuristics

| Problem | Fix |
|---|---|
| Too much shill spam | Add `-airdrop -giveaway -whitelist -points`, raise `min_likes` |
| Too many replies | Add `-is:reply` |
| Need official view | Use `from:project_account` or `command: "profile"` |
| Need evidence, not hot takes | Add `has:links` |
| Need faster event pulse | Use `since: "12h"` or `since: "1d"` |
| Query collisions | Combine token symbol, protocol name, and chain |

## Output Format

Present a structured briefing:

1. **Search scope**: what was searched and the time window
2. **Key narratives**: grouped themes with sourced tweet links
3. **Catalysts and risks**: concrete event-level takeaways
4. **Divergence**: official line vs CT interpretation, if any
5. **Bottom line**: bullish, bearish, mixed, or confused sentiment, with confidence

Keep the synthesis tight. The goal is not to quote the timeline back to the user. The goal is to surface the parts of CT that are most likely to matter for research or positioning.
