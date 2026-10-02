// Render the pitch deck to a video. Local-only tooling.
//
//   node scripts/render-deck.mjs              -> .submission/deck.mp4
//   node scripts/render-deck.mjs --pngs       -> .submission/slides/*.png
//   SLIDE_SECONDS=8 node scripts/render-deck.mjs
//
// Static slides, clean crossfade between them. No zoom/pan: Ken Burns on a text
// slide reads as a shaky recording, which is exactly what we don't want.

import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../.submission");
const DECK = path.join(OUT, "deck.html");
const SLIDES = path.join(OUT, "slides");
const MP4 = path.join(OUT, "deck.mp4");

const SECONDS = Number(process.env.SLIDE_SECONDS ?? 6);
const FADE = 0.45; // crossfade length, seconds
const PNG_ONLY = process.argv.includes("--pngs");

// ---------------------------------------------------------------- screenshots
await rm(SLIDES, { recursive: true, force: true });
await mkdir(SLIDES, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
await page.goto("file://" + DECK, { waitUntil: "networkidle" });

const slides = page.locator("section.slide");
const count = await slides.count();
console.log(`rendering ${count} slides @ 2560x1440`);
for (let i = 0; i < count; i++) {
  await slides.nth(i).screenshot({
    path: path.join(SLIDES, `slide-${String(i + 1).padStart(2, "0")}.png`),
  });
}
await browser.close();

if (PNG_ONLY) {
  console.log(`PNGs in ${SLIDES}`);
  process.exit(0);
}

// ------------------------------------------------------------------- assemble
const files = (await readdir(SLIDES))
  .filter((f) => f.endsWith(".png"))
  .sort();
console.log(`assembling ${files.length} slides @ ${SECONDS}s each`);

// Render each slide to a still clip (no zoompan), then xfade them together.
// xfade gives a real cross-dissolve between slides instead of fading to black.
const tmp = path.join(SLIDES, "_clips");
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });

const clips = [];
for (let i = 0; i < files.length; i++) {
  const clip = path.join(tmp, `clip-${String(i + 1).padStart(2, "0")}.mp4`);
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-loop", "1",
    "-i", path.join(SLIDES, files[i]),
    "-t", String(SECONDS),
    "-r", "30",
    "-vf", `scale=1920:1080:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    clip,
  ]);
  clips.push(clip);
}

// Chain xfade filters. Each transition overlaps two clips by FADE seconds, so
// the offsets must account for the accumulated overlap.
// Chain xfade filters. Each transition overlaps two clips by FADE seconds, so
// offsets must account for the accumulated overlap. Filter chains are
// semicolon-separated; each link MUST end with a separator or ffmpeg rejects it.
const parts = [];
parts.push(`[0:v]format=yuv420p,setsar=1[v0]`);
let prev = "v0";
// Transition i starts FADE seconds before the current timeline ends, so each
// slide holds for (SECONDS - FADE) after the first. Starting the offset at
// SECONDS instead collapses the whole video to a single slide's length.
let offset = SECONDS - FADE;
for (let i = 1; i < clips.length; i++) {
  const label = `v${i}`;
  parts.push(`[${i}:v]format=yuv420p,setsar=1[${label}]`);
  parts.push(
    `[${prev}][${label}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[x${i}]`,
  );
  prev = `x${i}`;
  offset += SECONDS - FADE;
}
const filter = parts.join(";");

await run("ffmpeg", [
  "-y", "-v", "error",
  ...clips.flatMap((c) => ["-i", c]),
  "-filter_complex", filter,
  "-map", `[${prev}]`,
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "24",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  MP4,
]);

const duration = ((count - 1) * (SECONDS - FADE) + SECONDS).toFixed(1);
console.log(`wrote ${MP4} (~${duration}s)`);