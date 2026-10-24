const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();
const opts = { vatRate: 0.19, hoursPerDay: 8, moneyTolerance: 0.01, today: new Date(2026, 9, 31) };
const d = (y, m, day) => new Date(y, m - 1, day);

function context(extra) {
  return Object.assign({
    clients: [
      { Client: 'Acme', Tier: '2', Address: 'Acme GmbH' },
      { Client: 'Other', Tier: '3', Address: 'Other AG' }
    ],
    rates: [{ Tier: '2', Rate: 100 }, { Tier: '3', Rate: 90 }, { Tier: '3', Rate: 110 }],
    quotes: [{ ID: '2026-A10', Client: 'Acme', Assignment: 'Coaching' }],
    purchaseOrders: [
      { Client: 'Acme', ID: 4711, Quote: '2026-A10', Assignment: 'Coaching', Amount: 5000 },
      { Client: 'Other', ID: 99, Quote: '2026-A11', Assignment: 'Training', Amount: 1000 }
    ],
    invoices: [
      { _row: 2, Number: 1, Date: d(2026, 8, 31), Client: 'Acme', Quote: '2026-A10', PO: 4711, ID: '2026-A01-A10', 'Daily rate': 800, 'Number of days': 3 },
      { _row: 3, Number: 2, Date: d(2026, 9, 30), Client: 'Acme', Quote: '2026-A10', PO: 4711, ID: '2026-A02-A10', 'Daily rate': 820, 'Number of days': 1 }
    ],
    expenses: [
      { _row: 2, Date: d(2026, 10, 5), Client: 'Acme', Cost: 119, Invoice: '' },
      { _row: 3, Date: d(2026, 10, 6), Client: 'Acme', Cost: 59.5, Invoice: '' },
      { _row: 4, Date: d(2026, 9, 6), Client: 'Acme', Cost: 500, Invoice: '2026-A02-A10' }
    ],
    timeTracking: [
      { _row: 2, Date: d(2026, 10, 3), Client: 'Acme', Hours: 8, Invoice: '' },
      { _row: 3, Date: d(2026, 10, 17), Client: 'Acme', Hours: 6.5, Invoice: '' },
      { _row: 4, Date: d(2026, 9, 17), Client: 'Acme', Hours: 4, Invoice: '2026-A02-A10' },
      { _row: 5, Date: d(2026, 10, 17), Client: 'Other', Hours: 3, Invoice: '' }
    ]
  }, extra || {});
}

const input = { client: 'Acme', po: '4711', date: d(2026, 10, 31), from: null, to: null };

test('prepares the full row from client and PO', () => {
  const r = g.prepareInvoiceRow(context(), input, opts);
  assert.deepEqual([...r.errors], []);
  assert.equal(r.row.Number, 3);
  assert.equal(r.row.ID, '2026-A03-A10');
  assert.equal(r.row.Client, 'Acme');
  assert.equal(r.row.Quote, '2026-A10');
  assert.equal(r.row.PO, 4711);
  assert.equal(r.row.Assignment, 'Coaching');
  // 14.5 h are 1.8125 days, rounded up to 2 quarter days
  assert.equal(r.row['Number of days'], 2);
  assert.equal(r.row['Daily rate'], 820);
  // 178.50 gross is 150 net
  assert.equal(r.row.Expenses, 150);
  assert.deepEqual([...r.timeRows], [2, 3]);
  assert.deepEqual([...r.expenseRows], [2, 3]);
});

test('links only unbilled entries of the client within the chosen period', () => {
  const r = g.prepareInvoiceRow(context(), Object.assign({}, input, { from: d(2026, 10, 10), to: d(2026, 10, 31) }), opts);
  assert.deepEqual([...r.timeRows], [3]);
  assert.deepEqual([...r.expenseRows], []);
  assert.equal(r.row['Number of days'], 1);
  assert.equal(r.row.Expenses, 0);
});

