/**
 * Dropdowns that only list values which fit the row: the quotes and POs of the
 * selected client in the Invoices tab, the quotes of the selected client in the
 * Purchase orders tab.
 *
 * The lists are data validation of the single cells, set while editing (and for
 * all rows on request). A value that is not in the list is still accepted and
 * only marked with the warning of the sheet, so unusual cases stay possible.
 */

/** IDs of the quotes of a client, newest (last in the tab) first. */
function quotesOfClient(quotes, clientName) {
  var ids = [];
  quotes.forEach(function (q) {
    var id = normKey(q.ID);
    if (id !== '' && normKey(q.Client) === clientName && ids.indexOf(id) === -1) ids.push(id);
  });
  return ids.reverse();
}

/**
 * IDs of the POs of a client. When a quote is chosen and the client has POs
 * for it, only those are listed.
 */
function posOfClient(purchaseOrders, clientName, quoteKey) {
  var own = purchaseOrders.filter(function (p) { return !isBlank(p.ID) && normKey(p.Client) === clientName; });
  var forQuote = quoteKey === '' ? [] : own.filter(function (p) { return normKey(p.Quote) === quoteKey; });
  var ids = [];
  (forQuote.length > 0 ? forQuote : own).forEach(function (p) {
    var id = normKey(p.ID);
    if (ids.indexOf(id) === -1) ids.push(id);
  });
  return ids.reverse();
}

/** Sets the list of a cell; without options the cell keeps no restriction. */
function setListValidation(cell, options) {
  if (!options || options.length === 0) {
    cell.clearDataValidations();
    return;
  }
  cell.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(true)
    .setHelpText('The list shows the entries of the chosen client.')
    .build());
}

function dropdownContext() {
  return {
    quotes: readRecords(CONFIG.sheets.quotes),
    purchaseOrders: readRecords(CONFIG.sheets.purchaseOrders)
  };
}

/** Limits the Quote and PO cells of one invoice row to the entries of its client. */
function applyInvoiceRowDropdowns(sheet, row, ctx) {
  var data = ctx || dropdownContext();
  var r = rowAccess(sheet, row);
  var client = normKey(r.get('Client'));
  var quote = normKey(r.get('Quote'));
  if (r.cols.Quote) setListValidation(sheet.getRange(row, r.cols.Quote), client ? quotesOfClient(data.quotes, client) : null);
  if (r.cols.PO) setListValidation(sheet.getRange(row, r.cols.PO), client ? posOfClient(data.purchaseOrders, client, quote) : null);
}

/** Limits the Quote cell of one purchase order row to the quotes of its client. */
function applyPurchaseOrderRowDropdowns(sheet, row, ctx) {
  var data = ctx || dropdownContext();
  var r = rowAccess(sheet, row);
  var client = normKey(r.get('Client'));
  if (r.cols.Quote) setListValidation(sheet.getRange(row, r.cols.Quote), client ? quotesOfClient(data.quotes, client) : null);
}

/** Applies the limits to every row of the Invoices and Purchase orders tabs. Returns the number of rows. */
function installDropdowns() {
  var ss = businessSpreadsheet();
  var data = dropdownContext();
  var rows = 0;
  [
    [CONFIG.sheets.invoices, applyInvoiceRowDropdowns],
    [CONFIG.sheets.purchaseOrders, applyPurchaseOrderRowDropdowns]
  ].forEach(function (pair) {
    var sheet = ss.getSheetByName(pair[0]);
    if (!sheet) return;
    var cols = headerMap(sheet);
    var last = sheet.getLastRow();
    if (!cols.Client || last < 2) return;
    var clients = sheet.getRange(2, cols.Client, last - 1, 1).getValues();
    clients.forEach(function (cell, i) {
      if (isBlank(cell[0])) return;
      pair[1](sheet, i + 2, data);
      rows++;
    });
  });
  return rows;
}

function showInstallDropdowns() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Limit dropdowns to matching values',
    'In the Invoices tab the Quote and PO cells then list only the entries of the chosen client, and in the Purchase orders tab ' +
    'the Quote cell lists only the quotes of the client. Other values can still be typed; they are marked with a warning. ' +
    'The lists are updated while you edit. Apply them to all existing rows now?', ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  ui.alert('Dropdowns limited in ' + installDropdowns() + ' rows.');
}

function installDropdownsFromWeb() {
  return installDropdowns();
}
