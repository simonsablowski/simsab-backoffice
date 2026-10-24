/**
 * Payment tracking in the Invoices tab: a "Due date" column that is a formula
 * (invoice date plus payment terms), and highlighting of unpaid invoices past
 * the due date. Both are part of the sheet and work without the script; the
 * script only installs them and fills the formula into new rows.
 */

/**
 * Formula for the due date of an invoice row.
 * @param dateRef      cell with the invoice date, e.g. "$C7"
 * @param clientRef    cell with the client, e.g. "$D7"
 * @param clients      {sheet, client, terms} names and column letters of the Clients tab;
 *                     terms is empty when the Clients tab has no payment terms column
 * @param defaultDays  payment terms when the client has none
 */
function dueDateFormula(dateRef, clientRef, clients, defaultDays) {
  if (!clients || !clients.terms) return '=IF(' + dateRef + '="","",' + dateRef + '+' + defaultDays + ')';
  var sheet = "'" + clients.sheet + "'!";
  var lookup = 'IFERROR(INDEX(' + sheet + clients.terms + ':' + clients.terms + ',MATCH(' + clientRef + ',' +
    sheet + clients.client + ':' + clients.client + ',0)),"")';
  return '=LET(t,' + lookup + ',IF(' + dateRef + '="","",' + dateRef + '+IF(ISNUMBER(t),t,' + defaultDays + ')))';
}

/** Names and column letters of the Clients tab for dueDateFormula. */
function clientsColumns(ss) {
  var sheet = ss.getSheetByName(CONFIG.sheets.clients);
  if (!sheet) throw new Error('Tab "' + CONFIG.sheets.clients + '" not found.');
  var cols = headerMap(sheet);
  if (!cols.Client) throw new Error('The Clients tab has no "Client" column.');
  return {
    sheet: CONFIG.sheets.clients,
    client: columnLetter(cols.Client),
    terms: cols[CONFIG.payment.termsColumn] ? columnLetter(cols[CONFIG.payment.termsColumn]) : ''
  };
}

/** Due date formula for one row of the Invoices tab, or '' if the tab has no due date column. */
function invoiceDueFormula(sheet, row, cols) {
  var p = CONFIG.payment;
  if (!cols[p.dueColumn] || !cols.Date || !cols.Client) return '';
  return dueDateFormula('$' + columnLetter(cols.Date) + row, '$' + columnLetter(cols.Client) + row,
    clientsColumns(sheet.getParent()), p.defaultTermsDays);
}

/**
 * Adds the due date column to the Invoices tab if it is missing, fills the
 * formula into every invoice row that has none, and installs the highlighting.
 * @return {{added: boolean, rows: number, rules: number}}
 */
function installPaymentTracking() {
  var p = CONFIG.payment;
  var sheet = businessSpreadsheet().getSheetByName(CONFIG.sheets.invoices);
  if (!sheet) throw new Error('Tab "' + CONFIG.sheets.invoices + '" not found.');
  var cols = headerMap(sheet);
  if (!cols[p.paidColumn]) {
    throw new Error('The Invoices tab has no "' + p.paidColumn + '" column. Add it, or set the name in Config.js (payment.paidColumn).');
  }
  if (!cols.Date || !cols.Client) throw new Error('The Invoices tab needs the columns "Date" and "Client".');

  var added = false;
  if (!cols[p.dueColumn]) {
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(p.dueColumn);
    sheet.getRange(1, cols.Date).copyTo(sheet.getRange(1, col), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    cols[p.dueColumn] = col;
    added = true;
  }

  var last = sheet.getLastRow();
  var rows = 0;
  if (last >= 2) {
    var dueRange = sheet.getRange(2, cols[p.dueColumn], last - 1, 1);
    var formulas = dueRange.getFormulas();
    var values = dueRange.getValues();
    var numbers = cols.Number ? sheet.getRange(2, cols.Number, last - 1, 1).getValues() : null;
    // Only invoice rows without a due date get the formula; typed values are kept.
    for (var i = 0; i < formulas.length; i++) {
      var isInvoice = numbers ? !isBlank(numbers[i][0]) : true;
      if (!isInvoice || formulas[i][0] !== '' || !isBlank(values[i][0])) continue;
      sheet.getRange(i + 2, cols[p.dueColumn]).setFormula(invoiceDueFormula(sheet, i + 2, cols));
      rows++;
    }
    dueRange.setNumberFormat(sheet.getRange(2, cols.Date).getNumberFormat());
  }

  return { added: added, rows: rows, rules: installRelationRules() };
}

function showSetupPaymentTracking() {
  var ui = SpreadsheetApp.getUi();
  var p = CONFIG.payment;
  var answer = ui.alert('Set up payment tracking',
    'This adds a "' + p.dueColumn + '" column to the Invoices tab if it is missing (invoice date plus payment terms, ' +
    'taken from the "' + p.termsColumn + '" column of the Clients tab if there is one, otherwise ' + p.defaultTermsDays +
    ' days) and highlights unpaid invoices past the due date. Everything stays in the sheet and works without the script. Continue?',
    ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  var r = installPaymentTracking();
  ui.alert((r.added ? 'Column "' + p.dueColumn + '" added. ' : '') + r.rows + ' due dates filled in, ' + r.rules + ' highlighting rules installed.');
}

function setupPaymentTrackingFromWeb() {
  return installPaymentTracking();
}
