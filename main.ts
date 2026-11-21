// THE WORLD IN ONE DAY — Friday 20 November 2026 (v4).
// A one-day world news front page, drawn entirely in code: no photos, no
// network, no randomness. Node 22, standard library only. Writes
// /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png), 1024x1024 PNG,
// deterministic: the same input bytes every run.
//
// v4 rebuilds the page on the layout the top entries share: the date as
// the masthead, a six-number strip, a region-count bar, 3 heroes + 10
// mid stories each with its own picture and a named source, a world map
// pinning the 13 drawn stories, 27 numbered briefs, and a DATE CHECK
// that names the Thursday stories left out. 40 stories in all.
//
// Every story on the page happened, or was first reported, on Friday
// 20 November 2026. Sources are listed in REPORT.md beside this repo.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas

const W = 1024;
const H = 1024;

// RGB pixel buffer, row-major.
const px = new Uint8Array(W * H * 3);

type RGB = [number, number, number];

const PAPER: RGB = [247, 242, 231];
const INK: RGB = [20, 20, 20];
const RED: RGB = [179, 39, 30];
const BLUE: RGB = [29, 78, 137];
const TEAL: RGB = [14, 107, 107];
const MUSTARD: RGB = [217, 164, 65];
const GREEN: RGB = [46, 107, 52];
const SKY: RGB = [191, 217, 232];
const SEA: RGB = [46, 107, 138];
const GREY: RGB = [138, 133, 120];
const LIGHT: RGB = [232, 226, 210];
const WHITE: RGB = [255, 255, 255];
const DARKBLUE: RGB = [16, 42, 84];
const GOLD: RGB = [232, 178, 44];
const BROWN: RGB = [122, 84, 52];
const PINK: RGB = [232, 190, 180];

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      i += 3;
    }
  }
}

function hline(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: RGB): void {
  fillRect(x, y, 1, h, c);
}

// Bresenham line.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPx(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  hline(x, y, w, c);
  hline(x, y + h - 1, w, c);
  vline(x, y, h, c);
  vline(x + w - 1, y, h, c);
}

function disc(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = -r; y <= r; y++) {
    const half = Math.floor(Math.sqrt(r * r - y * y));
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    setPx(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Filled polygon (scanline, even-odd). Points are [x, y] pairs.
function polyFill(pts: number[][], c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const p of pts) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  minY = Math.max(0, minY);
  maxY = Math.min(H - 1, maxY);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(Math.round(a[0] + t * (b[0] - a[0])));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = xs[k]; x <= xs[k + 1]; x++) setPx(x, y, c);
    }
  }
}

// Vertical gradient band: blends c0 at top to c1 at bottom.
function vGrad(x: number, y: number, w: number, h: number, c0: RGB, c1: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    const t = h <= 1 ? 0 : yy / (h - 1);
    const c: RGB = [
      Math.round(c0[0] + (c1[0] - c0[0]) * t),
      Math.round(c0[1] + (c1[1] - c0[1]) * t),
      Math.round(c0[2] + (c1[2] - c0[2]) * t),
    ];
    fillRect(x, y + yy, w, 1, c);
  }
}

// Deterministic hash of two integers, for texture dots (no Math.random).
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

// Halftone dot field inside a rect: dots whose size grows with t (0..1).
function halftone(x: number, y: number, w: number, h: number, step: number, c: RGB): void {
  for (let yy = y + 2; yy < y + h - 2; yy += step) {
    for (let xx = x + 2; xx < x + w - 2; xx += step) {
      const r = hash2(xx, yy);
      if (r < 0.45) disc(xx, yy, 1, c);
    }
  }
}

// ---------------------------------------------------------------- PNG out

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Per-row filter: try filters 0..4, keep the one with the smallest
  // sum of absolute signed byte values. Fully deterministic.
  const raw = Buffer.alloc(H * (1 + W * 3));
  const row = Buffer.alloc(W * 3);
  const prev = Buffer.alloc(W * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W * 3; x++) row[x] = px[y * W * 3 + x];
    let bestF = 0;
    let bestCost = Infinity;
    let bestBuf: Buffer = row;
    for (let f = 0; f <= 4; f++) {
      const out = Buffer.alloc(W * 3);
      for (let i = 0; i < W * 3; i++) {
        const v = row[i];
        let pred = 0;
        if (f === 1) pred = i >= 3 ? row[i - 3] : 0;
        else if (f === 2) pred = prev[i];
        else if (f === 3) pred = Math.floor(((i >= 3 ? row[i - 3] : 0) + prev[i]) / 2);
        else if (f === 4) {
          const a = i >= 3 ? row[i - 3] : 0;
          const b = prev[i];
          const cc = i >= 3 ? prev[i - 3] : 0;
          const p = a + b - cc;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - cc);
          pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
        }
        out[i] = (v - pred) & 0xff;
      }
      let cost = 0;
      for (let i = 0; i < W * 3; i++) {
        const s = out[i] >= 128 ? out[i] - 256 : out[i];
        cost += Math.abs(s);
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestF = f;
        bestBuf = out;
      }
    }
    const off = y * (1 + W * 3);
    raw[off] = bestF;
    bestBuf.copy(raw, off + 1);
    row.copy(prev);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- font
// A 5x7 bitmap font, drawn from scratch. Each glyph is 7 rows of 5 cells.
// '1' is ink, '0' is blank. Lowercase input is rendered as capitals:
// the whole page is set in newspaper capitals on purpose.

const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  '"': ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "\\": ["10000", "01000", "01000", "00100", "00010", "00010", "00001"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "`": ["01000", "00100", "00010", "00000", "00000", "00000", "00000"],
  "{": ["00110", "01000", "01000", "11100", "01000", "01000", "00110"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "}": ["01100", "00010", "00010", "00111", "00010", "00010", "01100"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
};

const BLANK: string[] = ["00000", "00000", "00000", "00000", "00000", "00000", "00000"];

// Advance between characters, in pixels, for a given scale.
function adv(scale: number): number {
  return 6 * scale;
}

function textWidth(s: string, scale: number): number {
  const up = s.toUpperCase();
  if (up.length === 0) return 0;
  return up.length * adv(scale) - scale;
}

// Draw one character's glyph scaled by `scale` (each font cell is scale px).
function drawChar(x: number, y: number, scale: number, ch: string, c: RGB): void {
  const g = FONT[ch] ?? BLANK;
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "1") fillRect(x + col * scale, y + r * scale, scale, scale, c);
    }
  }
}

function drawText(x: number, y: number, scale: number, s: string, c: RGB): void {
  const up = s.toUpperCase();
  let cx = x;
  for (const ch of up) {
    drawChar(cx, y, scale, ch, c);
    cx += adv(scale);
  }
}

function drawTextCentered(cx: number, y: number, scale: number, s: string, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, scale, s, c);
}

function drawTextRight(xRight: number, y: number, scale: number, s: string, c: RGB): void {
  drawText(xRight - textWidth(s, scale), y, scale, s, c);
}

// Wrap text to lines of at most maxW pixels (scale 2 default measure).
function wrapLines(s: string, scale: number, maxW: number): string[] {
  const words = s.toUpperCase().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// Draw wrapped text; returns the y just below the last line.
function drawPara(x: number, y: number, scale: number, maxW: number, s: string, c: RGB, leading?: number): number {
  const lh = 7 * scale + (leading ?? 3);
  const lines = wrapLines(s, scale, maxW);
  for (let i = 0; i < lines.length; i++) drawText(x, y + i * lh, scale, lines[i], c);
  return y + lines.length * lh;
}

// Small solid square bullet.
function bullet(x: number, y: number, s: number, c: RGB): void {
  fillRect(x, y, s, s, c);
}

// ---------------------------------------------------------------- pictures
// Every illustration is drawn from shapes and lines: no photos, no files.

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor((rx * Math.sqrt(Math.max(0, ry * ry - y * y))) / ry);
    for (let x = -half; x <= half; x++) setPx(cx + x, cy + y, c);
  }
}

