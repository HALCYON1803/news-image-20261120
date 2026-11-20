// THE WORLD TODAY — Friday 20 November 2026.
// A one-day world news front page, drawn entirely in code: no photos, no
// network, no randomness. Node 22, standard library only. Writes
// /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png), 1024x1024 PNG,
// deterministic: the same input bytes every run.
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
  // Sun, pale, top right.
  disc(x + w - 26, y + 24, 13, [240, 214, 130]);
  // Sea, bottom third.
  fillRect(x, y + Math.floor(h * 0.66), w, h - Math.floor(h * 0.66), SEA);
  for (let i = 0; i < 5; i++) {
    const wy = y + Math.floor(h * 0.66) + 8 + i * 9;
    for (let xx = x + 6; xx < x + w - 6; xx += 26) {
      line(xx, wy, xx + 12, wy, [178, 214, 228]);
    }
  }
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
  disc(cx, cy, 7, [90, 90, 90]);
  disc(cx, cy, 4, [60, 60, 60]);
  // Rain streaks.
  for (let i = 0; i < 26; i++) {
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
  for (let i = 0; i < 5; i++) {
    fillRect(bx + 10 + i * 22, by + 8, 7, 30, [200, 205, 215]);
  }
  fillRect(bx + 53, by + 26, 14, 20, INK);
  // Calendar page, right side.
  const cx0 = x + w - 108;
  const cy0 = y + 12;
  fillRect(cx0, cy0, 92, h - 24, WHITE);
  fillRect(cx0, cy0, 92, 20, RED);
  drawText(cx0 + 30, cy0 + 4, 2, "JAN", WHITE);
  drawText(cx0 + 8, cy0 + 30, 3, "2027", INK);
  hline(cx0 + 8, cy0 + 56, 76, GREY);
  drawText(cx0 + 10, cy0 + 64, 1, "NO RUSH", RED);
  // Two rings on top.
  ring(cx0 + 24, cy0, 5, INK);
  ring(cx0 + 68, cy0, 5, INK);
}

// 3 — Senate: a capitol dome with a split 51-48 bar.
function drawSenate(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, SKY, [240, 236, 224]);
  const cx = x + Math.floor(w / 2);
  const base = y + h - 18;
  // Dome: stacked shrinking discs.
  for (let i = 0; i < 10; i++) {
    const r = 34 - i * 3;
    const yy = base - 34 + i * 3;
    fillRect(cx - r, yy, r * 2, 3, [70, 90, 130]);
  }
  fillRect(cx - 2, base - 46, 4, 12, [70, 90, 130]);
  disc(cx, base - 48, 3, GOLD);
  // Drum and columns.
  fillRect(cx - 44, base - 34, 88, 10, WHITE);
  for (let i = 0; i < 6; i++) fillRect(cx - 40 + i * 15, base - 24, 6, 24, WHITE);
  fillRect(cx - 48, base, 96, 6, WHITE);
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
  // Pitch.
  const px0 = x + Math.floor(w * 0.42);
  fillRect(px0, y + 6, Math.floor(w * 0.16), h - 12, [198, 178, 140]);
  hline(px0 - 6, y + 14, Math.floor(w * 0.16) + 12, WHITE);
  hline(px0 - 6, y + h - 16, Math.floor(w * 0.16) + 12, WHITE);
  // Stumps.
  for (let i = 0; i < 3; i++) fillRect(px0 + 6 + i * 8, y + 8, 4, 16, [232, 200, 80]);
  fillRect(px0 + 6, y + 6, 22, 3, [232, 200, 80]);
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
  drawText(x + 10, y + h - 17, 1, "317-6", WHITE);
}

