const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPure } = require('./load');

const g = loadPure();

const quotes = [
  { ID: '2026-A01', Client: 'Acme' },
  { ID: '2026-A02', Client: 'Other' },
  { ID: '2026-A03', Client: 'Acme' },
  { ID: '2026-A03', Client: 'Acme' },
  { ID: '', Client: 'Acme' }
];
const purchaseOrders = [
  { ID: 11, Client: 'Acme', Quote: '2026-A01' },
  { ID: 12, Client: 'Acme', Quote: '2026-A03' },
  { ID: 13, Client: 'Other', Quote: '2026-A02' },
  { ID: 14, Client: 'Acme', Quote: '2026-A03' }
];

test('quotesOfClient lists the quotes of the client once, newest first', () => {
  assert.deepEqual([...g.quotesOfClient(quotes, 'Acme')], ['2026-A03', '2026-A01']);
  assert.deepEqual([...g.quotesOfClient(quotes, 'Other')], ['2026-A02']);
  assert.deepEqual([...g.quotesOfClient(quotes, 'Nobody')], []);
});

test('posOfClient lists the POs of the client, narrowed to the quote when there are POs for it', () => {
  assert.deepEqual([...g.posOfClient(purchaseOrders, 'Acme', '')], ['14', '12', '11']);
  assert.deepEqual([...g.posOfClient(purchaseOrders, 'Acme', '2026-A03')], ['14', '12']);
  // a quote without a PO of the client does not empty the list
  assert.deepEqual([...g.posOfClient(purchaseOrders, 'Acme', '2026-A99')], ['14', '12', '11']);
  assert.deepEqual([...g.posOfClient(purchaseOrders, 'Other', '2026-A01')], ['13']);
  assert.deepEqual([...g.posOfClient(purchaseOrders, 'Nobody', '')], []);
});
