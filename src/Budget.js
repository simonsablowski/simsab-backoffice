/**
 * Remaining budget per PO: the columns "Invoiced" and "Remaining" in the
 * Purchase orders tab are formulas over the Invoices tab, so overruns are
 * visible without the script. A negative remaining budget is highlighted.
 *
 * Invoiced is the service amount (Amount without Expenses) of all invoices on
 * the PO, like in the validation. Remaining is the budget of all rows with the
 * same PO ID minus Invoiced.
 */

var BUDGET_COLUMNS = { invoiced: 'Invoiced', remaining: 'Remaining' };

/**
 * Formulas for the Invoiced and Remaining cells of one purchase order row.
 * @param row  row number
 * @param own  column letters in the Purchase orders tab: {id, amount, invoiced}
 * @param inv  sheet name and column letters in the Invoices tab: {sheet, po, amount, expenses}
 */
function poBudgetFormulas(row, own, inv) {
  var sheet = "'" + inv.sheet + "'!";
  var id = '$' + own.id + row;
  var invoiced = 'SUMIFS(' + sheet + inv.amount + ':' + inv.amount + ',' + sheet + inv.po + ':' + inv.po + ',' + id + ')' +
    '-SUMIFS(' + sheet + inv.expenses + ':' + inv.expenses + ',' + sheet + inv.po + ':' + inv.po + ',' + id + ')';
  return {
    invoiced: '=IF(' + id + '="","",' + invoiced + ')',
    remaining: '=IF(' + id + '="","",SUMIFS($' + own.amount + ':$' + own.amount + ',$' + own.id + ':$' + own.id + ',' + id +
      ')-$' + own.invoiced + row + ')'
  };
}

/** Column letters of the Invoices tab used by the budget formulas. */
function invoicesBudgetColumns(ss) {
  var sheet = ss.getSheetByName(CONFIG.sheets.invoices);
  if (!sheet) throw new Error('Tab "' + CONFIG.sheets.invoices + '" not found.');
  var cols = headerMap(sheet);
  ['PO', 'Amount', 'Expenses'].forEach(function (h) {
    if (!cols[h]) throw new Error('The Invoices tab has no "' + h + '" column.');
  });
  return { sheet: CONFIG.sheets.invoices, po: columnLetter(cols.PO), amount: columnLetter(cols.Amount), expenses: columnLetter(cols.Expenses) };
}

/** Formulas for one row of the Purchase orders tab, or null while the tab has no budget columns. */
function purchaseOrderBudgetFormulas(sheet, row, cols) {
  var b = BUDGET_COLUMNS;
  if (!cols[b.invoiced] || !cols[b.remaining] || !cols.ID || !cols.Amount) return null;
  return poBudgetFormulas(row, {
    id: columnLetter(cols.ID),
    amount: columnLetter(cols.Amount),
    invoiced: columnLetter(cols[b.invoiced])
  }, invoicesBudgetColumns(sheet.getParent()));
}

/**
 * Adds the Invoiced and Remaining columns to the Purchase orders tab if they
 * are missing, fills the formulas into the rows that have none, and installs
 * the highlighting.
 * @return {{added: number, rows: number, rules: number}}
 */
function installPoBudget() {
  var b = BUDGET_COLUMNS;
  var sheet = businessSpreadsheet().getSheetByName(CONFIG.sheets.purchaseOrders);
  if (!sheet) throw new Error('Tab "' + CONFIG.sheets.purchaseOrders + '" not found.');
  var cols = headerMap(sheet);
  if (!cols.ID || !cols.Amount) throw new Error('The Purchase orders tab needs the columns "ID" and "Amount".');

  var added = 0;
  [b.invoiced, b.remaining].forEach(function (name) {
    if (cols[name]) return;
    var col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(name);
    sheet.getRange(1, cols.Amount).copyTo(sheet.getRange(1, col), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    cols[name] = col;
    added++;
  });

  var last = sheet.getLastRow();
  var rows = 0;
  if (last >= 2) {
    var ids = sheet.getRange(2, cols.ID, last - 1, 1).getValues();
    var invoiced = sheet.getRange(2, cols[b.invoiced], last - 1, 1);
    var remaining = sheet.getRange(2, cols[b.remaining], last - 1, 1);
    var invoicedFormulas = invoiced.getFormulas();
    var remainingFormulas = remaining.getFormulas();
    var invoicedValues = invoiced.getValues();
    var remainingValues = remaining.getValues();
    for (var i = 0; i < ids.length; i++) {
      if (isBlank(ids[i][0])) continue;
      var formulas = purchaseOrderBudgetFormulas(sheet, i + 2, cols);
      var filled = false;
      if (invoicedFormulas[i][0] === '' && isBlank(invoicedValues[i][0])) {
        sheet.getRange(i + 2, cols[b.invoiced]).setFormula(formulas.invoiced);
        filled = true;
      }
      if (remainingFormulas[i][0] === '' && isBlank(remainingValues[i][0])) {
        sheet.getRange(i + 2, cols[b.remaining]).setFormula(formulas.remaining);
        filled = true;
      }
      if (filled) rows++;
    }
    var format = sheet.getRange(2, cols.Amount).getNumberFormat();
    invoiced.setNumberFormat(format);
    remaining.setNumberFormat(format);
  }

  return { added: added, rows: rows, rules: installRelationRules() };
}

function showSetupPoBudget() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Show the remaining budget per PO',
    'This adds the columns "Invoiced" and "Remaining" to the Purchase orders tab if they are missing, as formulas over the Invoices tab, ' +
    'and highlights a negative remaining budget. Everything stays in the sheet and works without the script. Continue?',
    ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  var r = installPoBudget();
  ui.alert(r.added + ' columns added, ' + r.rows + ' rows filled in, ' + r.rules + ' highlighting rules installed.');
}

function setupPoBudgetFromWeb() {
  return installPoBudget();
}
