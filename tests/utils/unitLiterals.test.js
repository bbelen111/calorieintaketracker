/**
 * Guard: unit text comes only from `utils/units`. A hard-coded "kg" or "kcal" in
 * a screen or builder shows the wrong unit to anyone who changed the setting, so
 * every literal that names a convertible unit has to be listed here with a
 * reason.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from '@babel/core';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SCANNED = ['src/components', 'src/utils'];
// The formatter is where unit text is written.
const SKIPPED_FOLDERS = ['src/utils/units'];

// A unit named as a word. `g/kg` and `mL/kg/min` are never converted, so a unit
// that follows a slash is ignored. A bare `g` is left out: macros stay in grams.
const UNIT_WORD =
  /(?<![\w\-./])(?:kcal|kJ|kg|lbs?|cm|km|oz|mi|ft|cal)(?![\w\-])|per 100 ?g\b/;

// Everything allowed to name a unit, one entry per literal.
const SI_BREAKDOWN =
  'src/components/EnergyMap/modals/info/CalorieBreakdownModal.jsx';
const ALLOWED = {
  // Equations defined in kg, m and kcal; converted values are appended.
  'src/components/EnergyMap/modals/info/BmiInfoModal.jsx': [
    'BMI = weight (kg) ÷ height (m)²',
  ],
  'src/components/EnergyMap/modals/info/FfmiInfoModal.jsx': [
    'FFMI = lean mass (kg) ÷ height (m)²',
  ],
  // The last one is the stride length shown to miles users.
  [SI_BREAKDOWN]: ['kcal (', 'kcal', 'kg', 'kg', 'ft'],
  // The ounce food unit itself, offered whatever the preference.
  'src/components/EnergyMap/modals/pickers/FoodPortionModal.jsx': ['oz'],
  // The kcal field and its label; kJ users get their own picker.
  'src/utils/food/nutrientPicker.js': ['kcal', 'kcal'],
};

const listSourceFiles = (folder) =>
  readdirSync(join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = `${folder}/${entry.name}`;
    if (entry.isDirectory()) {
      return SKIPPED_FOLDERS.includes(path) ? [] : listSourceFiles(path);
    }
    return /\.jsx?$/.test(entry.name) && !/\.spec\.jsx?$/.test(entry.name)
      ? [path]
      : [];
  });

// Text a user could read: string literals, template text and JSX text.
const readableText = (node) => {
  if (node.type === 'JSXText' || node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'TemplateElement') return node.value.cooked ?? '';
  return '';
};

// `unit === 'kJ'` and `case 'kg':` test a preference; they show nothing.
const isComparison = (node, parent) =>
  (parent?.type === 'BinaryExpression' && /^[!=]==?$/.test(parent.operator)) ||
  (parent?.type === 'SwitchCase' && parent.test === node);

const collectLiterals = (node, parent, found) => {
  if (Array.isArray(node)) {
    node.forEach((child) => collectLiterals(child, parent, found));
    return found;
  }
  if (!node || typeof node.type !== 'string') return found;
  if (node.type === 'ImportDeclaration') return found;

  const text = readableText(node).replace(/\s+/g, ' ').trim();
  if (text && UNIT_WORD.test(text) && !isComparison(node, parent)) {
    found.push(text);
  }

  Object.entries(node).forEach(([key, child]) => {
    if (key !== 'loc' && child && typeof child === 'object') {
      collectLiterals(child, node, found);
    }
  });
  return found;
};

const findUnitLiterals = (path) => {
  const source = readFileSync(join(ROOT, path), 'utf8');
  const ast = parseSync(source, {
    filename: path,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['jsx'] },
  });
  return collectLiterals(ast.program, null, []);
};

const describeLiterals = (literalsByPath) =>
  literalsByPath
    .flatMap(([path, literals]) => literals.map((text) => `${path}  ${text}`))
    .sort();

test('screens and builders do not hard-code unit text', () => {
  const found = SCANNED.flatMap(listSourceFiles).map((path) => [
    path,
    findUnitLiterals(path),
  ]);

  assert.deepEqual(
    describeLiterals(found),
    describeLiterals(Object.entries(ALLOWED))
  );
});