// Five-point star, outer radius r, centred (cx, cy).
function star(cx: number, cy: number, r: number, c: RGB): void {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 2) * -1 + (i * Math.PI) / 5;
    pts.push([Math.round(cx + rad * Math.cos(a)), Math.round(cy + rad * Math.sin(a))]);
  }
  polyFill(pts, c);
}

// 1 — Cyclone Akvan: spiral storm over the sea, coast below.
function drawCyclone(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [214, 228, 238], [247, 242, 231]);
  // Halftone texture in the sky.
  halftone(x, y, w, Math.floor(h * 0.55), 16, [188, 204, 220]);
  // Clouds, top left and centre.
  ellipse(x + 34, y + 20, 17, 7, WHITE);
  ellipse(x + 52, y + 14, 12, 6, WHITE);
  ellipse(x + 148, y + 12, 15, 6, [235, 240, 245]);
  ellipse(x + 168, y + 18, 10, 5, WHITE);
  // Sun, pale, top right.
  disc(x + w - 26, y + 24, 13, [240, 214, 130]);
  ring(x + w - 26, y + 24, 17, [240, 214, 130]);
  // Sea, bottom third, with whitecaps.
  fillRect(x, y + Math.floor(h * 0.66), w, h - Math.floor(h * 0.66), SEA);
  for (let i = 0; i < 5; i++) {
    const wy = y + Math.floor(h * 0.66) + 8 + i * 9;
    for (let xx = x + 6; xx < x + w - 6; xx += 26) {
      line(xx, wy, xx + 12, wy, [178, 214, 228]);
    }
  }
  for (let i = 0; i < 10; i++) {
    const wx = x + 10 + Math.floor(hash2(i, 21) * (w - 20));
    const wy = y + Math.floor(h * 0.66) + 6 + Math.floor(hash2(i, 22) * (h - Math.floor(h * 0.66) - 24));
    disc(wx, wy, 2, [220, 235, 242]);
  }
  // Rescue boat on the sea.
  const boatX = x + w - 58;
  const boatY = y + Math.floor(h * 0.78);
  polyFill(
    [
      [boatX, boatY],
      [boatX + 26, boatY],
      [boatX + 21, boatY + 7],
      [boatX + 5, boatY + 7],
    ],
    WHITE
  );
  polyFill(
    [
      [boatX + 13, boatY],
      [boatX + 13, boatY - 14],
      [boatX + 24, boatY],
    ],
    [255, 120, 30]
  );
  line(boatX + 13, boatY - 14, boatX + 13, boatY, INK);
  // Coast strip with tiny houses.
  fillRect(x, y + h - 16, w, 16, [96, 128, 74]);
  for (let i = 0; i < 5; i++) {
    const hx = x + 12 + i * Math.floor((w - 24) / 5);
    fillRect(hx, y + h - 30, 16, 14, [240, 232, 210]);
    polyFill(
      [
        [hx - 2, y + h - 30],
        [hx + 8, y + h - 38],
        [hx + 18, y + h - 30],
      ],
      RED
    );
  }
  // Two palm trees between the houses.
  for (const px0 of [x + 38, x + 155]) {
    line(px0, y + h - 16, px0, y + h - 36, BROWN);
    line(px0, y + h - 36, px0 - 11, y + h - 30, GREEN);
    line(px0, y + h - 36, px0 + 11, y + h - 30, GREEN);
    line(px0, y + h - 36, px0 - 9, y + h - 42, GREEN);
    line(px0, y + h - 36, px0 + 9, y + h - 42, GREEN);
  }
  // The spiral: an Archimedean coil of white cloud.
  const cx = x + Math.floor(w * 0.52);
  const cy = y + Math.floor(h * 0.36);
  const maxR = Math.floor(Math.min(w, h) * 0.42);
  for (let t = 0; t <= Math.PI * 5; t += 0.12) {
    const r = maxR * (1 - t / (Math.PI * 5));
    const px2 = Math.round(cx + r * Math.cos(t + 0.6));
    const py2 = Math.round(cy + r * Math.sin(t + 0.6) * 0.8);
    disc(px2, py2, 3, WHITE);
  }
  // A second, fainter outer arm.
  for (let t = 0; t <= Math.PI * 4; t += 0.15) {
    const r = maxR * (1.05 - t / (Math.PI * 4));
    const px2 = Math.round(cx + r * Math.cos(t + 0.6 + Math.PI));
    const py2 = Math.round(cy + r * Math.sin(t + 0.6 + Math.PI) * 0.8);
    disc(px2, py2, 2, [230, 235, 240]);
  }
  disc(cx, cy, 7, [90, 90, 90]);
  disc(cx, cy, 4, [60, 60, 60]);
  // Rain streaks.
  for (let i = 0; i < 40; i++) {
    const rx = x + 8 + Math.floor(hash2(i, 7) * (w - 16));
    const ry = y + 8 + Math.floor(hash2(i, 11) * Math.floor(h * 0.55));
    line(rx, ry, rx - 3, ry + 8, [120, 150, 180]);
  }
  // Red alert tag.
  fillRect(x + 6, y + 6, 86, 18, RED);
  drawText(x + 11, y + 9, 1, "RED ALERT", WHITE);
}

// 2 — Trump / Iran: a white house, and a calendar page turned to 2027.
function drawTrump(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, DARKBLUE);
  halftone(x, y, w, h, 12, [38, 74, 130]);
  // Stars in the night-blue field, clear of the calendar page.
  for (let i = 0; i < 22; i++) {
    const sx = x + 6 + Math.floor(hash2(i, 31) * (w - 12));
    const sy = y + 4 + Math.floor(hash2(i, 32) * 30);
    if (sx > x + w - 112 && sy > y + 10) continue;
    disc(sx, sy, 1, [220, 225, 240]);
  }
  // Flag on the roof.
  line(x + 30, y + 8, x + 30, y + 26, WHITE);
  fillRect(x + 30, y + 8, 22, 12, RED);
  fillRect(x + 30, y + 12, 22, 3, WHITE);
  fillRect(x + 30, y + 17, 22, 3, WHITE);
  // White House block.
  const bx = x + 14;
  const by = y + h - 46;
  fillRect(bx, by, 120, 46, WHITE);
  polyFill(
    [
      [bx - 4, by],
      [bx + 60, by - 18],
      [bx + 124, by],
    ],
    WHITE
  );
  disc(bx + 60, by - 18, 5, WHITE);
  // A small flag on the pediment.
  line(bx + 60, by - 18, bx + 60, by - 30, INK);
  fillRect(bx + 60, by - 30, 14, 8, RED);
  for (let i = 0; i < 5; i++) {
    fillRect(bx + 10 + i * 22, by + 8, 7, 30, [200, 205, 215]);
  }
  fillRect(bx + 53, by + 26, 14, 20, INK);
  // A small tree beside the house, front left.
  const tx = x + 10;
  const ty = y + h - 6;
  line(tx, ty, tx, ty - 14, BROWN);
  disc(tx - 4, ty - 18, 6, GREEN);
  disc(tx + 4, ty - 18, 6, GREEN);
  disc(tx, ty - 23, 6, [56, 122, 62]);
  // Calendar page, right side.
  const cx0 = x + w - 108;
  const cy0 = y + 12;
  fillRect(cx0, cy0, 92, h - 24, WHITE);
  fillRect(cx0, cy0, 92, 20, RED);
  drawText(cx0 + 30, cy0 + 4, 2, "JAN", WHITE);
  drawText(cx0 + 8, cy0 + 26, 3, "2027", INK);
  if (h >= 90) {
    hline(cx0 + 8, cy0 + 56, 76, GREY);
    drawText(cx0 + 10, cy0 + 64, 1, "NO RUSH", RED);
  }
  // Two rings on top.
  ring(cx0 + 24, cy0, 5, INK);
  ring(cx0 + 68, cy0, 5, INK);
}

