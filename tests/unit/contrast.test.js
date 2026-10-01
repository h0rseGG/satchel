// Text colours pass WCAG AA (4.5:1) on every background they're used on (SPEC 5.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../css/tokens.css', import.meta.url), 'utf8');
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(token(a)), lum(token(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS = [
  ['ink', ['paper', 'paper-alt', 'highlight', 'wash-ok', 'wash-warn', 'wash-err']],
  ['ink-muted', ['paper', 'paper-alt']],
  ['red', ['paper', 'paper-alt']],
  ['green', ['paper', 'paper-alt']],
  ['paper', ['ink', 'red']], // primary and danger-fill buttons
];

for (const [fg, bgs] of PAIRS) {
  for (const bg of bgs) {
    test(`${fg} on ${bg} >= 4.5:1`, () => {
      const r = ratio(fg, bg);
      assert.ok(r >= 4.5, `${r.toFixed(2)}:1`);
    });
  }
}
