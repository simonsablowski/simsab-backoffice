const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

test('the due date is the invoice date plus the default terms without a terms column', () => {
  assert.equal(g.dueDateFormula('$C7', '$D7', { sheet: 'Clients', client: 'A', terms: '' }, 14), '=IF($C7="","",$C7+14)');
  assert.equal(g.dueDateFormula('$C7', '$D7', null, 30), '=IF($C7="","",$C7+30)');
});

test('the due date uses the payment terms of the client when the Clients tab has them', () => {
  const formula = g.dueDateFormula('$C7', '$D7', { sheet: 'Clients', client: 'A', terms: 'F' }, 14);
  assert.equal(
    formula,
    '=LET(t,IFERROR(INDEX(\'Clients\'!F:F,MATCH($D7,\'Clients\'!A:A,0)),""),IF($C7="","",$C7+IF(ISNUMBER(t),t,14)))'
  );
});
