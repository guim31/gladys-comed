// -----------------------------------------------------------------------------
// Every text Gladys shows exists in the four languages of its interface
// (English, French, German, Spanish): the manifest, the message tables of the
// code, the feature names and the documentation. German says "du", never the
// polite "Sie"; Spanish says "usted".
// -----------------------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { MESSAGES, NAMES, TEXT } from '../src/i18n.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('../gladys-assistant-integration.json'));

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  sectionDescription: 1000,
  message: 200,
  short: 24,
  caption: 80,
  featureName: 40,
};

const sorted = (keys) => [...keys].sort();

/** Checks one multi-language object; returns its problems. */
function problems(value, path, max) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [`${path} must be a multi-language object`];
  }
  const found = [];
  if (JSON.stringify(sorted(Object.keys(value))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${path} has [${Object.keys(value)}], expected exactly [${LANGS}]`);
  }
  for (const [lang, text] of Object.entries(value)) {
    found.push(...textProblems(text, `${path}.${lang}`, lang, max));
  }
  return found;
}

function textProblems(text, path, lang, max) {
  if (typeof text !== 'string' || text.trim() === '') {
    return [`${path} is empty`];
  }
  const found = [];
  if (text.length > max) {
    found.push(`${path} has ${text.length} characters (${max} at most)`);
  }
  if (lang === 'de' && POLITE_GERMAN.test(text)) {
    found.push(`${path} uses the polite form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key, parent) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key, parent));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      let max = MAX[key] ?? MAX.label;
      if (path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)) {
        max = MAX.catalog;
      } else if (/^manifest\.widgets\[\d+\]\.label$/.test(path)) {
        max = MAX.widgetLabel;
      } else if (key === 'description' && parent?.type === 'section') {
        max = MAX.sectionDescription;
      }
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child, value);
    }
  };
  walk(root, 'manifest', null, null);
  return texts;
}

test('the configuration offers the four languages', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  assert.deepEqual(Object.keys(NAMES), LANGS);
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 50, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the name is the brand, the same in every language', () => {
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
});

test('the fixed texts of the code have the four languages', () => {
  const longTexts = new Set(['noPrices', 'initFailed', 'unreachable', 'stale']);
  const captions = new Set(['caption']);
  const found = Object.entries(TEXT).flatMap(([key, value]) =>
    problems(
      value,
      `TEXT.${key}`,
      longTexts.has(key) ? MAX.message : captions.has(key) ? MAX.caption : MAX.short,
    ),
  );
  assert.deepEqual(found, []);
});

test('the messages built from values have the four languages', () => {
  const found = [
    ...problems(
      MESSAGES.refreshed({ price: -12.4, average: 0, tomorrow: true }),
      'MESSAGES.refreshed',
      MESSAGES_MAX,
    ),
    ...problems(
      MESSAGES.refreshed({ price: null, average: null, tomorrow: false }),
      'MESSAGES.refreshed(partial)',
      MESSAGES_MAX,
    ),
    ...problems(MESSAGES.refreshFailed('timeout'), 'MESSAGES.refreshFailed', MESSAGES_MAX),
  ];
  assert.deepEqual(found, []);
});
// A toast or an action result: ≤ 200 per line, three lines at most.
const MESSAGES_MAX = 3 * MAX.message;

test('the feature names exist in every language, with the same keys', () => {
  const found = [];
  for (const lang of LANGS) {
    assert.deepEqual(sorted(Object.keys(NAMES[lang])), sorted(Object.keys(NAMES.en)), lang);
    for (const [key, name] of Object.entries(NAMES[lang])) {
      found.push(...textProblems(name, `NAMES.${lang}.${key}`, lang, MAX.featureName));
    }
    assert.equal(new Set(Object.values(NAMES[lang])).size, Object.keys(NAMES.en).length);
  }
  assert.deepEqual(found, []);
});

/** The heading outline of a Markdown document: one "#" string per heading. */
const outline = (doc) =>
  doc
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .filter((line) => /^#{1,4} /.test(line))
    .map((line) => line.match(/^#+/)[0]);

test('the four docs have the same sections', async () => {
  const docs = Object.fromEntries(
    await Promise.all(LANGS.map(async (lang) => [lang, await read(`../docs/${lang}.md`)])),
  );
  const reference = outline(docs.en);
  assert.ok(reference.filter((h) => h === '##').length >= 8, 'presentation to limits');
  for (const lang of LANGS) {
    assert.deepEqual(outline(docs[lang]), reference, `docs/${lang}.md`);
    assert.ok(docs[lang].length >= 300);
  }
  // The German doc says "du" too.
  const polite = docs.de.split('\n').filter((line) => POLITE_GERMAN.test(line));
  assert.deepEqual(polite, []);
});

test('the guard catches a missing language, an empty text and the polite German form', () => {
  assert.equal(problems({ en: 'Price', fr: 'Prix', de: 'Preis' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Price', fr: 'Prix', de: '', es: 'Precio' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of ['Wählen Sie', 'Ihr Gerät', 'Ihre IP', 'mit Ihrem', 'Ihren', 'Ihrer']) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  const forgotten = structuredClone(manifest);
  delete forgotten.scene_triggers[0].fields[0].label.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.scene_triggers[0].fields[0].label has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
  assert.deepEqual(outline('# A\n## B\n```\n## not a heading\n```\n### C'), ['#', '##', '###']);
});
