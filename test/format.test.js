const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

test('expectedInvoiceId combines year, invoice number and quote suffix', () => {
  assert.equal(g.expectedInvoiceId(new Date(2026, 2, 31), 12, '2026-A05'), '2026-A12-A05');
  assert.equal(g.expectedInvoiceId(new Date(2026, 0, 31), 1, '2026-A03'), '2026-A01-A03');
  assert.equal(g.expectedInvoiceId(new Date(2027, 0, 31), 15, '2026-A09'), '2027-A15-A09');
});

test('formatServicePeriod follows the invoice style', () => {
  assert.equal(g.formatServicePeriod(new Date(2026, 2, 16), new Date(2026, 2, 16)), '16.03.2026');
  assert.equal(g.formatServicePeriod(new Date(2026, 2, 15), new Date(2026, 2, 16)), '15.-16.03.2026');
  assert.equal(g.formatServicePeriod(new Date(2026, 2, 29), new Date(2026, 3, 2)), '29.03.-02.04.2026');
  assert.equal(g.formatServicePeriod(new Date(2025, 11, 30), new Date(2026, 0, 2)), '30.12.2025-02.01.2026');
});

test('monthBounds returns first and last day', () => {
  const m = g.monthBounds(new Date(2026, 1, 14));
  assert.equal(g.formatDate(m.start), '01.02.2026');
  assert.equal(g.formatDate(m.end), '28.02.2026');
});

test('invoiceFileName removes characters Drive handles badly', () => {
  assert.equal(
    g.invoiceFileName('2026-A12-A05', 'Acme', 'Leadership Training'),
    'Invoice 2026-A12-A05 - Acme - Leadership Training'
  );
  assert.equal(g.invoiceFileName('2026-A01-A02', 'A/B', 'X: Y'), 'Invoice 2026-A01-A02 - A-B - X- Y');
});

test('formatEuro uses German separators', () => {
  assert.equal(g.formatEuro(1234.5), '€1.234,50');
  assert.equal(g.formatEuro(98765), '€98.765,00');
  assert.equal(g.formatEuro(0.5), '€0,50');
});

test('normKey turns PO numbers stored as floats into stable keys', () => {
  assert.equal(g.normKey(1234567890.0), '1234567890');
  assert.equal(g.normKey(' 2026-A05 '), '2026-A05');
  assert.equal(g.normKey(null), '');
});