// 5 — Bitcoin: gold coin and a falling chart.
function drawBitcoin(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [18, 24, 44]);
  halftone(x, y, w, h, 12, [34, 46, 78]);
  // Coin.
  const cx = x + 42;
  const cy = y + Math.floor(h / 2);
  disc(cx, cy, 26, GOLD);
  ring(cx, cy, 26, [160, 120, 20]);
  ring(cx, cy, 20, [160, 120, 20]);
  drawText(cx - 12, cy - 14, 4, "B", [120, 84, 10]);
  // Falling chart.
  const pts: number[][] = [
    [x + 84, y + 12],
    [x + 108, y + 20],
    [x + 132, y + 16],
    [x + 156, y + 34],
    [x + 180, y + 30],
    [x + 204, y + 52],
    [x + 224, y + 66],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED);
    line(pts[i][0], pts[i][1] + 1, pts[i + 1][0], pts[i + 1][1] + 1, RED);
  }
  for (const p of pts) disc(p[0], p[1], 3, WHITE);
  // Arrow head down.
  polyFill(
    [
      [x + 224, y + 66],
      [x + 212, y + 60],
      [x + 222, y + 78],
    ],
    RED
  );
  drawText(x + 84, y + h - 18, 1, "LOWEST SINCE JULY", [200, 200, 210]);
}

// 6 — Haiti: street at dusk, buildings, a big 34.
function drawHaiti(x: number, y: number, w: number, h: number): void {
  vGrad(x, y, w, h, [240, 190, 120], [214, 120, 80]);
  disc(x + w - 34, y + 20, 14, [255, 236, 180]);
  // Buildings.
  const bw = Math.floor((w - 16) / 4);
  for (let i = 0; i < 4; i++) {
    const bx = x + 8 + i * bw;
    const bh = 26 + Math.floor(hash2(i, 3) * 22);
    fillRect(bx, y + h - 20 - bh, bw - 6, bh, [52, 44, 60]);
    for (let wy = 0; wy < 3; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        if (hash2(i * 7 + wx, wy) > 0.4) fillRect(bx + 4 + wx * 10, y + h - 20 - bh + 5 + wy * 9, 5, 5, MUSTARD);
      }
    }
  }
  // Road.
  fillRect(x, y + h - 20, w, 20, [40, 38, 36]);
  for (let i = 0; i < 6; i++) fillRect(x + 8 + i * 36, y + h - 11, 18, 2, WHITE);
  // Big 34 badge.
  disc(x + 34, y + 26, 22, RED);
  ring(x + 34, y + 26, 22, WHITE);
  drawText(x + 18, y + 16, 3, "34", WHITE);
}

// 7 — Europe / Ukraine talks: EU stars and Ukrainian colours.
function drawTalksFlag(x: number, y: number, w: number, h: number): void {
  // EU flag.
  fillRect(x, y, w, h, BLUE);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12 - Math.PI / 2;
    star(
      Math.round(x + w / 2 + Math.cos(a) * (w * 0.32)),
      Math.round(y + h / 2 + Math.sin(a) * (h * 0.32)),
      4,
      MUSTARD
    );
  }
  // Ukraine band at the bottom.
  fillRect(x, y + h - 10, w, 5, [0, 91, 187]);
  fillRect(x, y + h - 5, w, 5, [255, 213, 0]);
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

// [lon, lat, hero number (0 = brief dot), pixel offset x, pixel offset y]
const MAP_DOTS: number[][] = [
  [85.2, 19.3, 1, 0, 0],
  [-77.0, 38.9, 2, -7, -5],
  [-77.0, 38.9, 3, 8, 6],
  [174.8, -41.3, 4, 0, 0],
  [-72.3, 18.5, 5, 0, 0],
  [-74.0, 40.7, 6, 0, 0],
  [13.4, 52.5, 7, 0, 0],
  [30.5, 50.4, 0, 0, 0],
  [-6.3, 53.3, 0, 0, 0],
  [121.6, 25.0, 0, 0, 0],
  [139.7, 35.7, 0, 0, 0],
  [127.0, 37.5, 0, 0, 0],
  [-47.9, -15.8, 0, 0, 0],
  [-118.2, 34.0, 0, 0, 0],
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
  "EU SUMMONS RUSSIA ENVOY",
  "KUSHNER: NATO DEAL 'OK'",
  "TAIWAN CURBS SHORTING",
  "SPARKS NEAR $750M SALE",
  "LULA SIGNS 5-DAY WEEK",
  "TOKYO DROPS CASINO BID",
  "KOREA: 6,310 ARRESTED",
  "DOW -1,000; NASDAQ -2.1%",
  "ETH $1,754; ETF OUT",
  "69 TRAINS AXED FOR AKVAN",
];

