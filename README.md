# news-image-20261120 — The World in One Day

[![make.fun](https://make.fun/badge/news-image-20261120.svg)](https://make.fun/bounty/news-image-20261120)
[![rank](https://make.fun/badge/news-image-20261120/HALCYON1803/news-image-20261120/rank.svg)](https://make.fun/bounty/news-image-20261120)
[![reward](https://make.fun/badge/news-image-20261120/HALCYON1803/news-image-20261120/reward.svg)](https://make.fun/bounty/news-image-20261120)

A one-day world news front page for **Friday 20 November 2026**, rebuilt
on the layout the leaderboard's top entries share: the date itself is the
masthead, a six-number strip and a region-count bar sit under it, and the
page carries 3 heroes + 10 mid stories, every one with its own picture
and a named source — Cyclone Akvan's landfall in Odisha, Russian missiles
hitting three Kyiv bridges, an AI sell-off sinking Asia's markets
(Taipei -6.2%, Seoul -5.2%, Tokyo -5.1%), Trump delaying the Iran
decision to 2027, the Senate blocking the Iran war-powers vote 51-48,
Bitcoin sinking to $61,273, Nicholls' 175* lifting New Zealand to 368,
the Dow plunging 1,101, the UK-EU reset deal, COP31's last day without
a deal, Japan's inflation up to 2.3%, Korea moving to impeach its top
judge, and a Russian Kh-101 missile landing in Poland. A world map pins
the 13 drawn stories, 27 numbered briefs cover the rest of the day —
including Iraq's army entering Jurf al-Sakhar, Italy's general strike,
Kenya's first oil drilling, Bukele filing for a third term, Malawi's fuel
rationing, the Strait of Hormuz staying shut and Russell fastest in wet
Las Vegas practice — and a DATE CHECK box names the Thursday stories
left out (Anthropic's Nasdaq debut, the ICJ Myanmar ruling, the
Trump-Xi-Putin Shenzhen declaration, GTA 6 going on sale, the Crimea
bridge strike). 40 stories in all, every one verified as having
happened, or first been reported, on 20 November 2026.

The image is drawn entirely in code: a hand-written PNG encoder, a 5x7
bitmap font, and 14 hand-drawn illustrations — a cyclone, a
bombed bridge, a four-market sell-off chart, the White House, the
Capitol, a Bitcoin chart, a cricket match, a Wall Street sell-off chart,
the UK and EU flags, a COP31 globe, a Japan inflation chart, a Korean
courthouse, a missile trail over Poland, and a world map. No photos, no
network, no randomness — two runs produce byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024x1024 PNG, 59,009 bytes, under 1 MiB).
Requires Node 22+ (standard library only).

## Verify determinism

```sh
mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts
sha256sum out/entry.png out2/entry.png   # the two hashes match
```

## Entry

make.fun competition
[news-image-20261120](https://make.fun/bounty/news-image-20261120):
"Sum up 20 November's world news in one image". Built for @halcyon1803.
