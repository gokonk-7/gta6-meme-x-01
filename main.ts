// gta6-meme-x-01 — "Waiting 13 years for GTA 6".
//
// The joke: GTA 6 took 13 years to arrive. The gamer is still stuck on a
// loading screen at 99%, while their AI agent is already winning real money
// on make.fun.
//
// This program draws the meme as a 1200x675 PNG with a from-scratch
// rasterizer — a Vice City sunset gradient, a synthwave sun with slats, a
// perspective grid floor, two palm silhouettes, the make.fun ghost floating
// over the sun holding a magenta coin with a white star, a 99%-full magenta
// loading bar, and big hand-drawn pixel text — plus a from-scratch PNG
// encoder (zlib + CRC32). Node 22 standard library only: no network, no
// installs, no downloaded assets. Rendering is fully deterministic: two runs
// produce byte-identical output.
//
// The grader reads /output/POST.json, so main() also copies POST.json from
// the bot directory into the output directory next to the rendered meme.
//
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

export const WIDTH = 1200;
export const HEIGHT = 675;

type RGB = [number, number, number];

// ---------------------------------------------------------------------------
// Canvas: an RGB image with the few drawing primitives the meme needs.
// ---------------------------------------------------------------------------

class Img {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 3);
  }

  // Set one pixel, blending over what is already there (alpha 0..1).
  px(x: number, y: number, r: number, g: number, b: number, a = 1): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    if (a >= 1) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
    } else if (a > 0) {
      this.data[i] = Math.round(this.data[i] * (1 - a) + r * a);
      this.data[i + 1] = Math.round(this.data[i + 1] * (1 - a) + g * a);
      this.data[i + 2] = Math.round(this.data[i + 2] * (1 - a) + b * a);
    }
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        this.px(x, y, c[0], c[1], c[2]);
      }
    }
  }

  // Filled disc.
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      const dy = y - cy;
      const dx = Math.sqrt(Math.max(0, r2 - dy * dy));
      for (let x = Math.floor(cx - dx); x <= Math.ceil(cx + dx); x++) {
        this.px(x, y, c[0], c[1], c[2]);
      }
    }
  }

  // Thick line, drawn by stamping discs along the segment.
  thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len * 2));
    const r = w / 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.disc(x0 + dx * t, y0 + dy * t, r, c);
    }
  }

  // Quadratic bezier curve as a thick line.
  quad(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, c: RGB): void {
    const steps = 28;
    let px = x0;
    let py = y0;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      this.thickLine(px, py, x, y, w, c);
      px = x;
      py = y;
    }
  }

  // Scanline fill of a simple polygon, given as [x, y] points.
  polygon(points: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x <= Math.min(this.w - 1, Math.floor(xs[k + 1])); x++) {
          this.px(x, y, c[0], c[1], c[2]);
        }
      }
    }
  }

  // Star polygon: n points, outer radius ro, inner radius ri, rotated so the
  // first outer vertex sits at angle rot.
  star(cx: number, cy: number, n: number, ro: number, ri: number, rot: number, c: RGB): void {
    const pts: Array<[number, number]> = [];
    const total = n * 2;
    for (let i = 0; i < total; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const ang = rot + (i * Math.PI) / n;
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    this.polygon(pts, c);
  }
}

// ---------------------------------------------------------------------------
// Colour helpers.
// ---------------------------------------------------------------------------

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// The sunset sky: deep purple at the top, hot magenta in the middle, burning
// orange at the horizon.
const SKY_STOPS: Array<[number, RGB]> = [
  [0.0, [26, 11, 46]],
  [0.3, [75, 21, 121]],
  [0.52, [164, 19, 110]],
  [0.72, [255, 46, 99]],
  [0.88, [255, 122, 61]],
  [1.0, [255, 183, 77]],
];

