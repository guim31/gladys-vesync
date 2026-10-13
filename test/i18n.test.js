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
import { AIR_QUALITY, MESSAGES, MODE_LABELS, NAMES, TEXT } from '../src/i18n.js';
import { MODELS, modeKeys } from '../src/vesync/models.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const LANGS = ['en', 'fr', 'de', 'es'];
const POLITE_GERMAN = /(?<!\p{L})(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?!\p{L})/u;
// The informal Spanish forms ("tu", "puedes"...) — the integration says "usted".
const INFORMAL_SPANISH = /(?<!\p{L})(tú|tu|tus|puedes|elige|introduce|añade|pulsa)(?!\p{L})/iu;

// Upper bounds, in characters: what the Gladys interface shows without cutting.
const MAX = {
  catalog: 100,
  widgetLabel: 30,
  label: 60,
  placeholder: 60,
  description: 300,
  message: 200,
  short: 24,
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
  if (lang === 'es' && INFORMAL_SPANISH.test(text)) {
    found.push(`${path} uses the informal form: "${text}"`);
  }
  return found;
}

/** Every multi-language object of the manifest, with its length limit. */
function manifestTexts(root) {
  const texts = [];
  const walk = (value, path, key) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, key));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const isText =
      ['label', 'description', 'placeholder'].includes(key) ||
      Object.keys(value).some((child) => LANGS.includes(child));
    if (isText) {
      // The store schema caps the catalog and widget descriptions, and widget labels.
      const max =
        path === 'manifest.description' || /^manifest\.widgets\[\d+\]\.description$/.test(path)
          ? MAX.catalog
          : /^manifest\.widgets\[\d+\]\.label$/.test(path)
            ? MAX.widgetLabel
            : (MAX[key] ?? MAX.label);
      texts.push({ path, value, max });
      return;
    }
    for (const [child, item] of Object.entries(value)) {
      walk(item, `${path}.${child}`, child);
    }
  };
  walk(root, 'manifest', null);
  return texts;
}

// Tables written one language at a time: same keys everywhere, no empty text.
function tableProblems(table, name, max) {
  const found = [];
  if (JSON.stringify(sorted(Object.keys(table))) !== JSON.stringify(sorted(LANGS))) {
    found.push(`${name} has [${Object.keys(table)}], expected exactly [${LANGS}]`);
  }
  for (const lang of LANGS) {
    const entries = table[lang] ?? {};
    if (
      JSON.stringify(sorted(Object.keys(entries))) !== JSON.stringify(sorted(Object.keys(table.en)))
    ) {
      found.push(`${name}.${lang} does not have the keys of ${name}.en`);
    }
    for (const [key, value] of Object.entries(entries)) {
      found.push(...textProblems(value, `${name}.${lang}.${key}`, lang, max));
    }
  }
  return found;
}

test('the configuration offers the four languages, French by default', () => {
  assert.deepEqual(LANGUAGES, LANGS);
  const field = manifest.config_schema.find((item) => item.key === 'language');
  assert.deepEqual(
    field.options.map((option) => option.value),
    LANGS,
  );
  assert.equal(field.default, 'fr');
});

test('every text of the manifest is in English, French, German and Spanish', () => {
  const texts = manifestTexts(manifest);
  assert.ok(texts.length >= 30, `only ${texts.length} texts found in the manifest`);
  const found = texts.flatMap(({ path, value, max }) => problems(value, path, max));
  assert.deepEqual(found, []);
});

test('the catalog description holds 10 characters at least in every language', () => {
  for (const lang of LANGS) {
    assert.ok(manifest.description[lang].length >= 10, `description.${lang} is too short`);
  }
});

test('the feature names and the mode labels exist in every language', () => {
  assert.deepEqual(tableProblems(NAMES, 'NAMES', MAX.featureName), []);
  assert.deepEqual(tableProblems(MODE_LABELS, 'MODE_LABELS', MAX.short), []);
  // Every mode a model offers has a label.
  for (const model of MODELS) {
    if (model.kind === 'outlet') {
      continue;
    }
    for (const key of modeKeys(model)) {
      assert.ok(MODE_LABELS.en[key], `${model.name}: mode "${key}" has no label`);
    }
  }
});

