# token-launch-radar-v2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/helterskeltersz/token-launch-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/helterskeltersz/token-launch-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar: a program that reads a sealed snapshot of 758 DeFi protocols and ranks the 198 that record no token by implied launch value, each with a seven-step farm plan. Implied FDV = TVL x category multiple x growth x maturity, where the category multiple is the median market-cap/TVL of launched protocols in the same category, shrunk toward the global prior 0.246 (k=3) and clamped to 0.02-3.0. Bridges, liquid staking/restaking, CEXs and wrapped/staked products are excluded from the comparables and the board; live-token protocols are set aside on their own tab. The dashboard is a static dark page with search, category/chain/TVL filters, sorting, hash deep-links and a detail dialog per protocol. Deterministic: two runs on the same snapshot write byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=q51ts0y5&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