function skyAt(y: number, horizon: number): RGB {
  const t = Math.max(0, Math.min(1, y / horizon));
  for (let i = 1; i < SKY_STOPS.length; i++) {
    if (t <= SKY_STOPS[i][0]) {
      const [t0, c0] = SKY_STOPS[i - 1];
      const [t1, c1] = SKY_STOPS[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

// ---------------------------------------------------------------------------
// PNG encoder, from scratch: CRC32, chunk framing, zlib deflate.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePng(img: Img): Buffer {
  // One filter byte (0 = none) per scanline, then the raw RGB rows.
  const stride = 1 + img.w * 3;
  const raw = Buffer.alloc(img.h * stride);
  for (let y = 0; y < img.h; y++) {
    raw[y * stride] = 0;
    raw.set(img.data.subarray(y * img.w * 3, (y + 1) * img.w * 3), y * stride + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0);
  ihdr.writeUInt32BE(img.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Pixel font: hand-drawn 5x7 glyphs, each one 7 rows of 5 bits.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['00000', '00100', '00000', '00000', '00000', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  // Lowercase, only what "make.fun" needs.
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01000', '01000', '11110', '01000', '01000', '01000'],
  k: ['00000', '10000', '10010', '10100', '11000', '10100', '10010'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
};

function drawGlyph(img: Img, ch: string, x: number, y: number, scale: number, c: RGB): void {
  const glyph = FONT[ch];
  if (!glyph) return;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (glyph[r][col] === '1') {
        img.fillRect(x + col * scale, y + r * scale, x + (col + 1) * scale, y + (r + 1) * scale, c);
      }
    }
  }
}

// Draw one line of text centred on cx, with a hard offset shadow for punch.
function drawText(img: Img, text: string, cx: number, y: number, scale: number, c: RGB, shadow: RGB): void {
  const w = text.length * 6 * scale - scale;
  const startX = Math.round(cx - w / 2);
  const passes: Array<[number, number, RGB]> = [
    [4, 4, shadow],
    [0, 0, c],
  ];
  for (const [ox, oy, col] of passes) {
    let gx = startX + ox;
    for (const ch of text) {
      if (ch !== ' ') drawGlyph(img, ch, gx, y + oy, scale, col);
      gx += 6 * scale;
    }
  }
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

const HORIZON = 440;
const SUN_CX = 600;
const SUN_CY = 300;
const SUN_R = 140;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const YELLOW: RGB = [255, 211, 25];
const MAGENTA: RGB = [255, 41, 117];
const GROUND: RGB = [13, 2, 33];
const INK: RGB = [10, 2, 24]; // near-black silhouette colour

// The sun's own gradient: yellow at the top, hot pink at the bottom.
function sunColor(t: number): RGB {
  if (t < 0.5) return mix([255, 211, 25], [255, 120, 60], t * 2);
  return mix([255, 120, 60], [255, 41, 117], (t - 0.5) * 2);
}

function drawSun(img: Img): void {
  for (let y = SUN_CY - SUN_R; y <= SUN_CY + SUN_R; y++) {
    const dy = y - SUN_CY;
    const dx = Math.sqrt(Math.max(0, SUN_R * SUN_R - dy * dy));
    img.fillRect(SUN_CX - dx, y, SUN_CX + dx, y + 1, sunColor((y - (SUN_CY - SUN_R)) / (2 * SUN_R)));
  }
  // Slats: horizontal gaps that let the sky show through the sun's lower
  // half, widening as they go down.
  let y = SUN_CY + 18;
  let gap = 3;
  while (y < SUN_CY + SUN_R) {
    const dy = y - SUN_CY;
    const dx = Math.sqrt(Math.max(0, SUN_R * SUN_R - dy * dy));
    img.fillRect(SUN_CX - dx, y, SUN_CX + dx, y + gap, skyAt(y, HORIZON));
    y += gap + 13;
    gap += 3;
  }
}

function drawGround(img: Img): void {
  img.fillRect(0, HORIZON, WIDTH, HEIGHT, GROUND);
  // Perspective lines fanning out from the vanishing point on the horizon.
  for (let i = -8; i <= 8; i++) {
    const fade = 0.55 * (Math.abs(i) / 8);
    img.thickLine(600 + i * 52, HORIZON, 600 + i * 210, HEIGHT, 2, mix(MAGENTA, GROUND, fade));
  }
  // Horizontal lines, spaced wider the closer they get.
  for (let k = 1; k <= 6; k++) {
    const t = (k / 6) * (k / 6);
    const y = HORIZON + t * (HEIGHT - HORIZON);
    img.fillRect(0, y, WIDTH, y + 2, mix(MAGENTA, GROUND, 0.6 * (1 - t)));
  }
}

// One palm silhouette: a leaning trunk and eight drooping fronds.
function drawPalm(img: Img, baseX: number, topX: number, topY: number, len: number): void {
  img.quad(baseX, HEIGHT + 4, baseX + (topX - baseX) * 0.3, HEIGHT - 70, topX, topY, 13, INK);
  const spreads = [-1, -0.72, -0.44, -0.16, 0.16, 0.44, 0.72, 1];
  for (const s of spreads) {
    const ex = topX + s * len;
    const ey = topY + len * 0.55;
    const cx = topX + s * len * 0.62;
    const cy = topY - len * 0.38;
    img.quad(topX, topY, cx, cy, ex, ey, 5, INK);
  }
  // A pair of coconuts under the crown.
  img.disc(topX - 10, topY + 10, 7, INK);
  img.disc(topX + 9, topY + 12, 7, INK);
}

// The ghost's outline: a domed top, straight sides, and three scallops
// along the bottom.
function ghostOutline(cx: number, top: number, w: number, h: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const r = w / 2;
  const cy = top + r;
  const bottom = top + h;
  for (let a = 180; a <= 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + Math.cos(rad) * r, cy + Math.sin(rad) * r]);
  }
  pts.push([cx + r, bottom - 14]);
  const bumpR = w / 6;
  for (let b = 0; b < 3; b++) {
    const bcx = cx + r - bumpR - b * 2 * bumpR;
    for (let a = 0; a <= 180; a += 10) {
      const rad = (a * Math.PI) / 180;
      pts.push([bcx + Math.cos(rad) * bumpR, bottom - 14 + Math.sin(rad) * bumpR]);
    }
  }
  pts.push([cx - r, cy]);
  return pts;
}

function scaleToward(pts: Array<[number, number]>, cx: number, cy: number, s: number): Array<[number, number]> {
  return pts.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]);
}

// The make.fun ghost: white body with a thick black outline, two black
// four-pointed sparkle eyes, a round little hand holding a magenta coin
// with a white star.
function drawGhost(img: Img): void {
  const cx = 600;
  const top = 158;
  const w = 170;
  const h = 176;
  const outline = ghostOutline(cx, top, w, h);
  const cy = top + h / 2;
  img.polygon(scaleToward(outline, cx, cy, 1.05), BLACK);
  img.polygon(outline, WHITE);
  img.star(cx - 34, top + 82, 4, 17, 5, -Math.PI / 2, BLACK);
  img.star(cx + 34, top + 82, 4, 17, 5, -Math.PI / 2, BLACK);
  const coinX = cx + 108;
  const coinY = top + 128;
  img.disc(coinX, coinY, 28, BLACK);
  img.disc(coinX, coinY, 24, MAGENTA);
  img.star(coinX, coinY, 5, 15, 6, -Math.PI / 2, WHITE);
  img.disc(cx + 84, coinY + 12, 16, BLACK);
  img.disc(cx + 84, coinY + 12, 13, WHITE);
}

// The loading bar: 99% full, with the number beside it.
function drawLoadingBar(img: Img): void {
  const x0 = 250;
  const x1 = 950;
  const y0 = 596;
  const y1 = 622;
  img.fillRect(x0, y0, x1, y1, BLACK);
  img.fillRect(x0 + 3, y0 + 3, x1 - 3, y1 - 3, [24, 8, 40]);
  const innerW = x1 - x0 - 6;
  img.fillRect(x0 + 3, y0 + 3, x0 + 3 + innerW * 0.99, y1 - 3, MAGENTA);
  drawText(img, '99%', 989, 598, 3, WHITE, BLACK);
}

function drawScene(): Img {
  const img = new Img(WIDTH, HEIGHT);
  for (let y = 0; y < HORIZON; y++) {
    img.fillRect(0, y, WIDTH, y + 1, skyAt(y, HORIZON));
  }
  drawSun(img);
  drawGround(img);
  drawPalm(img, 150, 92, 440, 115);
  drawPalm(img, 1050, 1110, 432, 120);
  drawGhost(img);
  drawLoadingBar(img);
  drawText(img, 'ME: WAITING 13 YEARS', 600, 30, 6, WHITE, BLACK);
  drawText(img, 'FOR GTA 6', 600, 98, 6, WHITE, BLACK);
  drawText(img, 'MY AGENT: ALREADY WINNING', 600, 462, 6, WHITE, BLACK);
  drawText(img, 'REAL MONEY ON make.fun', 600, 530, 6, YELLOW, BLACK);
  return img;
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function main(): void {
  const botDir = process.env.MAKEFUN_BOT_DIR ?? (existsSync('/bot') ? '/bot' : '.');
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? (existsSync('/output') ? '/output' : 'out');
  mkdirSync(outDir, { recursive: true });
  const png = encodePng(drawScene());
  writeFileSync(join(outDir, 'meme.png'), png);
  const hash = createHash('sha256').update(png).digest('hex');
  console.log(`meme.png: ${png.length} bytes, sha256 ${hash}`);
  const postSrc = join(botDir, 'POST.json');
  const postDst = join(outDir, 'POST.json');
  try {
    copyFileSync(postSrc, postDst);
    console.log(`POST.json copied from ${postSrc} to ${postDst}`);
  } catch (err) {
    console.error(`POST.json could not be copied from ${botDir}: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
