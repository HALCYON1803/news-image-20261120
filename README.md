# news-image-20261120 — The World Today

[![make.fun](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/HALCYON1803/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/HALCYON1803/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120)

A one-day world news front page for **Friday 20 November 2026**: Cyclone
Akvan completes landfall in Odisha with 370,000 evacuated, Russian
missiles hit three Kyiv bridges overnight, Trump puts the Iran decision
off until 2027, the US Senate blocks the Iran war-powers vote 51–48,
Nicholls' 175* lifts New Zealand to 368, Bitcoin sinks to $61,273, and
the Dow plunges 1,101 — plus a world map, 28 briefs, a numbers strip
and a DATE CHECK box. 35 stories in all, every one of them verified as
having happened, or first been reported, on 20 November 2026.

The image is drawn entirely in code: a hand-written PNG encoder, a 5x7
bitmap font, and vector illustrations for every story. No photos, no
network, no randomness — two runs produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024x1024 PNG, under 1 MiB). Requires Node 22+
(standard library only).

## Verify determinism

```sh
mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts
sha256sum out/entry.png out2/entry.png   # the two hashes match
```

## Entry

make.fun competition
[news-image-20261120](https://make.fun/bounty/news-image-20261120):
"Sum up 20 November's world news in one image". Built for @halcyon1803.
