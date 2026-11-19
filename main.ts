// gta6-meme-x-01 — "Waiting 13 years" meme renderer.
//
// This program IS the meme: it draws the picture from scratch with the Node
// standard library only (no network, no files outside this repository, no
// installs) and writes it out as meme.png, then hands POST.json to the
// grader the way the kit's starter does. Run it the way the grader does:
//
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Both runs write the same bytes: the picture is drawn from fixed numbers,
// so the PNG is byte-identical every time.
//
// The joke: GTA 6 took 13 years to arrive, so while the gamer waits on a
// loading screen stuck at 99%, their AI agent is already winning real money
// on make.fun. The make.fun ghost — white, thick black outline, two black
// four-pointed sparkle eyes, a round little hand, holding a magenta coin
// with a white star — floats over a Vice City sunset.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const W = 1200;
const H = 675;

// ---------------------------------------------------------------------------
// Tiny raster canvas (RGB, 8 bit). Everything below draws into this buffer.
// ---------------------------------------------------------------------------

const px = new Uint8Array(W * H * 3);

function setPixel(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x0, y0, x1, y1, c) {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(W, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(H, Math.ceil(y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const i = (y * W + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Vertical gradient through [stop, color] stops (stop is 0..1 down the canvas).
const SKY_STOPS = [
  [0.0, [22, 10, 51]],
  [0.35, [91, 26, 104]],
  [0.62, [198, 43, 126]],
  [0.8, [255, 107, 74]],
  [1.0, [255, 179, 71]],
];

function skyColor(y) {
  const t = Math.max(0, Math.min(1, y / H));
  for (let s = 0; s < SKY_STOPS.length - 1; s++) {
    const [t0, c0] = SKY_STOPS[s];
    const [t1, c1] = SKY_STOPS[s + 1];
    if (t >= t0 && t <= t1) return mix(c0, c1, (t - t0) / (t1 - t0));
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

function paintSky() {
  for (let y = 0; y < H; y++) {
    const c = skyColor(y);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
}

function fillCircle(cx, cy, r, c) {
  const r2 = r * r;
  const xa = Math.max(0, Math.floor(cx - r));
  const xb = Math.min(W - 1, Math.ceil(cx + r));
  const ya = Math.max(0, Math.floor(cy - r));
  const yb = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPixel(x, y, c);
    }
  }
}

// Scanline polygon fill.
function fillPolygon(points, c) {
  let minY = H;
  let maxY = 0;
  for (const p of points) {
    minY = Math.min(minY, Math.floor(p[1]));
    maxY = Math.max(maxY, Math.ceil(p[1]));
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPixel(x, y, c);
    }
  }
}

// Thick line: stamps circles along the segment.
function thickLine(x0, y0, x1, y1, w, c) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, w / 3)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

function quadPoint(p0, p1, p2, t) {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

function quadCurve(p0, p1, p2, w, c) {
  let prev = p0;
  const steps = 24;
  for (let s = 1; s <= steps; s++) {
    const p = quadPoint(p0, p1, p2, s / steps);
    thickLine(prev[0], prev[1], p[0], p[1], w, c);
    prev = p;
  }
}

// Star polygon: `points` tips, alternating outer/inner radius.
function star(cx, cy, rOuter, rInner, points, rot, c) {
  const pts = [];
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = rot + (i * Math.PI) / points;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  fillPolygon(pts, c);
}

// ---------------------------------------------------------------------------
// Bitmap font (5x7, hand-drawn). Only the glyphs the meme's text needs.
// ---------------------------------------------------------------------------

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '#...#', '.###.', '..#..', '..#..', '..#..'],
  ':': ['.....', '..#..', '..#..', '.....', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  f: ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  m: ['.....', '.....', '#.#.#', '##.##', '#.#.#', '#.#.#', '#.#.#'],
  n: ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#...#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

function textWidth(s, scale) {
  return s.length * 6 * scale - scale;
}

function drawTextAt(s, x0, y0, scale, c) {
  let x = x0;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '#') {
          fillRect(x + col * scale, y0 + r * scale, x + (col + 1) * scale, y0 + (r + 1) * scale, c);
        }
      }
    }
    x += 6 * scale;
  }
}

// Centred meme text: white fill, thick black outline, so it reads at a glance.
function drawMemeText(s, cx, y, scale) {
  const w = textWidth(s, scale);
  const x = Math.round(cx - w / 2);
  const o = Math.max(2, Math.round(scale / 2));
  const outline = [0, 0, 0];
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) {
    drawTextAt(s, x + dx, y + dy, scale, outline);
  }
  drawTextAt(s, x, y, scale, [255, 255, 255]);
}

// ---------------------------------------------------------------------------
// PNG encoder (zlib is in the standard library; CRC32 is 15 lines).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// The scene: Vice City sunset, synthwave sun, palm silhouettes, the
// make.fun ghost with its magenta star coin, a 99% loading bar, and the joke
// in big letters. Layout (1200x675):
//   top text    y  30..170   (two lines, scale 8)
//   sun+ghost   y 200..470
//   loading bar y 492..516
//   bottom text y 540..650   (two lines, scale 7)
// ---------------------------------------------------------------------------

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const MAGENTA = [255, 46, 136];
const GROUND = [20, 8, 46];
const SUN = [255, 233, 168];

