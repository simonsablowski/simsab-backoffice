const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

test('estimateLines counts paragraphs and wrapped lines', () => {
  assert.equal(g.estimateLines('', 40), 1);
  assert.equal(g.estimateLines('Short line', 40), 1);
  assert.equal(g.estimateLines('a'.repeat(41), 40), 2);
  assert.equal(g.estimateLines('Line one\n\nLine three\n', 40), 3);
});

test('descriptionRowHeight scales with lines', () => {
  const layout = { charsPerLine: 40, lineHeightPx: 20, paddingPx: 6 };
  assert.equal(g.descriptionRowHeight('One', layout), 26);
  assert.equal(g.descriptionRowHeight('One\nTwo\nThree', layout), 66);
});

test('computeSpacerHeight keeps the total height constant', () => {
  // Template total 1000, after adding 60 px of content the spacer shrinks by 60.
  assert.deepEqual({ ...g.computeSpacerHeight(1000, 1060, 650, 10) }, { height: 590, overflowPx: 0 });
  // Removing the expenses row (21 px) makes the spacer grow.
  assert.deepEqual({ ...g.computeSpacerHeight(1000, 979, 650, 10) }, { height: 671, overflowPx: 0 });
});

test('computeSpacerHeight reports overflow', () => {
  assert.deepEqual({ ...g.computeSpacerHeight(1000, 1700, 650, 10) }, { height: 10, overflowPx: 60 });
});