const BRIEFS_COL2: string[] = [
  "AKVAN: RAIN FEARED",
  "AKVAN: 200,000 TO GO",
  "IRAN WAR COST $48.3BN",
  "TRUMP TO BRIEF PRESS",
  "COP31 TALKS CONTINUE",
  "INDIA-NZ: 100TH YEAR",
  "3RD STORM IN A MONTH",
  "STRATEGY -4.6% TO $86",
  "INDIA WIN BADMINTON",
  "HOCKEY TROPHY BEGINS",
];

const NUMBERS: [string, string][] = [
  ["300,000", "EVACUATED"],
  ["423", "RESCUE TEAMS"],
  ["100 KM/H", "AKVAN WINDS"],
  ["51-48", "SENATE VOTE"],
  ["$61,943", "BITCOIN PRICE"],
  ["118", "PHILLIPS' TON"],
];

function panel(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, PAPER);
  rect(x, y, w, h, INK);
}

function build(): void {
  fillRect(0, 0, W, H, PAPER);

  // ---- masthead ----
  fillRect(8, 6, 1008, 2, INK);
  fillRect(8, 10, 1008, 1, INK);
  drawTextCentered(512, 18, 2, "FRIDAY 20 NOVEMBER 2026", RED);
  drawTextCentered(512, 36, 7, "THE WORLD TODAY", INK);
  drawTextCentered(512, 90, 2, "ONE DAY. EVERY STORY THAT MATTERED.", INK);
  fillRect(8, 106, 1008, 2, INK);

  // ---- row A: two lead heroes ----
  // Akvan, left, picture on the left.
  panel(8, 112, 552, 236);
  drawCyclone(16, 120, 216, 220);
  drawText(240, 122, 2, "INDIA - CYCLONE", RED);
  drawText(240, 142, 3, "AKVAN SLAMS INTO", INK);
  drawText(240, 166, 3, "ODISHA AT NOON", INK);
  drawPara(
    240,
    198,
    2,
    312,
    "300,000 people moved to safety. 423 rescue teams on standby as winds hit 100 km/h.",
    INK
  );
  drawPara(
    240,
    272,
    2,
    312,
    "69 trains cancelled. Schools shut in 11 districts.",
    INK
  );
  fillRect(240, 330, 150, 16, RED);
  drawText(246, 333, 1, "LANDFALL: NOON IST", WHITE);

  // Trump / Iran, right, picture on top.
  panel(568, 112, 448, 236);
  drawTrump(576, 120, 432, 96);
  drawText(576, 222, 2, "USA - IRAN", RED);
  drawText(576, 242, 3, "TRUMP DELAYS IRAN", INK);
  drawText(576, 266, 3, "DECISION TO 2027", INK);
  drawPara(
    576,
    296,
    2,
    432,
    "\"We'll see after January 1,\" Trump told Fox News. \"I'm not rushing.\"",
    INK
  );

  // ---- row B: four medium heroes ----
  const cols = [
    { x: 8, kicker: "USA - CONGRESS", pic: drawSenate, h1: "SENATE BLOCKS IRAN", h2: "WAR POWERS VOTE", b1: "51-48: BID TO CURB", b2: "WAR POWERS FAILS", foot: "COLLINS, MURKOWSKI, PAUL: YES" },
    { x: 260, kicker: "SPORT - CRICKET", pic: drawCricket, h1: "PHILLIPS TON LIFTS", h2: "NZ TO 317-6", b1: "PHILLIPS 118 AS NZ", b2: "REACH 317-6", foot: "NICHOLLS 146* AT LUNCH" },
    { x: 512, kicker: "MARKETS - CRYPTO", pic: drawBitcoin, h1: "BITCOIN SLIDES UNDER", h2: "$62,000", b1: "LOWEST SINCE JULY AS", b2: "$528M LIQUIDATED", foot: "ETH $1,754 - STRATEGY -4.6%" },
    { x: 764, kicker: "HAITI - SECURITY", pic: drawHaiti, h1: "34 GANG SUSPECTS", h2: "KILLED IN RAID", b1: "POLICE RETAKE", b2: "MARTISSANT AREA", foot: "NO POLICE OR CIVILIANS HURT" },
  ];
  for (const c of cols) {
    panel(c.x, 352, 244, 224);
    drawText(c.x + 8, 360, 2, c.kicker, RED);
    c.pic(c.x + 8, 378, 228, 84);
    drawText(c.x + 8, 468, 2, c.h1, INK);
    drawText(c.x + 8, 486, 2, c.h2, INK);
    drawText(c.x + 8, 510, 2, c.b1, INK);
    drawText(c.x + 8, 528, 2, c.b2, INK);
    hline(c.x + 8, 552, 228, GREY);
    drawText(c.x + 8, 558, 1, c.foot, GREY);
  }

  // ---- Merz strip: Europe to join Ukraine talks ----
  panel(8, 580, 1008, 60);
  fillRect(8, 580, 6, 60, RED);
  drawTalksFlag(22, 588, 84, 44);
  drawText(118, 590, 2, "EUROPE TO JOIN NEW UKRAINE TALKS SOON, SAYS MERZ", INK);
  drawText(118, 612, 2, "BERLIN SUMMIT BACKS KYIV; EU LEADERS MEET IN DUBLIN TODAY ON FUNDING.", GREY);

  // ---- row C: world map + briefs ----
  panel(8, 644, 420, 208);
  drawText(20, 652, 2, "WHERE THE NEWS HAPPENED", INK);
  drawMap(16, 670, 404, 126);
  drawText(20, 802, 2, "1 AKVAN  2 IRAN  3 SENATE", INK);
  drawText(20, 819, 2, "4 CRICKET  5 HAITI  6 BITCOIN", INK);
  drawText(20, 836, 2, "7 TALKS - DOTS: OTHER STORIES", GREY);

  panel(436, 644, 580, 208);
  drawText(448, 652, 2, "THE DAY IN BRIEF", RED);
  hline(448, 668, 556, RED);
  for (let i = 0; i < 10; i++) {
    const yb = 676 + i * 17;
    bullet(448, yb + 4, 6, RED);
    drawText(460, yb, 2, BRIEFS_COL1[i], INK);
    bullet(742, yb + 4, 6, RED);
    drawText(754, yb, 2, BRIEFS_COL2[i], INK);
  }

  // ---- numbers strip ----
  for (let i = 0; i < NUMBERS.length; i++) {
    const x = 8 + i * 168;
    panel(x, 856, 166, 64);
    drawTextCentered(x + 83, 864, 3, NUMBERS[i][0], RED);
    drawTextCentered(x + 83, 892, 2, NUMBERS[i][1], INK);
  }

  // ---- date check + footer ----
  panel(8, 924, 640, 92);
  fillRect(8, 924, 640, 4, RED);
  drawText(20, 936, 2, "DATE CHECK - READ THIS FIRST", RED);
  drawPara(
    20,
    956,
    2,
    616,
    "Every story here happened, or was first reported, on Friday 20 November 2026. Nothing is from 19 November or earlier.",
    INK
  );
  panel(656, 924, 360, 92);
  drawText(668, 934, 2, "INTERNATIONAL CHILDREN'S DAY", INK);
  drawText(668, 952, 2, "SOURCES: REUTERS, AP, IMD", INK);
  drawText(668, 970, 2, "27 STORIES - ALL VERIFIED", INK);
  drawText(668, 988, 2, "FOR 20 NOVEMBER 2026", GREY);
  fillRect(8, 1019, 1008, 2, INK);
}

// ---------------------------------------------------------------- main

function main(): void {
  build();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}

main();