test('the daily rate falls back to the tier and is left open when it is ambiguous', () => {
  const fresh = context({ invoices: [] });
  assert.equal(g.prepareInvoiceRow(fresh, input, opts).row['Daily rate'], 800);
  const ambiguous = g.prepareInvoiceRow(
    context({ invoices: [] }), { client: 'Other', po: '99', date: d(2026, 10, 31) }, opts);
  assert.equal(ambiguous.row['Daily rate'], '');
  assert.ok(ambiguous.warnings.some((w) => /daily rate/i.test(w)));
});

test('errors for missing, foreign or quoteless PO and unknown client', () => {
  const run = (i, extra) => g.prepareInvoiceRow(context(extra), Object.assign({}, input, i), opts);
  assert.ok(run({ client: 'Nobody' }).errors.length > 0);
  assert.ok(run({ po: '123' }).errors.length > 0);
  assert.match(run({ po: '99' }).errors[0], /belongs to "Other"/);
  const noQuote = run({}, { purchaseOrders: [{ Client: 'Acme', ID: 4711, Quote: '' }] });
  assert.match(noQuote.errors[0], /no quote/);
  assert.equal(noQuote.row, null);
});

test('warns without unbilled time and when the PO budget would be exceeded', () => {
  const none = g.prepareInvoiceRow(context({ timeTracking: [] }), input, opts);
  assert.equal(none.row['Number of days'], '');
  assert.ok(none.warnings.some((w) => /no unbilled time entries/i.test(w)));

  const small = context({ purchaseOrders: [{ Client: 'Acme', ID: 4711, Quote: '2026-A10', Amount: 4000 }] });
  const r = g.prepareInvoiceRow(small, input, opts);
  // 4000 - (800*3 + 820*1) - 820*2 = -860
  assert.equal(r.facts.poRemaining, -860);
  assert.ok(r.warnings.some((w) => /exceeded by/.test(w)));
});

test('latestDailyRate prefers the PO over the quote, then the highest number', () => {
  const invoices = [
    { _row: 2, Number: 1, PO: 1, Quote: 'Q', 'Daily rate': 700 },
    { _row: 3, Number: 5, PO: 2, Quote: 'Q', 'Daily rate': 900 },
    { _row: 4, Number: 4, PO: 1, Quote: 'Q', 'Daily rate': 750 }
  ];
  assert.equal(g.latestDailyRate(invoices, '1', 'Q', -1), 750);
  assert.equal(g.latestDailyRate(invoices, '9', 'Q', -1), 900);
  assert.equal(g.latestDailyRate(invoices, '1', 'Q', 4), 700);
  assert.ok(isNaN(g.latestDailyRate(invoices, '8', 'Z', -1)));
});

test('invoice formulas reference the cells of the row', () => {
  const ref = (h) => ({ Date: 'C7', Number: 'A7', Quote: 'H7', 'Daily rate': 'K7', 'Number of days': 'L7', Expenses: 'M7', Amount: 'N7' }[h]);
  assert.match(g.invoiceIdFormula(ref), /^=IF\(OR\(C7="",A7="",H7=""\),"",YEAR\(C7\)&"-A"&TEXT\(A7,"00"\)&"-"&REGEXEXTRACT\(H7,"A\\d\+\$"\)\)$/);
  const totals = g.invoiceTotalFormulas(ref);
  assert.equal(totals.Amount, '=K7*L7+M7');
  assert.equal(totals.Tax, '=N7*0.19');
  assert.equal(totals['Amount with tax'], '=N7*1.19');
});

test('parseIsoDate accepts valid dates only', () => {
  assert.equal(g.formatIsoDate(g.parseIsoDate('2026-10-31')), '2026-10-31');
  assert.equal(g.parseIsoDate('2026-02-30'), null);
  assert.equal(g.parseIsoDate('31.10.2026'), null);
  assert.equal(g.parseIsoDate(''), null);
});
