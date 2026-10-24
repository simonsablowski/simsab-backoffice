/**
 * Preparing a new row in the Invoices tab from a client and a PO. The values
 * are proposed first; the row is only written after confirmation, and it can
 * still be edited by hand afterwards. The pure logic is in Prepare.js.
 */

/** Clients and POs for the choice lists. */
function getPrepareOptions() {
  var ctx = loadContext();
  var clients = ctx.clients
    .filter(function (c) { return !isBlank(c.Client); })
    .map(function (c) { return normKey(c.Client); });
  var pos = ctx.purchaseOrders
    .filter(function (p) { return !isBlank(p.ID); })
    .map(function (p) {
      return { id: normKey(p.ID), client: normKey(p.Client), quote: normKey(p.Quote), assignment: normKey(p.Assignment) };
    });
  return { clients: clients, pos: pos, today: formatIsoDate(today()) };
}

function prepareInput(params) {
  return {
    client: params.client,
    po: params.po,
    date: parseIsoDate(params.date) || today(),
    from: parseIsoDate(params.from),
    to: parseIsoDate(params.to)
  };
}

function prepareOptions() {
  var options = validationOptions();
  options.today = today();
  return options;
}

/** The proposal as plain values for the dialog. */
function previewNewInvoiceRow(params) {
  var result = prepareInvoiceRow(loadContext(), prepareInput(params), prepareOptions());
  var row = result.row;
  return {
    errors: result.errors,
    warnings: result.warnings,
    info: result.info,
    fields: row ? [
      ['Invoice ID', row.ID],
      ['Date', formatDate(row.Date)],
      ['Client', normKey(row.Client)],
      ['Assignment', normKey(row.Assignment)],
      ['Quote · PO', normKey(row.Quote) + ' · ' + normKey(row.PO)],
      ['Days × rate', (row['Number of days'] === '' ? '?' : row['Number of days']) + ' × ' +
        (row['Daily rate'] === '' ? '?' : formatEuro(row['Daily rate']))],
      ['Expenses (net)', formatEuro(row.Expenses)],
      ['Linked entries', result.timeRows.length + ' time, ' + result.expenseRows.length + ' expenses']
    ] : []
  };
}

/** Row after the last invoice, so formatted empty rows below the data do not matter. */
function nextInvoiceRow(sheet) {
  var cols = headerMap(sheet);
  var last = 1;
  [cols.Number, cols.ID].forEach(function (col) {
    if (!col || sheet.getLastRow() < 2) return;
    var values = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
    for (var i = values.length - 1; i >= 0; i--) {
      if (!isBlank(values[i][0])) { last = Math.max(last, i + 2); break; }
    }
  });
  return last + 1;
}

function linkEntries(sheetName, rows, invoiceId) {
  if (rows.length === 0) return;
  var sheet = businessSpreadsheet().getSheetByName(sheetName);
  var col = headerMap(sheet).Invoice;
  if (!col) throw new Error('Tab "' + sheetName + '" has no "Invoice" column.');
  rows.forEach(function (row) { sheet.getRange(row, col).setValue(invoiceId); });
}

/** Writes the proposed row to the Invoices tab and links the time entries and expenses to it. */
function createNewInvoiceRow(params) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another change is in progress. Please try again in a moment.');
  try {
    var result = prepareInvoiceRow(loadContext(), prepareInput(params), prepareOptions());
    if (result.errors.length > 0) throw new Error(result.errors.join('\n'));

    var sheet = businessSpreadsheet().getSheetByName(CONFIG.sheets.invoices);
    var cols = headerMap(sheet);
    var target = nextInvoiceRow(sheet);
    var values = result.row;
    var ref = function (h) { return columnLetter(cols[h]) + target; };

    // Same look and validation as the row above.
    if (target > 2) {
      var width = sheet.getLastColumn();
      var source = sheet.getRange(target - 1, 1, 1, width);
      var destination = sheet.getRange(target, 1, 1, width);
      source.copyTo(destination, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      source.copyTo(destination, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    }

    ['Number', 'Date', 'Period', 'Client', 'Assignment', 'Quote', 'PO', 'Daily rate', 'Number of days', 'Expenses'].forEach(function (h) {
      if (cols[h] && values[h] !== '') sheet.getRange(target, cols[h]).setValue(values[h]);
    });
    if (cols.ID && cols.Date && cols.Number && cols.Quote) sheet.getRange(target, cols.ID).setFormula(invoiceIdFormula(ref));
    if (cols.Amount && cols['Daily rate'] && cols['Number of days'] && cols.Expenses) {
      var totals = invoiceTotalFormulas(ref);
      Object.keys(totals).forEach(function (h) { if (cols[h]) sheet.getRange(target, cols[h]).setFormula(totals[h]); });
    }

    var due = invoiceDueFormula(sheet, target, cols);
    if (due) sheet.getRange(target, cols[CONFIG.payment.dueColumn]).setFormula(due);

    linkEntries(CONFIG.sheets.timeTracking, result.timeRows, values.ID);
    linkEntries(CONFIG.sheets.expenses, result.expenseRows, values.ID);
    SpreadsheetApp.flush();

    return {
      id: values.ID,
      row: target,
      timeEntries: result.timeRows.length,
      expenses: result.expenseRows.length,
      warnings: result.warnings
    };
  } finally {
    lock.releaseLock();
  }
}