function drawSun(cx, cy, r) {
  fillCircle(cx, cy, r, SUN);
  // Synthwave slats: horizontal gaps across the sun's lower half, cut in
  // the sky's own colour at that height, growing thicker toward the bottom.
  let y = cy + 6;
  let thick = 4;
  while (y < cy + r) {
    const dy = y - cy;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    fillRect(cx - half, y, cx + half, y + thick, skyColor(y));
    y += thick + 16;
    thick += 2;
  }
}

function drawPalm(baseX, crownX, crownY, lean) {
  // Trunk: a gentle quadratic curve from the ground to the crown.
  const base = [baseX, 472];
  const ctrl = [baseX + lean * 0.4, 360];
  const crown = [crownX, crownY];
  quadCurve(base, ctrl, crown, 15, BLACK);
  // Seven fronds drooping from the crown.
  const tips = [
    [crownX - 150, crownY + 55],
    [crownX - 110, crownY - 35],
    [crownX - 45, crownY - 75],
    [crownX + 25, crownY - 80],
    [crownX + 95, crownY - 45],
    [crownX + 140, crownY + 30],
    [crownX + 120, crownY + 85],
  ];
  for (const tip of tips) {
    const mid = [(crown[0] + tip[0]) / 2 + lean * 0.3, Math.min(crown[1], tip[1]) - 28];
    quadCurve(crown, mid, tip, 7, BLACK);
  }
  fillCircle(crown[0], crown[1], 10, BLACK);
}

function drawGhost(cx, top) {
  // The make.fun ghost: white body, thick black outline, two black
  // four-pointed sparkle eyes, a round little hand, holding a magenta coin
  // with a white star. Body is a circle-topped slab with a scalloped hem.
  const r = 82;
  const cy = top + r;
  const half = 78;
  const hemY = top + 235;
  // Outline pass (black, slightly larger), then the white body.
  fillCircle(cx, cy, r + 8, BLACK);
  fillRect(cx - half - 8, cy, cx + half + 8, hemY + 8, BLACK);
  for (const ox of [-52, 0, 52]) fillCircle(cx + ox, hemY + 8, 34, BLACK);
  fillCircle(cx, cy, r, WHITE);
  fillRect(cx - half, cy, cx + half, hemY, WHITE);
  for (const ox of [-52, 0, 52]) fillCircle(cx + ox, hemY, 28, WHITE);
  // Sparkle eyes (four-pointed stars).
  star(cx - 34, cy - 8, 17, 6, 4, -Math.PI / 2, BLACK);
  star(cx + 34, cy - 8, 17, 6, 4, -Math.PI / 2, BLACK);
  // Round little hand on the body's right edge, holding the coin up.
  fillCircle(cx + half + 2, cy + 92, 20, BLACK);
  fillCircle(cx + half + 2, cy + 92, 15, WHITE);
  // Magenta coin with a white star.
  fillCircle(cx + half + 34, cy + 58, 36, BLACK);
  fillCircle(cx + half + 34, cy + 58, 31, MAGENTA);
  star(cx + half + 34, cy + 58, 22, 9, 5, -Math.PI / 2, WHITE);
}

function drawLoadingBar() {
  const x0 = 350;
  const x1 = 850;
  const y0 = 492;
  const y1 = 516;
  fillRect(x0 - 3, y0 - 3, x1 + 3, y1 + 3, WHITE);
  fillRect(x0, y0, x1, y1, [40, 16, 66]);
  // 99% full: the wait is almost over. It never is.
  fillRect(x0 + 2, y0 + 2, x0 + 2 + Math.round((x1 - x0 - 4) * 0.99), y1 - 2, MAGENTA);
}

function renderMeme() {
  paintSky();
  drawSun(520, 320, 140);
  drawPalm(78, 132, 252, 55);
  drawPalm(1122, 1068, 252, -55);
  // Dark ground + neon horizon line.
  fillRect(0, 470, W, H, GROUND);
  fillRect(0, 468, W, 472, MAGENTA);
  drawGhost(660, 212);
  drawLoadingBar();
  // The joke, big enough to read when the picture is shrunk to 480 px.
  drawMemeText('ME: WAITING 13 YEARS', 600, 30, 8);
  drawMemeText('FOR GTA 6', 600, 102, 8);
  drawMemeText('MY AGENT: ALREADY WINNING', 600, 540, 7);
  drawMemeText('REAL MONEY ON make.fun', 600, 600, 7);
  return encodePng();
}

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const png = renderMeme();
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
  const postSrc = resolve(BOT_DIR, 'POST.json');
  const postDst = resolve(OUTPUT_DIR, 'POST.json');
  if (postSrc !== postDst) {
    try {
      copyFileSync(postSrc, postDst);
    } catch (err) {
      console.error(`POST.json could not be copied from ${BOT_DIR}: ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`meme.png: ${png.length} bytes, ${W}x${H}, POST.json copied`);
}

main();