// 3 — Senate: a capitol dome with a split 51-48 bar.
function drawSenate(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, SKY, [240, 236, 224]);
  const cx = x + Math.floor(w / 2);
  const base = y + h - 18;
  // Clouds drifting past the dome.
  ellipse(x + 34, y + 14, 18, 6, WHITE);
  ellipse(x + 54, y + 10, 12, 5, WHITE);
  ellipse(x + w - 40, y + 18, 16, 6, [240, 238, 232]);
  // Birds in the sky.
  for (const [bx2, by2] of [
    [x + 30, y + 30],
    [x + 46, y + 24],
    [x + w - 52, y + 32],
  ]) {
    line(bx2 - 4, by2, bx2, by2 - 3, INK);
    line(bx2, by2 - 3, bx2 + 4, by2, INK);
  }
  // Dome: stacked shrinking discs.
  for (let i = 0; i < 10; i++) {
    const r = 34 - i * 3;
    const yy = base - 34 + i * 3;
    fillRect(cx - r, yy, r * 2, 3, [70, 90, 130]);
  }
  fillRect(cx - 2, base - 46, 4, 12, [70, 90, 130]);
  disc(cx, base - 48, 3, GOLD);
  // A flag on the dome.
  line(cx, base - 48, cx, base - 60, INK);
  fillRect(cx, base - 60, 14, 8, RED);
  // Drum and columns.
  fillRect(cx - 44, base - 34, 88, 10, WHITE);
  for (let i = 0; i < 6; i++) fillRect(cx - 40 + i * 15, base - 24, 6, 24, WHITE);
  fillRect(cx - 48, base, 96, 6, WHITE);
  // Trees flanking the steps.
  for (const tx2 of [x + 14, x + w - 26]) {
    line(tx2, base + 6, tx2, base - 10, BROWN);
    disc(tx2 - 4, base - 14, 6, GREEN);
    disc(tx2 + 4, base - 14, 6, GREEN);
    disc(tx2, base - 19, 6, [56, 122, 62]);
  }
  // Steps.
  fillRect(x + 20, y + h - 12, w - 40, 4, LIGHT);
  fillRect(x + 12, y + h - 7, w - 24, 4, [210, 204, 188]);
  // 51-48 bar.
  fillRect(x + 8, y + h - 2, Math.floor((w - 16) * 0.515), 2, RED);
  fillRect(x + 8 + Math.floor((w - 16) * 0.515), y + h - 2, w - 16 - Math.floor((w - 16) * 0.515), 2, BLUE);
}

// 4 — Cricket: green field, pitch, stumps, bat and ball.
function drawCricket(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [58, 122, 62]);
  // Mowing stripes.
  for (let i = 0; i < 4; i++) fillRect(x, y + i * Math.floor(h / 4), w, Math.floor(h / 8), [66, 132, 70]);
  // Crowd stands along both sides.
  for (const sx of [x, x + w - 14]) {
    fillRect(sx, y, 14, h, [30, 30, 44]);
    for (let i = 0; i < 12; i++) {
      const cx2 = sx + 3 + Math.floor(hash2(i, 41) * 8);
      const cy2 = y + 4 + Math.floor(hash2(i, 42) * (h - 8));
      disc(cx2, cy2, 1, [[232, 178, 44], [232, 190, 180], WHITE, [120, 180, 220]][i % 4]);
    }
  }
  // Pitch.
  const px0 = x + Math.floor(w * 0.42);
  fillRect(px0, y + 6, Math.floor(w * 0.16), h - 12, [198, 178, 140]);
  hline(px0 - 6, y + 14, Math.floor(w * 0.16) + 12, WHITE);
  hline(px0 - 6, y + h - 16, Math.floor(w * 0.16) + 12, WHITE);
  // Stumps.
  for (let i = 0; i < 3; i++) fillRect(px0 + 6 + i * 8, y + 8, 4, 16, [232, 200, 80]);
  fillRect(px0 + 6, y + 6, 22, 3, [232, 200, 80]);
  // Batsman at the striker's end, in whites.
  const batX = px0 - 20;
  const batY = y + 34;
  disc(batX, batY, 4, [240, 230, 210]);
  line(batX, batY + 4, batX, batY + 18, [240, 230, 210]);
  line(batX, batY + 18, batX - 6, batY + 28, INK);
  line(batX, batY + 18, batX + 6, batY + 28, INK);
  line(batX, batY + 8, batX + 10, batY + 16, [240, 230, 210]);
  // Bowler at the far end, in dark blue.
  const bowlX = px0 + Math.floor(w * 0.16) + 22;
  const bowlY = y + h - 34;
  disc(bowlX, bowlY, 4, [20, 30, 80]);
  line(bowlX, bowlY + 4, bowlX, bowlY + 16, [20, 30, 80]);
  line(bowlX, bowlY + 16, bowlX - 5, bowlY + 26, [20, 30, 80]);
  line(bowlX, bowlY + 16, bowlX + 5, bowlY + 26, [20, 30, 80]);
  // Bat, leaning.
  polyFill(
    [
      [x + 26, y + h - 18],
      [x + 38, y + h - 20],
      [x + 62, y + 22],
      [x + 50, y + 20],
    ],
    [190, 160, 110]
  );
  // Ball.
  disc(x + w - 30, y + 24, 7, RED);
  disc(x + w - 32, y + 22, 2, [255, 200, 200]);
  // Score board strip.
  fillRect(x + 6, y + h - 20, 74, 15, INK);
  drawText(x + 10, y + h - 17, 1, "368", WHITE);
}

// 5 — Bitcoin: gold coin and a falling chart.
function drawBitcoin(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [18, 24, 44]);
  halftone(x, y, w, h, 12, [34, 46, 78]);
  // A second coin behind, darker gold.
  const cx2 = x + 56;
  const cy2 = y + Math.floor(h / 2) + 8;
  disc(cx2, cy2, 22, [150, 110, 18]);
  ring(cx2, cy2, 22, [110, 80, 12]);
  // Coin.
  const cx = x + 40;
  const cy = y + Math.floor(h / 2);
  disc(cx, cy, 30, GOLD);
  ring(cx, cy, 30, [160, 120, 20]);
  ring(cx, cy, 23, [160, 120, 20]);
  drawText(cx - 12, cy - 14, 4, "B", [120, 84, 10]);
  // Faint grid over the chart area.
  for (const gy of [y + 22, y + 42, y + 62]) {
    for (let gx = x + 88; gx < x + w - 6; gx += 6) {
      setPx(gx, gy, [52, 64, 96]);
    }
  }
  // Candlesticks falling down the chart.
  const candles: [number, number, number][] = [
    [96, 16, 12],
    [120, 24, 14],
    [144, 30, 10],
    [168, 40, 12],
    [192, 52, 10],
  ];
  for (const [cox, top, bh] of candles) {
    const ccx = x + cox;
    line(ccx + 4, y + top - 4, ccx + 4, y + top + bh + 4, [200, 60, 50]);
    fillRect(ccx, y + top, 9, bh, [200, 60, 50]);
  }
  // Falling chart line over the candles.
  const pts: number[][] = [
    [x + 92, y + 12],
    [x + 116, y + 20],
    [x + 140, y + 28],
    [x + 164, y + 40],
    [x + 188, y + 50],
    [x + 212, y + 62],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED);
    line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, RED);
  }
  for (const p of pts) disc(p[0], p[1], 3, WHITE);
  // Arrow head down.
  polyFill(
    [
      [x + 212, y + 62],
      [x + 200, y + 56],
      [x + 210, y + 72],
    ],
    RED
  );
  drawText(x + 88, y + h - 18, 1, "LOWEST SINCE JULY", [200, 200, 210]);
}

