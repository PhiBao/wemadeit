// Capture real product screenshots for the pitch deck. Local-only tooling.
//
//   node scripts/capture-app.mjs
//
// Logs out (no passkey possible headlessly), so these show the logged-out
// product: the public feed and a public pot in full. That is deliberate — the
// logged-out view is what a judge sees first anyway.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../../.submission/shots");
const SITE = process.env.SITE ?? "https://wemadeit.vercel.app";

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
// Narrower viewport: the app is a centred max-w-2xl column, so a 1280px capture
// wastes half the slide on empty gutter. 900px frames the content tightly.
const ctx = await browser.newContext({
  viewport: { width: 900, height: 780 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

const shot = async (name, opts = {}) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log(`  ${name}.png`);
};

// Hero + login choices (what a first-time visitor sees)
console.log(`capturing ${SITE}`);
await page.goto(SITE, { waitUntil: "domcontentloaded", timeout: 60000 });

// This container has no emoji font, so 🎉 / 🔒 / ⚠ render as tofu boxes and
// would look broken in a pitch deck. Strip pictographic characters from the DOM
// before screenshotting. Real browsers on real machines render them fine — this
// is purely a capture-environment fix.
const stripEmoji = () =>
  page.evaluate(() => {
    const re =
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}\u{2705}]/gu;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    for (const n of nodes) n.nodeValue = n.nodeValue.replace(re, "");
    document.querySelectorAll("title").forEach((t) => (t.textContent = t.textContent.replace(re, "")));
  });

await stripEmoji();
await page.waitForTimeout(3500); // let the feed resolve
await stripEmoji(); // re-run: the feed renders after hydration
await shot("01-hero");

// Public feed, scrolled into view
await page.evaluate(() => window.scrollTo(0, 560));
await page.waitForTimeout(1200);
await stripEmoji();
await shot("02-feed");

// A public pot in full: progress, contributors, fee disclosure.
// Feed cards are click-handler divs, not <a href>, so pull a known-good pot
// address off the rendered card text instead of a link href.
await page.evaluate(() => window.scrollTo(0, 0));
const potAddr = await page.evaluate(() => {
  const m = document.body.innerText.match(/0x[0-9a-fA-F]{40}/);
  return m ? m[0] : null;
});
if (potAddr) {
  await page.goto(`${SITE}/pot/${potAddr}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(4000);
  await stripEmoji();
  await shot("03-pot");
  console.log(`  (pot: ${potAddr})`);
} else {
  console.log("  ! no pot address found in the feed");
}

await browser.close();
console.log(`\nPNGs in ${OUT}`);