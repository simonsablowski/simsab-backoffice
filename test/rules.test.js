const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

const columnsBySheet = {
  Clients: { Client: 1, Tier: 2, Status: 3, Address: 4 },
  Quotes: { Number: 1, 'Issue date': 2, 'Expiry date': 3, Client: 4, ID: 5, Assignment: 6 },
  'Purchase orders': { Date: 1, Client: 2, ID: 3, Assignment: 4, Quote: 5, Amount: 6 },
  Invoices: { Number: 1, Date: 2, Period: 3, Client: 4, Assignment: 5, Quote: 6, PO: 7, ID: 8, Paid: 9, 'Due date': 10 },
  'Time tracking': { Date: 1, Client: 2, Hours: 3, Rate: 4, Revenue: 5, Description: 6, Invoice: 7 },
  Expenses: { Date: 1, Client: 2, Cost: 3, Description: 4, Invoice: 5 }
};

test('columnLetter converts column numbers', () => {
  assert.equal(g.columnLetter(1), 'A');
  assert.equal(g.columnLetter(26), 'Z');
  assert.equal(g.columnLetter(27), 'AA');
});

test('rule formulas resolve to the expected columns', () => {
  const rules = g.relationRules();
  const po = rules.find((r) => r.sheet === 'Invoices' && r.column === 'PO');
  assert.equal(
    g.resolveRuleFormula(po.formula, columnsBySheet.Invoices, columnsBySheet),
    'COUNTIFS(INDIRECT("\'Purchase orders\'!C:C"),$G2,INDIRECT("\'Purchase orders\'!E:E"),$F2,INDIRECT("\'Purchase orders\'!B:B"),$D2)=0'
  );
  const id = rules.find((r) => r.sheet === 'Invoices' && r.column === 'ID');
  assert.equal(
    g.resolveRuleFormula(id.formula, columnsBySheet.Invoices, columnsBySheet),
    '$H2<>YEAR($B2)&"-A"&TEXT($A2,"00")&"-"&IFERROR(REGEXEXTRACT($F2,"A\\d+$"),"")'
  );
});

test('every rule resolves against the Business sheet layout', () => {
  for (const rule of g.relationRules()) {
    assert.doesNotThrow(() => g.resolveRuleFormula(rule.formula, columnsBySheet[rule.sheet], columnsBySheet), rule.note);
  }
});

test('the overdue rule needs the due date and paid columns and is skipped without them', () => {
  const rule = g.relationRules().find((r) => r.column === 'Due date');
  assert.equal(rule.style, 'overdue');
  assert.equal(
    g.resolveRuleFormula(rule.formula, columnsBySheet.Invoices, columnsBySheet),
    'AND(ISNUMBER($J2),$J2<TODAY(),$I2="")'
  );
  assert.equal(g.ruleApplies(rule, columnsBySheet.Invoices, columnsBySheet), true);
  const withoutPaid = Object.assign({}, columnsBySheet.Invoices);
  delete withoutPaid.Paid;
  assert.equal(g.ruleApplies(rule, withoutPaid, columnsBySheet), false);
  // rules that are not optional still report a missing column
  const client = g.relationRules().find((r) => r.sheet === 'Invoices' && r.column === 'Client');
  assert.equal(g.ruleApplies(client, {}, columnsBySheet), true);
});