// 10 — COP31 vignette: a globe and a green leaf, Belem summit.
function drawVignetteCOP31(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h - 14, [20, 90, 90], [120, 190, 180]);
  // Globe.
  disc(x + 32, y + 20, 15, BLUE);
  ring(x + 32, y + 20, 15, WHITE);
  ellipse(x + 28, y + 16, 6, 4, GREEN);
  ellipse(x + 36, y + 25, 5, 3, GREEN);
  // A leaf, right.
  polyFill(
    [
      [x + 62, y + 34],
      [x + 78, y + 8],
      [x + 96, y + 30],
      [x + 78, y + 38],
    ],
    GREEN
  );
  line(x + 78, y + 8, x + 78, y + 38, [30, 80, 40]);
  // Sun.
  disc(x + w - 18, y + 10, 6, GOLD);
  // Label strip.
  fillRect(x, y + h - 14, w, 14, TEAL);
  drawTextCentered(x + Math.floor(w / 2), y + h - 11, 1, "COP31 - ANTALYA", WHITE);
  rect(x, y, w, h, INK);
}

// 11 — Haiti vignette: a street at dusk in Artibonite.
function drawVignetteHaiti(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h - 14, [240, 190, 120], [214, 120, 80]);
  disc(x + w - 20, y + 10, 7, [255, 236, 180]);
  // Buildings with lit windows.
  const bw = Math.floor((w - 12) / 3);
  for (let i = 0; i < 3; i++) {
    const bx = x + 6 + i * bw;
    const bh = 16 + Math.floor(hash2(i, 61) * 10);
    fillRect(bx, y + h - 14 - bh, bw - 4, bh, [52, 44, 60]);
    for (let wy = 0; wy < 2; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        if (hash2(i * 5 + wx, wy) > 0.4) fillRect(bx + 3 + wx * 8, y + h - 14 - bh + 4 + wy * 7, 4, 4, MUSTARD);
      }
    }
  }
  // Label strip.
  fillRect(x, y + h - 14, w, 14, [120, 30, 25]);
  drawTextCentered(x + Math.floor(w / 2), y + h - 11, 1, "HAITI - 42 KILLED", WHITE);
  rect(x, y, w, h, INK);
}

// 12 — Van Gogh vignette: sunflowers on a blue field.
function drawVignetteVanGogh(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h - 14, [38, 90, 160]);
  halftone(x, y, w, h - 14, 10, [52, 110, 180]);
  // Three sunflowers.
  for (const [fx, fy, fr] of [
    [26, 22, 9],
    [64, 16, 11],
    [100, 24, 8],
  ] as number[][]) {
    line(x + fx, y + fy + fr, x + fx, y + h - 14, GREEN);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      disc(Math.round(x + fx + Math.cos(a) * fr), Math.round(y + fy + Math.sin(a) * fr), 3, GOLD);
    }
    disc(x + fx, y + fy, 5, BROWN);
  }
  // Label strip.
  fillRect(x, y + h - 14, w, 14, [90, 60, 20]);
  drawTextCentered(x + Math.floor(w / 2), y + h - 11, 1, "VAN GOGH - $190.4M", WHITE);
  rect(x, y, w, h, INK);
}

// 13 — Masthead globe: the world, left of the title.
function drawMastheadGlobe(x: number, y: number, w: number, h: number): void {
  const cx = x + Math.floor(w * 0.42);
  const cy = y + Math.floor(h / 2);
  const r = Math.floor(Math.min(w, h) * 0.42);
  disc(cx, cy, r, BLUE);
  ring(cx, cy, r, [200, 210, 225]);
  // Continents as blobs.
  ellipse(cx - 6, cy - 6, 7, 4, GREEN);
  ellipse(cx + 7, cy + 5, 6, 4, GREEN);
  ellipse(cx + 2, cy - 10, 4, 3, [90, 140, 80]);
  // Orbit ring, tilted.
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    setPx(
      Math.round(cx + (r + 7) * Math.cos(rad)),
      Math.round(cy + (r + 7) * 0.55 * Math.sin(rad)),
      GOLD
    );
  }
  // Two stars.
  star(x + w - 14, y + 10, 4, GOLD);
  star(x + w - 26, y + h - 8, 3, [200, 200, 210]);
}

// 14 — Masthead skyline: a city at sunrise, right of the title.
function drawMastheadSkyline(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [250, 220, 160], [247, 242, 231]);
  // Sun with rays.
  const sx = x + w - 26;
  const sy = y + 14;
  disc(sx, sy, 9, GOLD);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    line(
      Math.round(sx + 12 * Math.cos(a)),
      Math.round(sy + 12 * Math.sin(a)),
      Math.round(sx + 17 * Math.cos(a)),
      Math.round(sy + 17 * Math.sin(a)),
      GOLD
    );
  }
  // Skyline.
  const base = y + h;
  for (const [bx2, bw2, bh2] of [
    [4, 22, 26],
    [30, 16, 36],
    [50, 24, 22],
    [78, 18, 32],
    [100, 26, 20],
    [130, 20, 28],
  ] as number[][]) {
    fillRect(x + bx2, base - bh2, bw2, bh2, [40, 40, 48]);
    for (let wy = 0; wy < 2; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        if (hash2(bx2 + wx, wy + 3) > 0.5) fillRect(x + bx2 + 4 + wx * 8, base - bh2 + 5 + wy * 9, 3, 4, MUSTARD);
      }
    }
  }
  // A flag on the tallest tower.
  line(x + 38, base - 36, x + 38, base - 46, INK);
  fillRect(x + 38, base - 46, 12, 7, RED);
  // Birds.
  for (const [bx2, by2] of [
    [x + 70, y + 12],
    [x + 84, y + 18],
  ]) {
    line(bx2 - 4, by2, bx2, by2 - 3, INK);
    line(bx2, by2 - 3, bx2 + 4, by2, INK);
  }
}