test('every message of the code has the four languages', () => {
  const found = [
    ...Object.entries(TEXT).flatMap(([key, value]) => problems(value, `TEXT.${key}`, MAX.message)),
    ...Object.entries(AIR_QUALITY).flatMap(([key, value]) =>
      problems(value, `AIR_QUALITY.${key}`, MAX.short),
    ),
    ...Object.entries(MESSAGES).flatMap(([key, build]) => {
      const sample =
        key === 'connected' ? build({ total: 9, supported: 7, region: 'eu' }) : build('a reason');
      return problems(sample, `MESSAGES.${key}`, MAX.message);
    }),
  ];
  assert.deepEqual(found, []);
});

test('the guard catches a missing language, an empty text and the wrong forms', () => {
  assert.equal(problems({ en: 'Air', fr: 'Air', de: 'Luft' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'Air', fr: 'Air', de: '', es: 'Aire' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a', es: 'a', it: 'a' }, 'x', 60).length, 1);
  assert.equal(problems({ en: 'a', fr: 'a', de: 'a'.repeat(61), es: 'a' }, 'x', 60).length, 1);
  for (const polite of [
    'Wählen Sie',
    'Ihr Gerät',
    'Ihre E-Mail',
    'mit Ihrem',
    'Ihren',
    'Ihrer',
    'Ihres',
  ]) {
    assert.equal(problems({ en: 'a', fr: 'a', de: polite, es: 'a' }, 'x', 60).length, 1, polite);
  }
  assert.equal(
    problems({ en: 'a', fr: 'a', de: 'a', es: 'Introduce tu correo' }, 'x', 60).length,
    1,
  );
  // Words that only contain the letters stay allowed.
  assert.deepEqual(
    problems({ en: 'a', fr: 'a', de: 'Siebenschläfer, ihre', es: 'a' }, 'x', 60),
    [],
  );
  // A manifest text forgotten in German is found.
  const forgotten = structuredClone(manifest);
  delete forgotten.config_schema[1].placeholder.de;
  const found = manifestTexts(forgotten).flatMap(({ path, value, max }) =>
    problems(value, path, max),
  );
  assert.deepEqual(found, [
    'manifest.config_schema[1].placeholder has [en,fr,es], expected exactly [en,fr,de,es]',
  ]);
});

// --- Documentation -----------------------------------------------------------

const docs = Object.fromEntries(
  await Promise.all(
    LANGS.map(async (lang) => [
      lang,
      await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8'),
    ]),
  ),
);

/** The `##` headings of a document, and how many `###` each holds. */
function outline(markdown) {
  const sections = [];
  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      sections.push({ title: line.slice(3), subsections: 0 });
    } else if (line.startsWith('### ') && sections.length > 0) {
      sections.at(-1).subsections += 1;
    }
  }
  return sections;
}

test('the four documentations have the same sections', () => {
  const reference = outline(docs.en);
  assert.ok(reference.length >= 8, `docs/en.md has only ${reference.length} sections`);
  for (const lang of LANGS) {
    const sections = outline(docs[lang]);
    assert.equal(sections.length, reference.length, `docs/${lang}.md: number of sections`);
    assert.deepEqual(
      sections.map((section) => section.subsections),
      reference.map((section) => section.subsections),
      `docs/${lang}.md: number of subsections per section`,
    );
    assert.ok(docs[lang].length >= 3000, `docs/${lang}.md is too short`);
  }
});

test('the documentation says the hardware was not available, and the brands are not affiliated', () => {
  const patterns = {
    en: [/without the hardware/i, /not affiliated with VeSync, Levoit or Etekcity/i],
    fr: [/sans le matériel/i, /sans lien avec VeSync, Levoit ou Etekcity/i],
    de: [/ohne die Hardware/i, /nicht mit VeSync, Levoit oder Etekcity verbunden/i],
    es: [/sin el hardware/i, /sin relación con VeSync, Levoit ni Etekcity/i],
  };
  for (const [lang, list] of Object.entries(patterns)) {
    for (const pattern of list) {
      assert.match(docs[lang], pattern, `docs/${lang}.md`);
    }
  }
  for (const lang of ['de']) {
    assert.ok(!POLITE_GERMAN.test(docs[lang]), 'docs/de.md uses the polite form');
  }
});
