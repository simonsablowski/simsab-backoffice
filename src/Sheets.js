/**
 * Reading the Business sheet. Columns are addressed by their header names,
 * so reordering or adding columns does not break the script.
 */

/**
 * The Business spreadsheet. In the sheet the script uses the spreadsheet it is
 * bound to; in the web app it falls back to the ID stored when the sheet was
 * last opened, or entered on the settings page.
 */
function businessSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = PropertiesService.getScriptProperties().getProperty(CONFIG.propertyKeys.businessId);
  if (!id) throw new Error('The Business sheet is not configured yet. Open Settings and paste its link.');
  return SpreadsheetApp.openById(id);
}

/** Remembers the ID of the bound spreadsheet for the web app. */
function rememberBusinessSpreadsheet() {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(CONFIG.propertyKeys.businessId) !== active.getId()) {
    props.setProperty(CONFIG.propertyKeys.businessId, active.getId());
  }
}

/** Reads a tab into an array of objects keyed by header. Empty rows are skipped. */
function readRecords(sheetName) {
  var sheet = businessSpreadsheet().getSheetByName(sheetName);
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