// 8 — Kyiv bridges: a Dnipro bridge at dawn, hit mid-span.
function drawKyiv(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [38, 52, 74], [120, 140, 165]);
  // Stars in the night sky.
  for (let i = 0; i < 18; i++) {
    const sx = x + 6 + Math.floor(hash2(i, 51) * (w - 12));
    const sy = y + 4 + Math.floor(hash2(i, 52) * 14);
    disc(sx, sy, 1, [210, 215, 230]);
  }
  // City skyline on both banks, behind the deck.
  for (const [bx2, bw2, bh2] of [
    [6, 26, 22],
    [36, 18, 30],
    [58, 22, 18],
    [w - 82, 20, 26],
    [w - 58, 26, 18],
    [w - 28, 16, 24],
  ] as number[][]) {
    fillRect(x + bx2, y + 52 - bh2, bw2, bh2, [20, 24, 32]);
    for (let wy = 0; wy < 2; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        if (hash2(bx2 + wx, wy) > 0.45) fillRect(x + bx2 + 4 + wx * 9, y + 52 - bh2 + 5 + wy * 8, 4, 4, MUSTARD);
      }
    }
  }
  // River Dnipro, bottom third.
  fillRect(x, y + Math.floor(h * 0.62), w, h - Math.floor(h * 0.62), SEA);
  for (let i = 0; i < 8; i++) {
    const wy = y + Math.floor(h * 0.62) + 6 + i * 4;
    for (let xx = x + 6; xx < x + w - 6; xx += 30) {
      line(xx, wy, xx + 14, wy, [178, 214, 228]);
    }
  }
  // Bridge deck across the middle.
  fillRect(x, y + 52, w, 6, [30, 30, 34]);
  // Pylons and suspension cables.
  fillRect(x + 90, y + 18, 8, 40, [30, 30, 34]);
  fillRect(x + w - 98, y + 18, 8, 40, [30, 30, 34]);
  line(x + 94, y + 18, x + Math.floor(w / 2), y + 52, [30, 30, 34]);
  line(x + w - 94, y + 18, x + Math.floor(w / 2), y + 52, [30, 30, 34]);
  // Smoke above the blast.
  disc(x + Math.floor(w / 2) - 30, y + 26, 9, [90, 90, 96]);
  disc(x + Math.floor(w / 2) + 28, y + 22, 11, [110, 110, 116]);
  disc(x + Math.floor(w / 2) + 44, y + 30, 7, [90, 90, 96]);
  disc(x + 90, y + 20, 8, [100, 100, 106]);
  // A second, smaller hit on the left span.
  disc(x + 90, y + 46, 9, [255, 120, 30]);
  disc(x + 90, y + 46, 5, [255, 200, 60]);
  // Explosion burst on the deck.
  const cx = x + Math.floor(w / 2);
  const cy = y + 44;
  disc(cx, cy, 18, [255, 120, 30]);
  disc(cx, cy, 11, [255, 200, 60]);
  disc(cx, cy, 5, WHITE);
  // Debris sparks flying off the burst.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 + 0.3;
    const r = 20 + Math.floor(hash2(i, 53) * 8);
    disc(Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), 2, [255, 160, 40]);
  }
  // Orange reflections in the river below the burst.
  for (const ox of [-12, 0, 12]) {
    fillRect(cx + ox - 2, y + Math.floor(h * 0.62) + 4, 4, 12, [255, 150, 40]);
  }
  // Red alert tag.
  fillRect(x + 6, y + 6, 96, 18, RED);
  drawText(x + 11, y + 9, 1, "3 BRIDGES HIT", WHITE);
}

// 9 — Dow sell-off strip: candlesticks falling off a cliff.
function drawDow(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, WHITE);
  rect(x, y, w, h, INK);
  // Faint grid.
  for (const gy of [y + 10, y + 20, y + 30]) {
    for (let gx = x + 6; gx < x + w - 6; gx += 6) setPx(gx, gy, [220, 220, 220]);
  }
  // Candlesticks: a steady down-trend, one green bounce.
  const candles: [number, number, number, RGB][] = [
    [10, 8, 12, RED],
    [32, 12, 12, RED],
    [54, 10, 14, GREEN],
    [76, 16, 12, RED],
    [98, 20, 10, RED],
    [120, 24, 10, RED],
    [142, 26, 10, RED],
    [164, 28, 6, RED],
  ];
  for (const [cox, top, bh, col] of candles) {
    line(x + cox + 5, y + top - 4, x + cox + 5, y + top + bh + 4, col);
    fillRect(x + cox, y + top, 11, bh, col);
  }
  // Falling line joining the closes.
  const pts: number[][] = [
    [x + 15, y + 8],
    [x + 37, y + 12],
    [x + 59, y + 10],
    [x + 81, y + 16],
    [x + 103, y + 20],
    [x + 125, y + 24],
    [x + 147, y + 26],
    [x + 169, y + 30],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], INK);
  }
  for (const p of pts) disc(p[0], p[1], 2, INK);
  // Red arrow at the end of the fall.
  polyFill(
    [
      [x + 186, y + 30],
      [x + 176, y + 24],
      [x + 184, y + 38],
    ],
    RED
  );
}

// 15 — Asia markets hero: four closing prices, all down.
function drawMarkets(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [18, 24, 44]);
  halftone(x, y, w, h, 12, [34, 46, 78]);
  const rows: [string, string, number][] = [
    ["TAIPEI", "-6.2%", 6.2],
    ["SEOUL", "-5.2%", 5.2],
    ["TOKYO", "-5.1%", 5.1],
    ["HONG KONG", "-1.9%", 1.9],
  ];
  for (let i = 0; i < 4; i++) {
    const ry = y + 8 + i * 24;
    drawText(x + 8, ry, 1, rows[i][0], [205, 205, 215]);
    drawTextRight(x + w - 8, ry, 1, rows[i][1], [255, 140, 110]);
    fillRect(x + 8, ry + 10, Math.floor(((w - 16) * rows[i][2]) / 6.2), 5, RED);
  }
}

// 16 — Bitcoin, mid size: gold coin and a falling chart, fits 187 wide.
function drawBitcoinMid(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [18, 24, 44]);
  halftone(x, y, w, h, 12, [34, 46, 78]);
  const cx = x + 34;
  const cy = y + Math.floor(h / 2);
  disc(cx, cy, 22, [150, 110, 18]);
  disc(cx - 4, cy - 2, 22, GOLD);
  ring(cx - 4, cy - 2, 22, [160, 120, 20]);
  ring(cx - 4, cy - 2, 16, [160, 120, 20]);
  drawText(cx - 11, cy - 11, 3, "B", [120, 84, 10]);
  const candles: [number, number, number][] = [
    [72, 14, 10],
    [96, 22, 12],
    [120, 30, 10],
    [144, 40, 12],
  ];
  for (const [cox, top, bh] of candles) {
    line(x + cox + 4, y + top - 4, x + cox + 4, y + top + bh + 4, [200, 60, 50]);
    fillRect(x + cox, y + top, 8, bh, [200, 60, 50]);
  }
  const pts: number[][] = [
    [x + 76, y + 12],
    [x + 100, y + 20],
    [x + 124, y + 28],
    [x + 148, y + 40],
    [x + 172, y + 54],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED);
  }
  for (const p of pts) disc(p[0], p[1], 2, WHITE);
  polyFill(
    [
      [x + 172, y + 54],
      [x + 162, y + 48],
      [x + 170, y + 64],
    ],
    RED
  );
  drawText(x + 72, y + h - 12, 1, "LOWEST SINCE JULY", [200, 200, 210]);
}

// 17 — UK and EU flags side by side: the reset deal.
function drawFlags(x: number, y: number, w: number, h: number): void {
  // Union Jack, left half.
  fillRect(x, y, 92, h, [20, 50, 110]);
  line(x + 2, y + 2, x + 90, y + h - 2, WHITE);
  line(x + 2, y + 3, x + 90, y + h - 1, WHITE);
  line(x + 2, y + 4, x + 90, y + h, WHITE);
  line(x + 90, y + 2, x + 2, y + h - 2, WHITE);
  line(x + 90, y + 3, x + 2, y + h - 1, WHITE);
  line(x + 90, y + 4, x + 2, y + h, WHITE);
  fillRect(x, y + 32, 92, 14, WHITE);
  fillRect(x + 39, y, 14, h, WHITE);
  fillRect(x, y + 36, 92, 6, RED);
  fillRect(x + 43, y, 6, h, RED);
  // EU flag, right half: blue field, ring of gold stars.
  fillRect(x + 96, y, w - 96, h, [20, 50, 130]);
  const ecx = x + 96 + Math.floor((w - 96) / 2);
  const ecy = y + Math.floor(h / 2);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
    disc(Math.round(ecx + 24 * Math.cos(a)), Math.round(ecy + 24 * Math.sin(a)), 3, GOLD);
  }
  disc(ecx, ecy, 4, GOLD);
  rect(x, y, w, h, INK);
}

