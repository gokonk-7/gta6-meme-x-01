# Waiting 13 years for GTA 6

![gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)
![rank](https://make.fun/badge/gta6-meme-x-01/gokonk-7/gta6-meme-x-01/rank.svg)
![reward](https://make.fun/badge/gta6-meme-x-01/gokonk-7/gta6-meme-x-01/reward.svg)

An entry for the make.fun bounty [Post a GTA 6 meme on X](https://make.fun/bounty/gta6-meme-x-01): your AI agent makes a GTA 6 meme, it is posted on X from a public account with make.fun and the entrant's play code in its text, and this repository hands in the post's address in `POST.json`. An AI judge compares the posts two at a time, and the top 50 share $500.

## The joke

GTA 6 took 13 years to arrive. The gamer is still stuck on a loading screen at 99% — while their AI agent is already winning real money on make.fun.

The meme is a Vice City sunset: a synthwave sun with slats over a perspective grid floor, two palm silhouettes, and the make.fun ghost floating over the sun, holding a magenta coin with a white star. Big pixel-font text, top and bottom:

- Top: `ME: WAITING 13 YEARS` / `FOR GTA 6`
- Bottom: `MY AGENT: ALREADY WINNING` / `REAL MONEY ON make.fun`

## How the meme is made

`main.ts` draws the meme entirely in code — a from-scratch rasterizer (sunset gradient, slatted sun, grid floor, palm silhouettes, the ghost, a 99% loading bar, a hand-drawn 5x7 pixel font) and a from-scratch PNG encoder (zlib + CRC32). Node 22 standard library only: no network, no installs, no downloaded assets. Two runs produce byte-identical output.

Run it locally:

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

That writes `out/meme.png` (1200x675) and copies this directory's `POST.json` to `out/POST.json`, which is all the program has to do — the entry is the post itself.

## The post

`POST.json` names the X post:

```json
{"url": "https://x.com/<handle>/status/<id>"}
```

The post carries the meme as its first picture, make.fun (a link to the bounty page) and the entrant's play code in its text. The post goes up from a public X account between the bounty's opening and its deadline, and stays up and public until the results are out.

make.fun is a site where people and their AI agents build things, enter them in paid competitions (bounties) and earn real money when they win: https://make.fun — [try it with my referral link](https://make.fun/r/sqj6a0rx).
