/**
 * Installs conditional formatting rules in the Business sheet that highlight
 * inconsistent relations between tabs. The rules are part of the sheet, so
 * they keep working without the script. Installing again replaces them.
 */

var RULE_MARKER = 'N("backoffice")=0';

/** Rule definitions. {Col} placeholders refer to columns of the sheet the rule is applied to. */
function relationRules() {
  var s = CONFIG.sheets;
  return [
    { sheet: s.invoices, column: 'Client', note: 'Client not in Clients',
      formula: 'COUNTIF(INDIRECT("\'' + s.clients + '\'!{Clients.Client}:{Clients.Client}"),{Client}2)=0' },
    { sheet: s.invoices, column: 'Quote', note: 'No quote with this ID for this client',
      formula: 'COUNTIFS(INDIRECT("\'' + s.quotes + '\'!{Quotes.ID}:{Quotes.ID}"),{Quote}2,INDIRECT("\'' + s.quotes + '\'!{Quotes.Client}:{Quotes.Client}"),{Client}2)=0' },
    { sheet: s.invoices, column: 'PO', note: 'No PO with this ID for this quote and client',
      formula: 'COUNTIFS(INDIRECT("\'' + s.purchaseOrders + '\'!{Purchase orders.ID}:{Purchase orders.ID}"),{PO}2,INDIRECT("\'' + s.purchaseOrders + '\'!{Purchase orders.Quote}:{Purchase orders.Quote}"),{Quote}2,INDIRECT("\'' + s.purchaseOrders + '\'!{Purchase orders.Client}:{Purchase orders.Client}"),{Client}2)=0' },
    { sheet: s.invoices, column: 'ID', note: 'ID does not match date, number and quote',
      formula: '{ID}2<>YEAR({Date}2)&"-A"&TEXT({Number}2,"00")&"-"&IFERROR(REGEXEXTRACT({Quote}2,"A\\d+$"),"")' },
    { sheet: s.invoices, column: 'Number', note: 'Duplicate invoice number',
      formula: 'COUNTIF({Number}:{Number},{Number}2)>1' },
    { sheet: s.purchaseOrders, column: 'Quote', note: 'No quote with this ID for this client',
      formula: 'COUNTIFS(INDIRECT("\'' + s.quotes + '\'!{Quotes.ID}:{Quotes.ID}"),{Quote}2,INDIRECT("\'' + s.quotes + '\'!{Quotes.Client}:{Quotes.Client}"),{Client}2)=0' },
    { sheet: s.purchaseOrders, column: 'Client', note: 'Client not in Clients',
      formula: 'COUNTIF(INDIRECT("\'' + s.clients + '\'!{Clients.Client}:{Clients.Client}"),{Client}2)=0' },
    { sheet: s.quotes, column: 'Client', note: 'Client not in Clients',
      formula: 'COUNTIF(INDIRECT("\'' + s.clients + '\'!{Clients.Client}:{Clients.Client}"),{Client}2)=0' },
    { sheet: s.timeTracking, column: 'Client', note: 'Client not in Clients',
      formula: 'COUNTIF(INDIRECT("\'' + s.clients + '\'!{Clients.Client}:{Clients.Client}"),{Client}2)=0' },
    { sheet: s.timeTracking, column: 'Invoice', note: 'No invoice with this ID for this client',
      formula: 'COUNTIFS(INDIRECT("\'' + s.invoices + '\'!{Invoices.ID}:{Invoices.ID}"),{Invoice}2,INDIRECT("\'' + s.invoices + '\'!{Invoices.Client}:{Invoices.Client}"),{Client}2)=0' },
    { sheet: s.expenses, column: 'Invoice', note: 'No invoice with this ID for this client',
      formula: 'COUNTIFS(INDIRECT("\'' + s.invoices + '\'!{Invoices.ID}:{Invoices.ID}"),{Invoice}2,INDIRECT("\'' + s.invoices + '\'!{Invoices.Client}:{Invoices.Client}"),{Client}2)=0' }
  ];
}

/**
 * Replaces {Header} with the absolute column letter in the target sheet ($D)
 * and {Sheet.Header} with the plain column letter in another sheet (D).
 */
function resolveRuleFormula(template, ownColumns, columnsBySheet) {
  return template.replace(/\{([^}]+)\}/g, function (all, key) {
    var dot = key.indexOf('.');
    if (dot > 0 && columnsBySheet[key.slice(0, dot)]) {
      var col = columnsBySheet[key.slice(0, dot)][key.slice(dot + 1)];
      if (!col) throw new Error('Column "' + key + '" not found.');
      return columnLetter(col);
    }
    if (!ownColumns[key]) throw new Error('Column "' + key + '" not found.');
    return '$' + columnLetter(ownColumns[key]);
  });
}

function installRelationRules() {
  var ss = SpreadsheetApp.getActive();
  var columnsBySheet = {};
  Object.keys(CONFIG.sheets).forEach(function (k) {
    var sh = ss.getSheetByName(CONFIG.sheets[k]);
    if (sh) columnsBySheet[CONFIG.sheets[k]] = headerMap(sh);
  });

  var bySheet = {};
  relationRules().forEach(function (rule) {
    (bySheet[rule.sheet] = bySheet[rule.sheet] || []).push(rule);
  });

  var installed = 0;
  Object.keys(bySheet).forEach(function (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var cols = columnsBySheet[sheetName];
    var kept = sheet.getConditionalFormatRules().filter(function (r) {
      var c = r.getBooleanCondition();
      var values = c ? c.getCriteriaValues() : [];
      return !values.some(function (v) { return String(v).indexOf(RULE_MARKER) >= 0; });
    });
    var added = bySheet[sheetName].filter(function (rule) { return cols[rule.column]; }).map(function (rule) {
      var condition = resolveRuleFormula(rule.formula, cols, columnsBySheet);
      var formula = '=AND(' + '$' + columnLetter(cols[rule.column]) + '2<>"",' + condition + ',' + RULE_MARKER + ')';
      var range = sheet.getRange(2, cols[rule.column], Math.max(sheet.getMaxRows() - 1, 1), 1);
      return SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied(formula)
        .setBackground('#f4c7c3')
        .setFontColor('#a50e0e')
        .setRanges([range])
        .build();
    });
    installed += added.length;
    sheet.setConditionalFormatRules(added.concat(kept));
  });
  return installed;
}

function showInstallRules() {
  var ui = SpreadsheetApp.getUi();
  var lines = relationRules().map(function (r) { return '• ' + r.sheet + ' › ' + r.column + ': ' + r.note; });
  var answer = ui.alert('Highlight inconsistent values',
    'This adds conditional formatting to the Business sheet. Cells turn red when:\n\n' + lines.join('\n') +
    '\n\nThe rules stay in the sheet and work without the script. Running this again replaces them. Continue?',
    ui.ButtonSet.OK_CANCEL);
  if (answer !== ui.Button.OK) return;
  var n = installRelationRules();
  ui.alert(n + ' rules installed.');
}