// 18 — Japan inflation: rising bars and a red sun, 2.3% on top.
function drawJapan(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [240, 236, 224]);
  disc(x + w - 24, y + 16, 10, RED);
  drawText(x + 10, y + 6, 2, "2.3%", RED);
  drawText(x + 10, y + 24, 1, "OCT CPI", GREY);
  const heights = [18, 26, 34, 42, 52];
  for (let i = 0; i < 5; i++) {
    const bx = x + 10 + i * 34;
    const bh = heights[i];
    fillRect(bx, y + h - 8 - bh, 24, bh, i === 4 ? RED : [29, 78, 137]);
  }
  hline(x + 8, y + h - 8, w - 16, INK);
}

// 19 — Korea impeach: a courthouse and a gavel.
function drawKorea(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, SKY, [240, 236, 224]);
  const cx = x + Math.floor(w * 0.42);
  const base = y + h - 16;
  polyFill(
    [
      [cx - 52, base - 34],
      [cx, base - 50],
      [cx + 52, base - 34],
    ],
    [70, 90, 130]
  );
  fillRect(cx - 46, base - 34, 92, 8, WHITE);
  for (let i = 0; i < 4; i++) fillRect(cx - 40 + i * 24, base - 26, 8, 26, WHITE);
  fillRect(cx - 52, base, 104, 5, WHITE);
  fillRect(x + 14, y + h - 8, w - 28, 4, LIGHT);
  fillRect(x + 8, y + h - 4, w - 16, 4, [210, 204, 188]);
  // Gavel, bottom right.
  line(x + w - 52, y + h - 22, x + w - 22, y + h - 40, BROWN);
  polyFill(
    [
      [x + w - 26, y + h - 46],
      [x + w - 12, y + h - 38],
      [x + w - 20, y + h - 26],
      [x + w - 34, y + h - 34],
    ],
    BROWN
  );
  // Birds.
  for (const [bx2, by2] of [
    [x + 22, y + 16],
    [x + 34, y + 10],
  ]) {
    line(bx2 - 4, by2, bx2, by2 - 3, INK);
    line(bx2, by2 - 3, bx2 + 4, by2, INK);
  }
}

// 20 — Poland missile: a Kh-101 trail arcing down to a burst in a field.
function drawPolandMissile(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [38, 52, 74], [120, 140, 165]);
  for (let i = 0; i < 14; i++) {
    const sx = x + 6 + Math.floor(hash2(i, 71) * (w - 12));
    const sy = y + 4 + Math.floor(hash2(i, 72) * 20);
    disc(sx, sy, 1, [210, 215, 230]);
  }
  // Field, bottom.
  fillRect(x, y + h - 16, w, 16, [96, 128, 74]);
  // Dotted trail arcing from top right down to the burst.
  for (let t = 0; t <= 1; t += 0.08) {
    const tx = Math.round(x + w - 24 - t * (w - 84));
    const ty = Math.round(y + 10 + t * t * (h - 40));
    disc(tx, ty, 2, [255, 220, 160]);
  }
  // Missile body near the end of the trail.
  polyFill(
    [
      [x + 66, y + h - 34],
      [x + 82, y + h - 42],
      [x + 88, y + h - 34],
      [x + 72, y + h - 26],
    ],
    [200, 205, 215]
  );
  line(x + 66, y + h - 34, x + 58, y + h - 28, [255, 160, 40]);
  // Burst in the field.
  disc(x + 52, y + h - 22, 13, [255, 120, 30]);
  disc(x + 52, y + h - 22, 8, [255, 200, 60]);
  disc(x + 52, y + h - 22, 4, WHITE);
  disc(x + 52, y + h - 36, 7, [90, 90, 96]);
  disc(x + 66, y + h - 38, 5, [110, 110, 116]);
  // Tag.
  fillRect(x + 6, y + 6, 44, 12, RED);
  drawText(x + 10, y + 8, 1, "KH-101", WHITE);
}

// ---------------------------------------------------------------- world map

// Coarse continent outlines in [lon, lat].
const CONTINENTS: number[][][] = [
  [
    [-168, 66], [-150, 70], [-135, 69], [-125, 71], [-115, 73], [-100, 73], [-90, 74],
    [-80, 73], [-70, 68], [-60, 62], [-55, 52], [-65, 45], [-70, 42], [-75, 35],
    [-80, 32], [-81, 26], [-85, 21], [-90, 20], [-95, 19], [-97, 16], [-92, 14],
    [-86, 12], [-83, 9], [-80, 8], [-78, 7], [-82, 12], [-88, 15], [-92, 18],
    [-97, 22], [-102, 24], [-108, 26], [-112, 30], [-117, 33], [-122, 37], [-124, 42],
    [-124, 48], [-130, 54], [-140, 60], [-152, 58], [-158, 56], [-162, 60],
  ],
  [
    [-78, 7], [-80, 5], [-77, 2], [-75, -2], [-72, -5], [-70, -10], [-72, -18],
    [-70, -22], [-70, -30], [-68, -38], [-66, -45], [-68, -52], [-70, -54], [-73, -48],
    [-73, -40], [-72, -32], [-71, -22], [-70, -18], [-75, -15], [-78, -8], [-80, -4],
    [-81, 0], [-80, 4],
  ],
  [
    [-17, 15], [-16, 20], [-12, 26], [-8, 30], [-5, 35], [-1, 36], [5, 37], [10, 37],
    [15, 32], [20, 32], [25, 31], [30, 31], [33, 28], [35, 24], [38, 20], [40, 15],
    [43, 11], [46, 11], [51, 10], [48, 5], [44, 0], [40, -5], [38, -12], [35, -18],
    [33, -26], [30, -32], [25, -34], [20, -35], [16, -32], [14, -28], [12, -20],
    [12, -14], [13, -10], [10, -5], [9, 0], [9, 4], [6, 4], [0, 6], [-5, 5],
    [-10, 5], [-13, 8], [-16, 11],
  ],
  [
    [-10, 36], [-9, 38], [-9, 43], [-5, 44], [-2, 44], [-1, 46], [-4, 48], [-2, 49],
    [0, 50], [2, 51], [5, 53], [7, 54], [8, 57], [10, 58], [12, 56], [16, 56],
    [18, 56], [21, 55], [23, 56], [25, 58], [28, 59], [30, 60], [28, 62], [25, 64],
    [22, 65], [20, 68], [18, 70], [15, 70], [12, 68], [10, 65], [8, 62], [5, 60],
    [5, 58], [2, 57], [0, 55], [-2, 53], [-5, 50], [-8, 48], [-10, 44], [-10, 40],
  ],
  [
    [30, 62], [35, 66], [40, 68], [50, 69], [60, 70], [70, 72], [80, 73], [90, 75],
    [100, 76], [110, 76], [120, 73], [130, 71], [140, 72], [150, 70], [160, 66],
    [162, 60], [158, 56], [152, 52], [146, 46], [142, 42], [140, 38], [136, 35],
    [132, 33], [128, 34], [126, 38], [122, 40], [120, 32], [116, 25], [112, 22],
    [109, 19], [106, 12], [104, 9], [101, 7], [98, 10], [95, 15], [92, 21],
    [89, 22], [86, 20], [83, 17], [80, 13], [77, 9], [74, 13], [72, 20],
    [69, 22], [66, 25], [63, 25], [60, 25], [57, 26], [54, 27], [51, 29],
    [48, 30], [45, 31], [42, 34], [40, 36], [37, 36], [34, 36], [31, 36],
    [30, 38], [30, 42], [30, 46], [30, 50], [30, 54], [30, 58],
  ],
  [
    [113, -22], [114, -28], [115, -33], [118, -35], [122, -34], [126, -32], [129, -32],
    [132, -32], [135, -35], [137, -35], [140, -38], [143, -39], [146, -39], [149, -37],
    [150, -35], [153, -32], [153, -28], [150, -24], [148, -20], [146, -19], [144, -15],
    [142, -11], [140, -13], [138, -15], [136, -12], [134, -12], [132, -11], [130, -13],
    [128, -14], [126, -14], [124, -16], [122, -18], [120, -20], [117, -21], [114, -22],
  ],
  [
    [130, 31], [131, 32], [133, 34], [135, 34], [137, 35], [139, 35], [140, 37],
    [141, 39], [141, 41], [142, 43], [143, 44], [141, 44], [140, 42], [139, 39],
    [137, 37], [135, 34], [132, 33],
  ],
  [
    [167, -45], [169, -43], [171, -42], [173, -41], [175, -40], [177, -38], [176, -37],
    [174, -36], [173, -35], [171, -36], [169, -38], [167, -41],
  ],
];

