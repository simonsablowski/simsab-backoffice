const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();
const opts = { vatRate: 0.19, moneyTolerance: 0.01, today: new Date(2026, 9, 24) };
const d = (y, m, day) => new Date(y, m - 1, day);

function quote(overrides) {
  return Object.assign({
    Number: 5, 'Issue date': d(2026, 10, 1), 'Expiry date': d(2026, 11, 1), Client: 'Acme', ID: '2026-A05',
    Assignment: 'Coaching', Amount: 1000, Tax: 190, 'Amount with tax': 1190
  }, overrides);
}

function context(q, extra) {
  return Object.assign({
    clients: [{ Client: 'Acme', Address: 'Acme GmbH\nStraße 1' }],
    quotes: [{ Number: 4, ID: '2026-A04', Client: 'Acme' }, q],
    purchaseOrders: []
  }, extra || {});
}

test('expectedQuoteId and quoteFileName', () => {
  assert.equal(g.expectedQuoteId(d(2026, 10, 1), 5), '2026-A05');
  assert.equal(g.quoteFileName('2026-A05', 'Acme', 'Coaching: Q4/2026'), 'Quote 2026-A05 - Acme - Coaching- Q4-2026');
});

test('a consistent quote has no errors or warnings', () => {
  const q = quote();
  const r = g.validateQuote(q, context(q), opts);
  assert.deepEqual([...r.errors], []);
  assert.deepEqual([...r.warnings], []);
  assert.equal(r.facts.total, 1190);
});

test('missing fields, wrong ID, duplicate number and unknown client are errors', () => {
  const q = quote({ ID: '2026-A09', Number: 4, Client: 'Nobody', Assignment: '' });
  const r = g.validateQuote(q, context(q), opts);
  const text = r.errors.join('\n');
  assert.match(text, /Field "Assignment" is empty/);
  assert.match(text, /ID is "2026-A09", but issue date and number give "2026-A04"/);
  assert.match(text, /Quote number 4 is used by another quote/);
  assert.match(text, /Client "Nobody" is not listed/);
});

test('client without address, wrong totals and expiry before issue are errors', () => {
  const q = quote({ Tax: 100, 'Expiry date': d(2026, 9, 1) });
  const r = g.validateQuote(q, context(q, { clients: [{ Client: 'Acme', Address: '' }] }), opts);
  const text = r.errors.join('\n');
  assert.match(text, /has no address/);
  assert.match(text, /"Tax" is 100, expected €190,00/);
  assert.match(text, /expiry date is before the issue date/);
});

test('an expired quote is a warning, an existing PO is information', () => {
  const q = quote({ 'Expiry date': d(2026, 10, 10) });
  const r = g.validateQuote(q, context(q, { purchaseOrders: [{ ID: 1, Quote: '2026-A05' }] }), opts);
  assert.deepEqual([...r.errors], []);
  assert.match(r.warnings[0], /expired on 10\.10\.2026/);
  assert.deepEqual([...r.info], ['A PO already refers to this quote.']);
});
