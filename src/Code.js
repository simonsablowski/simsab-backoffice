/**
 * Entry points: menu, dialogs and functions called from the dialogs.
 * Values returned to the dialogs must be plain (no Date objects).
 */

function onOpen() {
  try { rememberBusinessSpreadsheet(); } catch (e) { console.error(e); }
  SpreadsheetApp.getUi()
    .createMenu('Backoffice')
    .addItem('Prepare invoice row…', 'showPrepareDialog')
    .addItem('Create invoice…', 'showInvoiceDialog')
    .addItem('Check all invoices…', 'showReportDialog')
    .addItem('Highlight inconsistent values…', 'showInstallRules')
    .addSeparator()
    .addItem('Settings…', 'showSettings')
    .addToUi();
}

function showPrepareDialog() {
  var html = HtmlService.createTemplateFromFile('PrepareDialog').evaluate().setWidth(560).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Prepare invoice row');
}

function showInvoiceDialog() {
  var html = HtmlService.createTemplateFromFile('InvoiceDialog').evaluate().setWidth(720).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Create invoice');
}

function showReportDialog() {
  var html = HtmlService.createTemplateFromFile('ReportDialog').evaluate().setWidth(860).setHeight(680);
  SpreadsheetApp.getUi().showModalDialog(html, 'Invoice check');
}

function showSettings() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var keys = CONFIG.propertyKeys;

  var template = ui.prompt('Invoice template',
    'Link to the Google Sheet used as invoice template.\nCurrent: ' + (props.getProperty(keys.templateId) || 'not set') +
    '\nLeave empty to keep the current value.', ui.ButtonSet.OK_CANCEL);
  if (template.getSelectedButton() !== ui.Button.OK) return;
  var templateId = extractDriveId(template.getResponseText());
  if (templateId) props.setProperty(keys.templateId, templateId);

  var folder = ui.prompt('Output folder',
    'Link to the Drive folder for new invoices.\nCurrent: ' + (props.getProperty(keys.folderId) || 'folder of the template') +
    '\nLeave empty to keep the current value, enter "-" to use the folder of the template.', ui.ButtonSet.OK_CANCEL);
  if (folder.getSelectedButton() !== ui.Button.OK) return;
  var folderText = folder.getResponseText().trim();
  if (folderText === '-') props.deleteProperty(keys.folderId);
  else if (extractDriveId(folderText)) props.setProperty(keys.folderId, extractDriveId(folderText));

  ui.alert('Settings saved.');
}

/** Extracts a Drive file or folder ID from a link, or returns the input if it already is an ID. */
function extractDriveId(text) {
  var t = String(text || '').trim();
  if (!t) return '';
  var m = t.match(/\/d\/([a-zA-Z0-9_-]{20,})/) || t.match(/folders\/([a-zA-Z0-9_-]{20,})/) || t.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}

/** Invoices for the selection list, newest first. */
function getInvoiceList() {
  var ctx = loadContext();
  return ctx.invoices
    .filter(function (r) { return !isBlank(r.ID); })
    .sort(function (a, b) { return (toNumber(b.Number) || 0) - (toNumber(a.Number) || 0); })
    .slice(0, 30)
    .map(function (r) {
      return {
        id: normKey(r.ID),
        label: normKey(r.ID) + ' · ' + normKey(r.Client) + ' · ' + normKey(r.Assignment) +
          (isDate(r.Date) ? ' · ' + formatDate(r.Date) : '')
      };
    });
}

/** Validation result and proposed inputs for one invoice. */
function getInvoicePreview(invoiceId) {
  var ctx = loadContext();
  var inv = findInvoice(ctx, invoiceId);
  var result = validateInvoice(inv, ctx, validationOptions());
  var expenses = toNumber(inv.Expenses) || 0;
  return {
    id: invoiceId,
    client: normKey(inv.Client),
    assignment: normKey(inv.Assignment),
    date: isDate(inv.Date) ? formatDate(inv.Date) : '',
    days: toNumber(inv['Number of days']),
    dailyRate: formatEuro(toNumber(inv['Daily rate']) || 0),
    expenses: formatEuro(expenses),
    hasExpenses: expenses !== 0,
    amount: formatEuro(result.facts.amount),
    total: formatEuro(result.facts.total),
    servicePeriod: proposedServicePeriod(ctx, inv),
    description: lastDescriptionFor(normKey(inv.Quote)),
    expenseLabel: CONFIG.template.defaultExpenseLabel,
    errors: result.errors,
    warnings: result.warnings,
    info: result.info,
    templateConfigured: !!getSetting(CONFIG.propertyKeys.templateId)
  };
}

/** Validation of all invoices, newest first. */
function getInvoiceReport() {
  var ctx = loadContext();
  var opts = validationOptions();
  return ctx.invoices
    .filter(function (r) { return !isBlank(r.ID); })
    .sort(function (a, b) { return (toNumber(b.Number) || 0) - (toNumber(a.Number) || 0); })
    .map(function (inv) {
      var r = validateInvoice(inv, ctx, opts);
      return { id: normKey(inv.ID), client: normKey(inv.Client), row: inv._row, errors: r.errors, warnings: r.warnings };
    });
}

/** Called from the invoice dialog. */
function submitInvoice(params) {
  return createInvoice(params);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}
