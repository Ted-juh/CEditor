/**
 * documentation.mjs — the manual, opened and read the way a person does it.
 *
 * test/documentationView.test.js proves the renderer and the stores. This opens the program, takes
 * Help → Documentation, and reads what happens on screen:
 *
 *   tab        the manual opens as an editor tab, in front, with the panel docks out of its way
 *   anchor     a link to a section of the same document scrolls to it in the page — no window
 *              opens and the address does not change (every link used to open a browser window
 *              on the app's own origin, which showed "not found")
 *   back       Back returns to where the link was clicked
 *   document   a link to another shipped document opens that document, here
 *   keep       switching to another tab and back finds the same document at the same place
 *   window     with a native side, Own window asks for the window on the same section and closes
 *              the tab; help.html, the window's page, opens on the document and section it is given
 *
 * Screenshots go to CE_SHOTS when it is set.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { boot } from './behaviourKit.mjs';

const shots = process.env.CE_SHOTS || '';
const kit = await boot({ width: 1500, height: 900 });
const { page } = kit;
const popups = [];
page.context().on('page', (p) => popups.push(p.url()));
const shot = async (name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }); };

try {
  // --- tab --------------------------------------------------------------------------------------
  await page.click('.menubar .menu-item:has-text("Help")');
  await page.click('.dropdown-item:has-text("Documentation")');
  await page.waitForSelector('.documentation-view .content h1', { timeout: 30000 });
  const tab = await page.$eval('.tab.active .tab-name', (el) => el.textContent.trim());
  assert.equal(tab, 'Documentation', 'the manual should open as the tab in front');
  assert.equal(await page.$('.overlay-backdrop'), null, 'the fixed overlay is back');
  const viewWidth = await page.$eval('.documentation-view', (el) => el.getBoundingClientRect().width);
  assert.ok(viewWidth > 1200, `the docks should give the manual the width; it has ${viewWidth}px`);
  console.log('tab        ok');

  // --- anchor -----------------------------------------------------------------------------------
  await page.click('.documentation-view .doc:has-text("Scripting manual")');
  await page.waitForFunction(() => document.querySelector('.documentation-view .content h1')?.textContent.includes('Scripting'));
  const before = page.url();
  const link = await page.evaluate(() => {
    const content = document.querySelector('.documentation-view .content');
    const links = [...content.querySelectorAll('a[data-help-anchor]:not([data-help-doc])')];
    // One whose heading is well below the fold, so arriving there is a real scroll.
    const far = links.find((a) => {
      const h = content.querySelector(`#${CSS.escape(a.dataset.helpAnchor)}`);
      return h && h.offsetTop > content.clientHeight * 2;
    });
    if (!far) return null;
    far.setAttribute('data-check', 'anchor');
    return { anchor: far.dataset.helpAnchor, text: far.textContent };
  });
  assert.ok(link, 'the scripting manual should link to a section further down');
  const scrollBefore = await page.$eval('.documentation-view .content', (el) => el.scrollTop);
  await page.click('[data-check="anchor"]');
  await kit.settle(400);
  const landed = await page.evaluate((anchor) => {
    const content = document.querySelector('.documentation-view .content');
    const h = content.querySelector(`#${CSS.escape(anchor)}`);
    return { offset: h.getBoundingClientRect().top - content.getBoundingClientRect().top, scrollTop: content.scrollTop };
  }, link.anchor);
  assert.ok(Math.abs(landed.offset) < 40, `"${link.text}" should bring its heading to the top; it is ${landed.offset}px away`);
  assert.ok(landed.scrollTop > scrollBefore, 'the page should have scrolled');
  assert.equal(page.url(), before, 'following an anchor changed the address');
  assert.deepEqual(popups, [], 'a link inside the manual opened a window');
  await shot('documentation-anchor');
  console.log(`anchor     ok — "${link.text}" → #${link.anchor}`);

  // --- back -------------------------------------------------------------------------------------
  await page.click('.documentation-view button[aria-label="Back"]');
  await kit.settle(300);
  const scrollBack = await page.$eval('.documentation-view .content', (el) => el.scrollTop);
  assert.ok(Math.abs(scrollBack - scrollBefore) < 4, `Back should return to ${scrollBefore}, not ${scrollBack}`);
  console.log('back       ok');

  // --- document ---------------------------------------------------------------------------------
  await page.click('.documentation-view .doc:has-text("Scripting: getting started")');
  await page.waitForFunction(() => document.querySelector('.documentation-view .content a[data-help-doc]'));
  const target = await page.$eval('.documentation-view .content a[data-help-doc]', (a) => a.dataset.helpDoc);
  await page.click('.documentation-view .content a[data-help-doc]');
  await kit.settle(300);
  const active = await page.$eval('.documentation-view .doc.active .doc-title', (el) => el.textContent.trim());
  const expected = await page.evaluate(async (id) => {
    const { HELP_DOCS } = await import('/src/CE_Application/generated/helpDocs.js');
    return HELP_DOCS.find((d) => d.id === id)?.title;
  }, target);
  assert.equal(active, expected, 'a link to another document should open it in the viewer');
  assert.deepEqual(popups, []);
  console.log(`document   ok — ${target}`);

  // --- keep -------------------------------------------------------------------------------------
  await page.click('.documentation-view .doc:has-text("CEditor manual")');
  await kit.settle(200);
  await page.$eval('.documentation-view .content', (el) => { el.scrollTop = 1500; });
  await kit.settle(100);
  await kit.fresh();
  assert.equal(await page.$('.documentation-view'), null, 'the panel tab should be in front now');
  await page.click('.tab:has(.tab-name:text-is("Documentation"))');
  await page.waitForSelector('.documentation-view .content h1');
  await kit.settle(300);
  const kept = await page.evaluate(() => ({
    title: document.querySelector('.documentation-view .doc.active .doc-title')?.textContent.trim(),
    scrollTop: document.querySelector('.documentation-view .content').scrollTop,
  }));
  assert.equal(kept.title, 'CEditor manual', 'switching tabs lost the document');
  assert.ok(Math.abs(kept.scrollTop - 1500) < 4, `switching tabs lost the place: ${kept.scrollTop}`);
  await shot('documentation-tab');
  console.log('keep       ok');

  // --- window -----------------------------------------------------------------------------------
  // A stand-in native side, from here on: only what the manual's two events need.
  await page.evaluate(() => {
    window.__sent = [];
    window.__JUCE__ = { backend: {
      emitEvent: (name, payload) => window.__sent.push({ name, payload }),
      addEventListener: () => 0,
      removeEventListener: () => {},
    } };
  });
  await kit.fresh();
  await page.click('.tab:has(.tab-name:text-is("Documentation"))');
  await page.waitForSelector('.documentation-view button:has-text("Own window")');
  await page.$eval('.documentation-view .content', (el) => {
    const h = el.querySelectorAll('h2[id]')[3];
    el.scrollTop += h.getBoundingClientRect().top - el.getBoundingClientRect().top;
  });
  await kit.settle(100);
  await page.click('.documentation-view button:has-text("Own window")');
  await kit.settle(200);
  const sent = await page.evaluate(() => window.__sent.filter((e) => e.name === 'openDocumentationWindow'));
  assert.equal(sent.length, 1, 'Own window should ask the native side for the window once');
  assert.equal(sent[0].payload.doc, 'editor-manual');
  assert.ok(sent[0].payload.anchor, 'the window should open on the section the tab was showing');
  assert.equal(await page.$('.tab:has(.tab-name:text-is("Documentation"))'), null, 'the tab should close');
  await page.evaluate(() => { delete window.__JUCE__; });

  const helpUrl = new URL(`help.html?doc=${sent[0].payload.doc}&anchor=${sent[0].payload.anchor}`, page.url()).href;
  const windowPage = await page.context().browser().newPage();
  await windowPage.setViewportSize({ width: 1000, height: 760 });
  const windowErrors = [];
  windowPage.on('pageerror', (e) => windowErrors.push(String(e).split('\n')[0]));
  await windowPage.goto(helpUrl, { waitUntil: 'networkidle' });
  await windowPage.waitForSelector('.documentation-view .content h1');
  await windowPage.waitForTimeout(400);
  const opened = await windowPage.evaluate((anchor) => {
    const content = document.querySelector('.documentation-view .content');
    const h = content.querySelector(`#${CSS.escape(anchor)}`);
    return {
      title: document.querySelector('.documentation-view .doc.active .doc-title')?.textContent.trim(),
      offset: h ? h.getBoundingClientRect().top - content.getBoundingClientRect().top : null,
      app: !!document.querySelector('.app'),
    };
  }, sent[0].payload.anchor);
  assert.equal(opened.title, 'CEditor manual');
  assert.ok(opened.offset !== null && Math.abs(opened.offset) < 40, `help.html should open at the section: ${opened.offset}`);
  assert.equal(opened.app, false, 'help.html should be the manual alone, not the editor');
  assert.deepEqual(windowErrors, []);
  if (shots) await windowPage.screenshot({ path: join(shots, 'documentation-window.png') });
  console.log('window     ok');

  assert.deepEqual(kit.failures, [], 'page errors');
  console.log('documentation: all checks passed');
} finally {
  await kit.close();
}
