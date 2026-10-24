/**
 * Automatic filling of dependent values while editing the Business sheet.
 *
 * Runs as a simple onEdit trigger, so it only reacts to manual edits of a
 * single cell. It only fills cells that are empty and never overwrites what
 * you typed. Without the script the sheet works exactly as before.
 *
 * Invoices:        PO -> Client, Quote, Assignment; Quote -> Client, Assignment;
 *                  new row -> Number, Date, Period, ID, Daily rate, totals
 * Purchase orders: Quote -> Client, Assignment
 * Quotes:          new row -> Number, Issue date, Expiry date, ID, totals
 * Time tracking:   Client -> Rate (latest rate for this client), Revenue
 */

function onEdit(e) {
  try {
    if (!e || !e.range || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
    var sheet = e.range.getSheet();
    var row = e.range.getRow();
    if (row < 2 || isBlank(e.range.getValue())) return;
    var header = String(sheet.getRange(1, e.range.getColumn()).getValue()).trim();
    var s = CONFIG.sheets;
    switch (sheet.getName()) {
      case s.invoices: autofillInvoiceRow(sheet, row, header); break;
      case s.purchaseOrders: autofillPurchaseOrderRow(sheet, row, header); break;
      case s.quotes: autofillQuoteRow(sheet, row, header); break;
      case s.timeTracking: autofillTimeRow(sheet, row, header); break;
    }
  } catch (err) {
    console.error(err);
  }
}

/** Column positions (1-based) by header name. */
function headerMap(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) { if (String(h).trim()) map[String(h).trim()] = i + 1; });
  return map;
}