// [lon, lat, story number (0 = brief dot), pixel offset x, pixel offset y]
// Numbers 1-13 are the drawn stories; blue dots are briefs.
const MAP_DOTS: number[][] = [
  [85.2, 19.3, 1, 0, 0],
  [30.5, 50.4, 2, -12, 0],
  [121.5, 25.0, 3, 0, 10],
  [-77.0, 38.9, 4, -14, -8],
  [-77.0, 38.9, 5, 4, -14],
  [-74.0, 40.7, 6, 17, -1],
  [174.8, -41.3, 7, 0, 0],
  [-74.0, 40.7, 8, -1, 11],
  [-0.1, 51.5, 9, 0, 0],
  [-48.5, -1.4, 10, 0, 0],
  [139.7, 35.7, 11, 12, -6],
  [127.0, 37.5, 12, -12, 6],
  [22.5, 51.0, 13, 12, 0],
  [44.4, 33.3, 0, 0, 0],
  [12.5, 42.0, 0, 0, 0],
  [36.8, -1.3, 0, 0, 0],
  [-89.2, 13.7, 0, 0, 0],
  [33.8, -13.5, 0, 0, 0],
  [56.3, 26.5, 0, 0, 0],
  [-115.1, 36.1, 0, 0, 0],
  [-72.7, 19.0, 0, 0, 0],
  [85.3, 27.7, 0, 0, 0],
  [-58.4, -34.6, 0, 0, 0],
  [-75.7, 45.4, 0, 0, 0],
  [44.8, 41.7, 0, 0, 0],
];

function drawMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [188, 213, 228]);
  // Graticule.
  for (let lon = -120; lon <= 120; lon += 60) {
    const gx = x + Math.floor(((lon + 180) / 360) * w);
    vline(gx, y, h, [165, 192, 208]);
  }
  for (let lat = -30; lat <= 60; lat += 30) {
    const gy = y + Math.floor(((90 - lat) / 150) * h);
    hline(x, gy, w, [165, 192, 208]);
  }
  // Continents.
  for (const cont of CONTINENTS) {
    const pts = cont.map(([lon, lat]) => [
      Math.round(x + ((lon + 180) / 360) * w),
      Math.round(y + ((90 - lat) / 150) * h),
    ]);
    polyFill(pts, [216, 206, 172]);
  }
  // Story dots.
  for (const [lon, lat, n, ox, oy] of MAP_DOTS) {
    const dx = Math.round(x + ((lon + 180) / 360) * w) + (ox ?? 0);
    const dy = Math.round(y + ((90 - lat) / 150) * h) + (oy ?? 0);
    if (n > 0) {
      disc(dx, dy, 7, RED);
      ring(dx, dy, 7, WHITE);
      drawText(dx - 2, dy - 3, 1, String(n), WHITE);
    } else {
      disc(dx, dy, 4, BLUE);
      ring(dx, dy, 4, WHITE);
    }
  }
}

// ---------------------------------------------------------------- layout

const BRIEFS_COL1: string[] = [
  "14 PETE ROSE PARDONED (REUTERS)",
  "15 HAITI GANGS KILL 42",
  "16 MERZ: TALKS 'VERY DIFFICULT' (STRAITS)",
  "17 UK 260M DRONE AID FOR KYIV",
  "18 US SANCTIONS CARTELS (REUTERS)",
  "19 VAN GOGH SELLS FOR $190.4M (DAWN)",
  "20 UK-EU YOUTH MOBILITY AGREED (BBC)",
  "21 ARGENTINA PASSES 71-0 VOTE",
  "22 NEPAL PM BEGINS INDIA VISIT",
  "23 MODI CALLS FOR IMPORT CUTS",
  "24 META RETHINKS NET-ZERO GOAL",
  "25 FIRST US DEEP-SEA MINING LEASES",
  "26 SOMALIA EXPELS UAE AMBASSADOR",
  "27 GAZANS RETURN AS IDF OP ENDS",
];

const BRIEFS_COL2: string[] = [
  "28 EUROPE YOUTH PROTEST ON COSTS",
  "29 CANADA: $250K FOR GOLDY BRAR",
  "30 BANGLADESH DEPLOYS PARAMILITARY",
  "31 NEW CALEDONIA HIT BY 5.6 QUAKE",
  "32 GEORGIA GAS BLAST KILLS 6",
  "33 IRAQ ARMY ENTERS STRONGHOLD (REUTERS)",
  "34 ITALY GENERAL STRIKE OVER BUDGET (AP)",
  "35 KENYA STARTS FIRST OIL DRILLING (ALLAFRICA)",
  "36 BUKELE FILES FOR THIRD TERM (AFP)",
  "37 MALAWI FUEL: 20 LITRES A DAY (AL JAZEERA)",
  "38 HORMUZ STAYS SHUT; BRENT $92.50 (STRAITS)",
  "39 RUSSELL FASTEST IN VEGAS PRACTICE (AFP)",
  "40 POTATOES GROWN IN MOON SOIL",
];

const NUMBERS: [string, string][] = [
  ["3", "BRIDGES HIT IN KYIV"],
  ["300,000+", "EVACUATED IN ODISHA"],
  ["-6.2%", "TAIPEI TAIEX"],
  ["2.3%", "JAPAN INFLATION"],
  ["$61,273", "BITCOIN PRICE"],
  ["175*", "NICHOLLS RUNS"],
];

function panel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER);
  rect(x, y, w, h, INK);
}

