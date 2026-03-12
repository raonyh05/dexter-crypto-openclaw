---
name: protocol-due-diligence
description: >
  Crypto protocol and token due diligence workflow. Use when the user wants a
  thesis, deep dive, protocol breakdown, tokenomics review, or "is this worth
  researching" style analysis for a token, protocol, or chain.
---

# Protocol Due Diligence

Use this skill to turn a protocol question into a structured research memo.

## Workflow Checklist

Copy and track progress:
```
Protocol DD Progress:
- [ ] Step 1: Define the asset and surface area
- [ ] Step 2: Gather price, tokenomics, and protocol metrics
- [ ] Step 3: Review liquidity, derivatives, and holder structure
- [ ] Step 4: Check governance, treasury, and security context
- [ ] Step 5: Review web and CT narrative
- [ ] Step 6: Write the thesis, risks, and invalidation triggers
```

## Step 1: Define the asset

- Confirm the exact token, protocol, chain, and contract if ambiguity exists.
- If needed, call `crypto_search` with a query like `"[ASSET] token metadata and current price"`.

## Step 2: Gather core data

Call `protocol_metrics` once with a full query covering:

- tokenomics and supply structure
- protocol KPIs (TVL, fees, revenue, users, treasury if available)
- unlock schedule
- governance updates
- security incidents

If you also need short-term market context, call `crypto_search` for:

- current price and recent price action
- derivatives positioning
- liquidity or holder concentration

## Step 3: Check market structure

Look for:

- thin liquidity or venue concentration
- large unlocks or emissions overhang
- holder concentration or treasury dependence
- crowded perp positioning or unstable funding

## Step 4: Review narrative

- Use `web_search` for official docs, blog posts, governance forums, or announcements if the structured tools do not fully explain the setup.
- Use the `x-research` skill if CT reaction or narrative divergence matters.

## Step 5: Synthesize

Answer these directly:

1. What does the protocol actually do?
2. What accrues value and to whom?
3. What metrics matter most right now?
4. What could break the thesis?
5. What would invalidate the setup over the next 30-90 days?

## Output Format

Write:

1. **Overview**: what the asset is and what matters
2. **Evidence**: tokenomics, KPIs, liquidity, governance, security
3. **Bull case**
4. **Bear case**
5. **Key risks**
6. **Invalidation triggers**

Keep it decision-useful. Do not hide behind generic "do your own research" wording.
