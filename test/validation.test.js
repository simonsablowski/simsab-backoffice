const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();
const opts = { vatRate: 0.19, hoursPerDay: 8, moneyTolerance: 0.01 };
const d = (y, m, day) => new Date(y, m - 1, day);

function invoice(overrides) {
  const base = {
    Number: 2, Date: d(2026, 9, 30), Period: d(2026, 9, 1), Client: 'Acme', Assignment: 'Coaching',
    Quote: '2026-A10', PO: 4711, ID: '2026-A02-A10', 'Daily rate': 800, 'Number of days': 2, Expenses: 0,
    Amount: 1600, Tax: 304, 'Amount with tax': 1904, Paid: ''
  };
  return Object.assign(base, overrides);
}

function context(inv, extra) {
  const ctx = {
    clients: [{ Client: 'Acme', Tier: '2', Status: 'Active', Address: 'Acme GmbH\nStraße 1\n10000 Berlin' }],
    rates: [{ Tier: '2', Activity: 'Coaching', Rate: 100 }, { Tier: '2', Activity: 'Training', Rate: 150 }],
    quotes: [{ Number: 10, 'Issue date': d(2026, 1, 10), Client: 'Acme', ID: '2026-A10' }],
    purchaseOrders: [{ Client: 'Acme', ID: 4711, Quote: '2026-A10', Amount: 5000 }],
    invoices: [
      { Number: 1, Date: d(2026, 8, 31), Client: 'Acme', Quote: '2026-A10', PO: 4711, ID: '2026-A01-A10', 'Daily rate': 800, 'Number of days': 3 },
      inv
    ],
    expenses: [],
    timeTracking: [
      { Date: d(2026, 9, 3), Client: 'Acme', Hours: 8, Rate: 100, Invoice: '2026-A02-A10' },
      { Date: d(2026, 9, 17), Client: 'Acme', Hours: 6, Rate: 100, Invoice: '2026-A02-A10' }
    ]
  };
  return Object.assign(ctx, extra || {});
}

test('a consistent invoice has no errors or warnings', () => {
  const inv = invoice();
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.deepEqual([...r.errors], []);
  assert.deepEqual([...r.warnings], []);
  assert.equal(r.facts.trackedHours, 14);
  assert.equal(r.facts.suggestedDays, 1.75);
  assert.equal(r.facts.poRemaining, 5000 - 2400 - 1600);
});

test('wrong ID, duplicate number and missing references are errors', () => {
  const inv = invoice({ ID: '2026-A02-A11', Number: 1, Quote: '2026-A99', PO: 1234, Client: 'Nobody' });
  const r = g.validateInvoice(inv, context(inv), opts);
  const text = r.errors.join('\n');
  assert.match(text, /date, number and quote give "2026-A01-A99"/);
  assert.match(text, /Invoice number 1 is used/);
  assert.match(text, /Client "Nobody" is not listed/);
  assert.match(text, /Quote "2026-A99" is not listed/);
  assert.match(text, /PO "1234" is not listed/);
});

test('totals in the row must follow from rate, days and expenses', () => {
  const inv = invoice({ Amount: 1700 });
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.match(r.errors.join('\n'), /"Amount" is 1700, expected €1.600,00/);
});

test('billing fewer days than the tracked time rounded up is a warning', () => {
  const inv = invoice({ 'Number of days': 1.5, Amount: 1200, Tax: 228, 'Amount with tax': 1428 });
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.match(r.warnings.join('\n'), /Billed days \(1.5\) are fewer than the tracked time rounded up \(1.75\)/);
});

test('billing more days than tracked is allowed (margin for coordination)', () => {
  const inv = invoice({ 'Number of days': 3, Amount: 2400, Tax: 456, 'Amount with tax': 2856 });
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.equal(r.warnings.filter((w) => /Billed days/.test(w)).length, 0);
});

test('PO budget overrun is a warning', () => {
  const inv = invoice({ 'Number of days': 5, Amount: 4000, Tax: 760, 'Amount with tax': 4760 });
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.match(r.warnings.join('\n'), /PO 4711 is exceeded/);
});

test('rates outside the client tier are a warning', () => {
  const inv = invoice({ 'Daily rate': 900, Amount: 1800, Tax: 342, 'Amount with tax': 2142 });
  const r = g.validateInvoice(inv, context(inv), opts);
  assert.match(r.warnings.join('\n'), /does not match the tier rates/);
});

test('expenses may be invoiced gross or net, other amounts are a warning', () => {
  const expenses = [{ Cost: 119, Invoice: '2026-A02-A10' }, { Cost: 238, Invoice: '2026-A02-A10' }];
  const net = invoice({ Expenses: 300, Amount: 1900, Tax: 361, 'Amount with tax': 2261 });
  assert.equal(g.validateInvoice(net, context(net, { expenses }), opts).warnings.length, 0);
  const odd = invoice({ Expenses: 400, Amount: 2000, Tax: 380, 'Amount with tax': 2380 });
  assert.match(g.validateInvoice(odd, context(odd, { expenses }), opts).warnings.join('\n'), /Invoiced expenses are €400,00/);
});

test('unbilled time entries for the client are a warning', () => {
  const inv = invoice();
  const ctx = context(inv);
  ctx.timeTracking.push({ Date: d(2026, 9, 29), Client: 'Acme', Hours: 2, Rate: 100, Invoice: '' });
  assert.match(g.validateInvoice(inv, ctx, opts).warnings.join('\n'), /1 time entries for Acme \(2 h\) are not linked/);
});

test('proposedServicePeriod uses tracked dates, else the invoiced month', () => {
  const inv = invoice();
  assert.equal(g.proposedServicePeriod(context(inv), inv), '03.-17.09.2026');
  assert.equal(g.proposedServicePeriod(context(inv, { timeTracking: [] }), inv), '01.-30.09.2026');
});

test('suggestedDays rounds up to quarter days', () => {
  assert.equal(g.suggestedDays(13, 8), 1.75);
  assert.equal(g.suggestedDays(16, 8), 2);
  assert.equal(g.suggestedDays(16.5, 8), 2.25);
});

test('proposedServicePeriod ignores preparation in earlier months', () => {
  const inv = invoice();
  const ctx = context(inv);
  ctx.timeTracking.push({ Date: d(2026, 7, 2), Client: 'Acme', Hours: 1, Rate: 100, Invoice: '2026-A02-A10' });
  assert.equal(g.proposedServicePeriod(ctx, inv), '03.-17.09.2026');
});