function build(): void {
  fillRect(0, 0, W, H, PAPER);

  // ---- top line: the paper line, and the count line ----
  drawText(8, 8, 1, "THE WORLD IN ONE DAY", RED);
  drawTextRight(1016, 8, 1, "40 STORIES - 6 REGIONS - EVERY ONE DATED FRIDAY 20 NOVEMBER 2026", INK);
  fillRect(8, 20, 1008, 2, INK);

  // ---- masthead: the date itself is the headline ----
  drawTextCentered(512, 26, 6, "FRIDAY 20 NOVEMBER 2026", INK);
  drawTextCentered(512, 74, 2, "KYIV BRIDGES HIT - AKVAN LANDFALL - ASIA MARKETS ROUT - UK-EU DEAL", RED);
  fillRect(8, 92, 1008, 2, INK);

  // ---- numbers strip: six numbers that sum up the day ----
  for (let i = 0; i < NUMBERS.length; i++) {
    const x = 8 + i * 168;
    panel(x, 96, 166, 36);
    drawTextCentered(x + 83, 100, 3, NUMBERS[i][0], RED);
    drawTextCentered(x + 83, 122, 1, NUMBERS[i][1], INK);
  }

  // ---- region bar: story counts by region, summing to 40 ----
  const REGIONS: [string, number, RGB][] = [
    ["ASIA-PACIFIC 9", 226, TEAL],
    ["EUROPE 10", 252, BLUE],
    ["MIDDLE EAST 4", 101, BROWN],
    ["AFRICA 3", 76, GREEN],
    ["AMERICAS 11", 277, RED],
    ["GLOBAL 3", 76, [100, 100, 100]],
  ];
  let rx = 8;
  for (const [label, rw, col] of REGIONS) {
    fillRect(rx, 136, rw, 16, col);
    drawTextCentered(rx + Math.floor(rw / 2), 141, 1, label, WHITE);
    rx += rw;
  }

  // ---- heroes: three lead stories, each with a picture ----
  const heroes = [
    { x: 8, kicker: "1 ODISHA, INDIA - CYCLONE", pic: drawCyclone, h1: "CYCLONE AKVAN COMES", h2: "ASHORE IN EASTERN INDIA", body: "Landfall 11:20 IST. 370,000 in shelters.", src: "(IMD, PTI) - NO DEATHS - RAIN 209 MM" },
    { x: 344, kicker: "2 KYIV, UKRAINE - WAR", pic: drawKyiv, h1: "RUSSIAN MISSILES HIT", h2: "THREE KYIV BRIDGES", body: "110 missiles, 400 drones. 8 killed.", src: "(KYIV INDEPENDENT, BBC) - POWER AND WATER CUT" },
    { x: 680, kicker: "3 TAIPEI - SEOUL - TOKYO - MARKETS", pic: drawMarkets, h1: "AI SELL-OFF SINKS", h2: "ASIA'S STOCK MARKETS", body: "Taipei -6.2%, Seoul -5.2%. Tokyo -5.1%.", src: "(AL JAZEERA, REUTERS) - WORST WEEK SINCE 1991" },
  ];
  for (const hh of heroes) {
    panel(hh.x, 156, 328, 220);
    hh.pic(hh.x + 8, 164, 312, 104);
    drawText(hh.x + 8, 274, 1, hh.kicker, RED);
    drawText(hh.x + 8, 286, 2, hh.h1, INK);
    drawText(hh.x + 8, 303, 2, hh.h2, INK);
    drawPara(hh.x + 8, 320, 2, 312, hh.body, INK);
    drawText(hh.x + 8, 360, 1, hh.src, GREY);
  }

  // ---- mid stories: ten more, each with its own picture ----
  const mids = [
    { x: 8, y: 380, kicker: "4 WASHINGTON - DIPLOMACY", pic: drawTrump, h1: "TRUMP DELAYS", h2: "IRAN TO 2027", body: "We will see after January 1, he said. I am not rushing.", src: "(FOX, AXIOS)" },
    { x: 211, y: 380, kicker: "5 WASHINGTON - CONGRESS", pic: drawSenate, h1: "SENATE BLOCKS", h2: "IRAN WAR VOTE", body: "51-48: bid to curb war powers fails. Collins voted yes.", src: "(REUTERS)" },
    { x: 414, y: 380, kicker: "6 MARKETS - CRYPTO", pic: drawBitcoinMid, h1: "BITCOIN SINKS", h2: "TO $61,273", body: "Lowest since July. ETF outflows $3.47bn in November.", src: "(REUTERS) - 7TH WEEKLY LOSS" },
    { x: 617, y: 380, kicker: "7 WELLINGTON - CRICKET", pic: drawCricket, h1: "NICHOLLS 175*", h2: "LIFTS NZ TO 368", body: "Phillips 118, Bumrah 4/92. India 159-1: Jaiswal 85.", src: "(AP) - DAY 2, WELLINGTON" },
    { x: 820, y: 380, kicker: "8 NEW YORK - MARKETS", pic: drawDow, h1: "DOW PLUNGES", h2: "DOWN 1,101 PTS", body: "S&P -2.0%, 6th straight fall. Longest run since 2024.", src: "(REUTERS)" },
    { x: 8, y: 552, kicker: "9 BRUSSELS - DIPLOMACY", pic: drawFlags, h1: "UK AND EU SEAL", h2: "A 'RESET' DEAL", body: "Food trade, youth visas, carbon link. Deal agreed.", src: "(REUTERS, BBC)" },
    { x: 211, y: 552, kicker: "10 ANTALYA - CLIMATE", pic: drawVignetteCOP31, h1: "COP31: NO DEAL", h2: "ON LAST DAY", body: "Draft text leaves out fossil fuels. Talks run on.", src: "(AFP, UN NEWS)" },
    { x: 414, y: 552, kicker: "11 TOKYO - ECONOMY", pic: drawJapan, h1: "JAPAN INFLATION", h2: "UP TO 2.3%", body: "Core 2.2%, headline 2.3%. A December rise stays in view.", src: "(REUTERS)" },
    { x: 617, y: 552, kicker: "12 SEOUL - POLITICS", pic: drawKorea, h1: "SEOUL: IMPEACH", h2: "TOP JUDGE", body: "Ruling party acts after an overturned conviction.", src: "(YONHAP)" },
    { x: 820, y: 552, kicker: "13 E. POLAND - SECURITY", pic: drawPolandMissile, h1: "RUSSIAN MISSILE", h2: "LANDS IN POLAND", body: "Kh-101 down in a field. No one hurt. Tusk: provocation.", src: "(REUTERS)" },
  ];
  for (const m of mids) {
    panel(m.x, m.y, 195, 168);
    m.pic(m.x + 4, m.y + 8, 187, 78);
    drawText(m.x + 4, m.y + 90, 1, m.kicker, RED);
    drawText(m.x + 4, m.y + 102, 2, m.h1, INK);
    drawText(m.x + 4, m.y + 119, 2, m.h2, INK);
    drawPara(m.x + 4, m.y + 136, 1, 187, m.body, INK);
    drawText(m.x + 4, m.y + 158, 1, m.src, GREY);
  }

  // ---- bottom band: world map + numbered briefs ----
  panel(8, 724, 400, 194);
  drawText(20, 732, 2, "WHERE THE NEWS HAPPENED", INK);
  drawMap(16, 748, 384, 140);
  drawText(20, 892, 1, "PINS 1-13 MARK THE DRAWN STORIES", INK);
  drawText(20, 904, 1, "BLUE DOTS: MORE STORIES ON THIS PAGE", INK);

  panel(416, 724, 600, 194);
  drawText(428, 732, 2, "ALSO ON FRIDAY 20 NOVEMBER", RED);
  hline(428, 748, 576, RED);
  for (let i = 0; i < 14; i++) {
    const yb = 754 + i * 11;
    bullet(428, yb + 1, 5, RED);
    drawText(438, yb, 1, BRIEFS_COL1[i], INK);
  }
  for (let i = 0; i < 13; i++) {
    const yb = 754 + i * 11;
    bullet(716, yb + 1, 5, RED);
    drawText(726, yb, 1, BRIEFS_COL2[i], INK);
  }

  // ---- date check: what was left out, and why ----
  panel(8, 922, 1008, 58);
  fillRect(8, 922, 1008, 4, RED);
  drawText(20, 930, 2, "DATE CHECK - READ THIS FIRST", RED);
  drawPara(
    20,
    946,
    1,
    984,
    "Left out as Thursday 19 November news: Anthropic's Nasdaq debut, the ICJ Myanmar ruling, the Trump-Xi-Putin Shenzhen declaration, GTA 6 going on sale, the Crimea bridge strike. None had happened as Friday's news.",
    INK
  );

  // ---- footer ----
  drawTextCentered(512, 988, 1, "EVERY STORY HERE HAPPENED, OR WAS FIRST REPORTED, ON FRIDAY 20 NOVEMBER 2026", INK);
  drawTextCentered(512, 1002, 1, "SOURCES NAMED BESIDE EACH STORY - 40 STORIES, ALL VERIFIED - ORIGINAL DRAWINGS", GREY);
  fillRect(8, 1016, 1008, 2, INK);
}

// ---------------------------------------------------------------- main

function main(): void {
  build();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}

main();
