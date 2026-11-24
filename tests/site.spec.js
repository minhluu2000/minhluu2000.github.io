const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SITE_DIR = path.resolve(__dirname, '..');
const PAGE_URL = pathToFileURL(path.join(SITE_DIR, 'index.html')).href;

const SCREENS = [
  { name: 'small phone', viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
];

// Thumbnails use loading="lazy", so scroll each one into view and wait for it,
// otherwise an unloaded 0x0 image would pass every layout check.
async function openWithAllImagesLoaded(page) {
  await page.goto(PAGE_URL);
  const images = await page.locator('img').all();
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveJSProperty('complete', true);
    expect(await image.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

function boxContains(outer, inner, tolerancePx = 0.5) {
  return inner.left >= outer.left - tolerancePx && inner.right <= outer.right + tolerancePx
    && inner.top >= outer.top - tolerancePx && inner.bottom <= outer.bottom + tolerancePx;
}

function boxesOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

for (const screen of SCREENS) {
  test.describe(`${screen.name} (${screen.viewport.width}px)`, () => {
    test.use(screen);

    test('page does not scroll sideways', async ({ page }) => {
      await openWithAllImagesLoaded(page);
      const { scrollWidth, viewportWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);
    });

    test('every thumbnail image stays inside its box', async ({ page }) => {
      await openWithAllImagesLoaded(page);
      const thumbs = await page.$$eval('.thumb', (boxes) => boxes.map((box) => {
        const img = box.querySelector('img');
        const rect = (el) => el.getBoundingClientRect().toJSON();
        return { href: box.href, box: rect(box), img: img && rect(img) };
      }));
      const withImages = thumbs.filter((t) => t.img);
      expect(withImages.length).toBeGreaterThan(0);
      for (const thumb of withImages) expect(thumb.img.width, thumb.href).toBeGreaterThan(0);
      const spilling = withImages.filter((t) => !boxContains(t.box, t.img)).map((t) => t.href);
      expect(spilling, 'thumbnails whose image spills out of the box').toEqual([]);
    });

    test('thumbnails never cover paper text', async ({ page }) => {
      await openWithAllImagesLoaded(page);
      const papers = await page.$$eval('.pub', (items) => items.map((item) => {
        const rect = (el) => el.getBoundingClientRect().toJSON();
        const visual = item.querySelector('.thumb img') || item.querySelector('.thumb');
        const textBlocks = [...item.querySelectorAll('h3, .meta, .links')].map(rect);
        return { title: item.querySelector('h3').textContent, visual: rect(visual), textBlocks };
      }));
      expect(papers.length).toBeGreaterThan(0);
      const covered = papers
        .filter((paper) => paper.textBlocks.some((text) => boxesOverlap(paper.visual, text)))
        .map((paper) => paper.title);
      expect(covered, 'papers whose thumbnail covers their text').toEqual([]);
    });

    test('text is readable without zooming', async ({ page }) => {
      await page.goto(PAGE_URL);
      const smallestFontPx = await page.$$eval('p, h1, h3, a', (elements) =>
        Math.min(...elements.map((el) => parseFloat(getComputedStyle(el).fontSize))));
      expect(smallestFontPx).toBeGreaterThanOrEqual(13);
    });
  });
}

test('mobile layout is enabled by the viewport tag', async ({ page }) => {
  await page.goto(PAGE_URL);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
});

test('every local link and image points to a file in the repo', async ({ page }) => {
  await page.goto(PAGE_URL);
  const targets = await page.$$eval('[href], [src]', (elements) =>
    elements.map((el) => el.getAttribute('href') || el.getAttribute('src')));
  const localFiles = targets.filter((t) => !/^(https?:|mailto:|data:|#)/.test(t));
  expect(localFiles).toEqual(expect.arrayContaining(['cv.pdf', 'avatar.png']));
  for (const file of localFiles) {
    expect(fs.existsSync(path.join(SITE_DIR, file)), `missing file: ${file}`).toBe(true);
  }
});

test('external links use https', async ({ page }) => {
  await page.goto(PAGE_URL);
  const externalLinks = await page.$$eval('a[href^="http"]', (links) => links.map((a) => a.getAttribute('href')));
  expect(externalLinks.length).toBeGreaterThan(0);
  for (const link of externalLinks) expect(link).toMatch(/^https:\/\//);
});

test('every paper lists title link, authors with my name in bold, venue and arXiv', async ({ page }) => {
  await page.goto(PAGE_URL);
  const papers = page.locator('.pub');
  const paperCount = await papers.count();
  expect(paperCount).toBeGreaterThan(0);
  for (let i = 0; i < paperCount; i++) {
    const paper = papers.nth(i);
    await expect(paper.locator('h3 a')).toHaveAttribute('href', /^https:\/\/arxiv\.org\/abs\//);
    await expect(paper.locator('.meta b')).toHaveText(/^(Minh Luu|Luu Danh Minh)$/);
    await expect(paper.locator('.venue')).not.toBeEmpty();
    await expect(paper.locator('.links a', { hasText: 'arXiv' })).toHaveCount(1);
  }
});

test('page text follows the writing rules', async ({ page }) => {
  await page.goto(PAGE_URL);
  const text = await page.locator('body').innerText();
  // Em dash, en dash, semicolon, multiplication sign, curly quotes and arrows.
  expect(text).not.toMatch(/[—–;×‘’“”←-⇿]/);
  expect(text).not.toMatch(/(^|[.!?]\s+)Because\b/m);
});

test('dark mode switches to a dark background with light text', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(PAGE_URL);
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, text: style.color };
  });
  const brightness = (rgb) => rgb.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
  expect(brightness(colors.background)).toBeLessThan(60);
  expect(brightness(colors.text)).toBeGreaterThan(180);
});
