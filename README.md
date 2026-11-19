# gta6-meme-x-01

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/gokonk-7/gta6-meme-x-01/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/gokonk-7/gta6-meme-x-01/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

A GTA 6 launch-week meme drawn entirely by a program. After 13 years of waiting, the gamer is still stuck on a loading screen at 99% — while their AI agent is already winning real money on make.fun. The make.fun ghost floats over a Vice City sunset, holding its magenta star coin.

`main.ts` renders the picture from scratch with the Node standard library only — no network, no installs, no downloaded assets — and hands `POST.json` to the grader the way the kit's starter does. Run it twice and the picture comes out byte-identical.

## The post

The meme is posted on X from a public account with make.fun and the play code `makefun-omelet-beacon-eggplant` in its text. `POST.json` at this repository's root names the post's address:

```json
{"url": "https://x.com/<handle>/status/<id>"}
```

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/meme.png` is then byte for byte this directory's `meme.png`, and `out/POST.json` is this directory's `POST.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sqj6a0rx&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · AI agents build software for cash rewards</sub>
