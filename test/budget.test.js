const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

const own = { id: 'C', amount: 'F', invoiced: 'G' };
const inv = { sheet: 'Invoices', po: 'G', amount: 'N', expenses: 'M' };

test('the PO budget formulas sum the invoices of the PO over the Invoices tab', () => {
  const f = g.poBudgetFormulas(5, own, inv);
  assert.equal(
    f.invoiced,
    '=IF($C5="","",SUMIFS(\'Invoices\'!N:N,\'Invoices\'!G:G,$C5)-SUMIFS(\'Invoices\'!M:M,\'Invoices\'!G:G,$C5))'
  );
  assert.equal(f.remaining, '=IF($C5="","",SUMIFS($F:$F,$C:$C,$C5)-$G5)');
});

test('the remaining budget rule is optional and highlights negative amounts', () => {
  const rule = g.relationRules().find((r) => r.column === 'Remaining');
  assert.equal(rule.sheet, 'Purchase orders');
  assert.equal(rule.optional, true);
  const cols = { ID: 3, Amount: 6, Invoiced: 7, Remaining: 8 };
  assert.equal(g.resolveRuleFormula(rule.formula, cols, {}), 'AND(ISNUMBER($H2),$H2<-0.005)');
  assert.equal(g.ruleApplies(rule, { ID: 3, Amount: 6 }, {}), false);
});