function columnLetter(col) {
  var s = '';
  while (col > 0) {
    var m = (col - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

/** Row accessor for one sheet row by header name. */
function rowAccess(sheet, row) {
  var cols = headerMap(sheet);
  return {
    cols: cols,
    ref: function (h) { return columnLetter(cols[h]) + row; },
    get: function (h) { return cols[h] ? sheet.getRange(row, cols[h]).getValue() : ''; },
    hasFormula: function (h) { return cols[h] ? sheet.getRange(row, cols[h]).getFormula() !== '' : false; },
    isEmpty: function (h) {
      if (!cols[h]) return false;
      var cell = sheet.getRange(row, cols[h]);
      return cell.getFormula() === '' && isBlank(cell.getValue());
    },
    fill: function (h, value) {
      if (!cols[h] || value === undefined || value === null || value === '') return;
      var cell = sheet.getRange(row, cols[h]);
      if (cell.getFormula() !== '' || !isBlank(cell.getValue())) return;
      if (typeof value === 'string' && value.charAt(0) === '=') cell.setFormula(value);
      else cell.setValue(value);
    }
  };
}

function maxNumber(sheet) {
  var cols = headerMap(sheet);
  if (!cols.Number || sheet.getLastRow() < 2) return 0;
  return sheet.getRange(2, cols.Number, sheet.getLastRow() - 1, 1).getValues()
    .reduce(function (m, r) { var n = toNumber(r[0]); return isNaN(n) ? m : Math.max(m, n); }, 0);
}

function today() {
  var d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function vatFormula(amountRef) {
  return '=' + amountRef + '*' + CONFIG.vatRate;
}

function withVatFormula(amountRef) {
  return '=' + amountRef + '*' + (1 + CONFIG.vatRate);
}

/** Formula for the invoice ID; ref maps a header to the cell reference in the row. */
function invoiceIdFormula(ref) {
  return '=IF(OR(' + ref('Date') + '="",' + ref('Number') + '="",' + ref('Quote') + '=""),"",YEAR(' +
    ref('Date') + ')&"-A"&TEXT(' + ref('Number') + ',"00")&"-"&REGEXEXTRACT(' + ref('Quote') + ',"A\\d+$"))';
}

/** Formulas for Amount, Tax and Amount with tax of an invoice row. */
function invoiceTotalFormulas(ref) {
  return {
    Amount: '=' + ref('Daily rate') + '*' + ref('Number of days') + '+' + ref('Expenses'),
    Tax: vatFormula(ref('Amount')),
    'Amount with tax': withVatFormula(ref('Amount'))
  };
}

function autofillInvoiceRow(sheet, row, header) {
  var r = rowAccess(sheet, row);
  var ss = sheet.getParent();

  if (header === 'PO') {
    var pos = readRecords(CONFIG.sheets.purchaseOrders).filter(function (p) { return normKey(p.ID) === normKey(r.get('PO')); });
    if (pos.length > 0) {
      var po = pos[pos.length - 1];
      r.fill('Client', po.Client);
      r.fill('Quote', po.Quote);
      r.fill('Assignment', po.Assignment);
    }
  }
  if (header === 'Quote' || header === 'PO') {
    var quote = readRecords(CONFIG.sheets.quotes).find(function (q) { return normKey(q.ID) === normKey(r.get('Quote')); });
    if (quote) {
      r.fill('Client', quote.Client);
      r.fill('Assignment', quote.Assignment);
    }
  }

  // A row counts as new invoice once client, quote or PO is set.
  if (isBlank(r.get('Client')) && isBlank(r.get('Quote')) && isBlank(r.get('PO'))) return;

  r.fill('Number', maxNumber(sheet) + 1);
  var date = today();
  r.fill('Date', date);
  r.fill('Period', date);
  if (r.cols.ID && r.cols.Date && r.cols.Number && r.cols.Quote) {
    r.fill('ID', invoiceIdFormula(r.ref));
  }

  // Daily rate of the latest invoice for the same PO, else the same quote.
  if (r.isEmpty('Daily rate') && (!isBlank(r.get('PO')) || !isBlank(r.get('Quote')))) {
    var rate = latestDailyRate(readRecords(CONFIG.sheets.invoices), normKey(r.get('PO')), normKey(r.get('Quote')), row);
    if (!isNaN(rate)) r.fill('Daily rate', rate);
  }

  r.fill('Expenses', 0);
  if (r.cols.Amount && r.cols['Daily rate'] && r.cols['Number of days'] && r.cols.Expenses) {
    r.fill('Amount', invoiceTotalFormulas(r.ref).Amount);
  }
  if (r.cols.Amount) {
    r.fill('Tax', invoiceTotalFormulas(r.ref).Tax);
    r.fill('Amount with tax', invoiceTotalFormulas(r.ref)['Amount with tax']);
  }
  var due = invoiceDueFormula(sheet, row, r.cols);
  if (due) r.fill(CONFIG.payment.dueColumn, due);
  ss.toast('Filled in dependent values for invoice row ' + row + '.', 'Backoffice', 3);
}

function autofillPurchaseOrderRow(sheet, row, header) {
  var r = rowAccess(sheet, row);
  if (header === 'Quote') {
    var quote = readRecords(CONFIG.sheets.quotes).find(function (q) { return normKey(q.ID) === normKey(r.get('Quote')); });
    if (quote) {
      r.fill('Client', quote.Client);
      r.fill('Assignment', quote.Assignment);
    }
  }
  if (r.cols.Amount) {
    r.fill('Tax', vatFormula(r.ref('Amount')));
    r.fill('Amount with tax', withVatFormula(r.ref('Amount')));
  }
}

function autofillQuoteRow(sheet, row, header) {
  var r = rowAccess(sheet, row);
  if (isBlank(r.get('Client')) && isBlank(r.get('Assignment'))) return;
  r.fill('Number', maxNumber(sheet) + 1);
  var date = today();
  r.fill('Issue date', date);
  r.fill('Expiry date', new Date(date.getFullYear(), date.getMonth() + 1, date.getDate()));
  if (r.cols.ID && r.cols['Issue date'] && r.cols.Number) {
    r.fill('ID', '=IF(OR(' + r.ref('Issue date') + '="",' + r.ref('Number') + '=""),"",YEAR(' + r.ref('Issue date') +
      ')&"-A"&TEXT(' + r.ref('Number') + ',"00"))');
  }
  if (r.cols.Amount) {
    r.fill('Tax', vatFormula(r.ref('Amount')));
    r.fill('Amount with tax', withVatFormula(r.ref('Amount')));
  }
}

function autofillTimeRow(sheet, row, header) {
  var r = rowAccess(sheet, row);
  if (header === 'Client' && r.isEmpty('Rate')) {
    var client = normKey(r.get('Client'));
    var lastRow = row - 1;
    if (lastRow >= 2 && r.cols.Client && r.cols.Rate) {
      var start = Math.max(2, lastRow - 500);
      var values = sheet.getRange(start, 1, lastRow - start + 1, sheet.getLastColumn()).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        if (normKey(values[i][r.cols.Client - 1]) === client && toNumber(values[i][r.cols.Rate - 1]) > 0) {
          r.fill('Rate', values[i][r.cols.Rate - 1]);
          break;
        }
      }
    }
  }
  if (r.cols.Revenue && r.cols.Hours && r.cols.Rate) {
    r.fill('Revenue', '=' + r.ref('Hours') + '*' + r.ref('Rate'));
  }
}
