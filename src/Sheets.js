/**
 * Reading the Business sheet. Columns are addressed by their header names,
 * so reordering or adding columns does not break the script.
 */

/** Reads a tab into an array of objects keyed by header. Empty rows are skipped. */
function readRecords(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error('Tab "' + sheetName + '" not found.');
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var records = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(isBlank)) continue;
    var rec = { _row: i + 1 };
    headers.forEach(function (h, j) { if (h) rec[h] = row[j]; });
    records.push(rec);
  }
  return records;
}

/** Loads all tabs needed for validation. */
function loadContext() {
  var s = CONFIG.sheets;
  return {
    clients: readRecords(s.clients),
    rates: readRecords(s.rates),
    quotes: readRecords(s.quotes),
    purchaseOrders: readRecords(s.purchaseOrders),
    invoices: readRecords(s.invoices).filter(function (r) { return !isBlank(r.Number) || !isBlank(r.ID); }),
    expenses: readRecords(s.expenses),
    timeTracking: readRecords(s.timeTracking)
  };
}

function validationOptions() {
  return { vatRate: CONFIG.vatRate, hoursPerDay: CONFIG.hoursPerDay, moneyTolerance: CONFIG.moneyTolerance };
}

function findInvoice(ctx, invoiceId) {
  var inv = ctx.invoices.find(function (r) { return normKey(r.ID) === invoiceId; });
  if (!inv) throw new Error('Invoice "' + invoiceId + '" not found in the Invoices tab.');
  return inv;
}

function findClient(ctx, clientName) {
  return ctx.clients.find(function (c) { return normKey(c.Client) === clientName; });
}
