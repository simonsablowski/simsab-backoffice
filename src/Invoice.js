/**
 * Creating the invoice: copy the template, fill in data and description,
 * fix the layout, export the PDF and optionally create a Gmail draft.
 */

function getSetting(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function requireSetting(key, label) {
  var value = getSetting(key);
  if (!value) throw new Error(label + ' is not configured. Use Backoffice > Settings.');
  return value;
}

/** Layout values, optionally overridden in Script Properties (LAYOUT_CHARS_PER_LINE etc.). */
function layoutSettings() {
  var props = PropertiesService.getScriptProperties();
  var layout = {};
  Object.keys(CONFIG.layout).forEach(function (k) {
    var override = props.getProperty('LAYOUT_' + k.replace(/[A-Z]/g, function (c) { return '_' + c; }).toUpperCase());
    layout[k] = override ? Number(override) : CONFIG.layout[k];
  });
  return layout;
}

function outputFolder(templateFile) {
  var folderId = getSetting(CONFIG.propertyKeys.folderId);
  if (folderId) return DriveApp.getFolderById(folderId);
  var parents = templateFile.getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

/**
 * Description of the most recent invoice sheet for the same quote in the output
 * folder, so that no state is kept outside of Google Sheets.
 */
function lastDescriptionFor(quote) {
  try {
    var templateId = getSetting(CONFIG.propertyKeys.templateId);
    if (!templateId || !quote) return '';
    var folder = outputFolder(DriveApp.getFileById(templateId));
    var suffix = '-' + String(quote).split('-').slice(1).join('-') + ' - ';
    var files = folder.searchFiles('title contains "' + suffix + '" and mimeType = "' + MimeType.GOOGLE_SHEETS + '" and trashed = false');
    var latest = null;
    while (files.hasNext()) {
      var f = files.next();
      if (f.getId() === templateId) continue;
      if (!latest || f.getDateCreated() > latest.getDateCreated()) latest = f;
    }
    if (!latest) return '';
    var sheet = SpreadsheetApp.openById(latest.getId()).getSheetByName(CONFIG.template.invoiceSheet);
    if (!sheet) return '';
    var row = findRowByFormula(sheet, 5, CONFIG.template.descriptionRowMarker);
    return row > 0 ? String(sheet.getRange(row, 2).getValue()) : '';
  } catch (e) {
    return '';
  }
}

/** Finds the first row whose formula in the given column equals the marker. */
function findRowByFormula(sheet, column, marker) {
  var formulas = sheet.getRange(1, column, sheet.getLastRow(), 1).getFormulas();
  for (var i = 0; i < formulas.length; i++) {
    if (String(formulas[i][0]).replace(/\s/g, '') === marker) return i + 1;
  }
  return -1;
}

function findRowByLabel(sheet, label) {
  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === label) return i + 1;
  }
  return -1;
}

function totalRowHeight(sheet) {
  var total = 0;
  for (var r = 1; r <= sheet.getLastRow(); r++) total += sheet.getRowHeight(r);
  return total;
}

/** Replaces the QUERY in the Data tab with fixed values, so the copy does not depend on the Business sheet. */
function writeDataSheet(ss, inv, client) {
  var t = CONFIG.template;
  var data = ss.getSheetByName(t.dataSheet);
  if (!data) throw new Error('The template has no "' + t.dataSheet + '" tab.');
  var headers = ['ID', 'Client', 'Date', 'Period', 'PO', 'Daily rate', 'Number of days', 'Expenses', 'Amount', 'Tax', 'Amount with tax', 'Address'];
  var expenses = toNumber(inv.Expenses) || 0;
  var amount = serviceAmount(inv) + expenses;
  var tax = amount * CONFIG.vatRate;
  var values = [normKey(inv.ID), normKey(inv.Client), inv.Date, inv.Period, inv.PO, toNumber(inv['Daily rate']),
    toNumber(inv['Number of days']), expenses, amount, tax, amount + tax, String(client.Address).trim()];
  data.getRange(1, 1, 2, headers.length).clearContent();
  data.getRange(1, 1, 2, headers.length).setValues([headers, values]);

  var importSheet = ss.getSheetByName(t.importSheet);
  if (importSheet) ss.deleteSheet(importSheet);
}

function writeConfig(ss, invoiceId, servicePeriod) {
  var t = CONFIG.template;
  var config = ss.getSheetByName(t.configSheet);
  if (!config) throw new Error('The template has no "' + t.configSheet + '" tab.');
  var idRow = findRowByLabel(config, t.configLabels.invoiceId);
  var periodRow = findRowByLabel(config, t.configLabels.servicePeriod);
  if (idRow < 0 || periodRow < 0) throw new Error('The Config tab of the template has no "Invoice ID" or "Service period" row.');
  config.getRange(idRow, 2).setValue(invoiceId);
  config.getRange(periodRow, 2).setValue(servicePeriod);
}

/**
 * Fills description and expenses rows and resizes the spacer row.
 * @return {string[]} layout warnings
 */
function layoutInvoiceSheet(ss, description, expenseLabel, hasExpenses) {
  var t = CONFIG.template;
  var layout = layoutSettings();
  var sheet = ss.getSheetByName(t.invoiceSheet);
  if (!sheet) throw new Error('The template has no "' + t.invoiceSheet + '" tab.');

  var descRow = findRowByFormula(sheet, 5, t.descriptionRowMarker);
  var expRow = findRowByFormula(sheet, 5, t.expensesRowMarker);
  var footerRow = findRowByFormula(sheet, 2, t.footerRowMarker);
  if (descRow < 0 || footerRow < 0) {
    throw new Error('Could not find the description row (' + t.descriptionRowMarker + ' in column E) or the footer row (' +
      t.footerRowMarker + ' in column B) in the template.');
  }

  var targetTotal = totalRowHeight(sheet);

  sheet.getRange(descRow, 2).setValue(description).setWrap(true).setVerticalAlignment('top');
  sheet.setRowHeightsForced(descRow, 1, descriptionRowHeight(description, layout));

  if (expRow > 0) {
    if (hasExpenses) {
      sheet.getRange(expRow, 2).setValue(expenseLabel);
    } else {
      sheet.deleteRow(expRow);
      if (expRow < footerRow) footerRow--;
    }
  }

  SpreadsheetApp.flush();
  var spacerRow = footerRow - 1;
  var spacer = computeSpacerHeight(targetTotal, totalRowHeight(sheet), sheet.getRowHeight(spacerRow), layout.minSpacerPx);
  sheet.setRowHeightsForced(spacerRow, 1, spacer.height);
  SpreadsheetApp.flush();

  var warnings = [];
  if (spacer.overflowPx > 0) {
    warnings.push('The description is about ' + spacer.overflowPx + ' px taller than the page allows, so the footer may move to a second page. Please check the PDF.');
  }
  return warnings;
}

function exportPdf(ss, sheetName, fileName) {
  var sheet = ss.getSheetByName(sheetName);
  var params = Object.keys(CONFIG.pdf).map(function (k) { return k + '=' + encodeURIComponent(CONFIG.pdf[k]); });
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&gid=' + sheet.getSheetId() + '&' + params.join('&');
  var options = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  var response;
  for (var attempt = 0; attempt < 3; attempt++) {
    response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 200) break;
    Utilities.sleep(2000 * (attempt + 1));
  }
  if (response.getResponseCode() !== 200) {
    throw new Error('PDF export failed with HTTP ' + response.getResponseCode() + '.');
  }
  return response.getBlob().setName(fileName + '.pdf');
}

function createDraft(ss, pdfFile, client) {
  var message = ss.getSheetByName(CONFIG.template.messageSheet);
  if (!message) return null;
  var subject = message.getRange('A1').getDisplayValue();
  var body = message.getRange('A3').getDisplayValue();
  var recipient = client && !isBlank(client['Invoice email']) ? String(client['Invoice email']).trim() : '';
  var raw = buildMimeMessage(recipient, subject, body, pdfFile.getBlob());
  // The Gmail advanced service only needs the gmail.compose scope, unlike GmailApp.
  var draft = Gmail.Users.Drafts.create({ message: { raw: Utilities.base64EncodeWebSafe(raw) } }, 'me');
  return { recipient: recipient, id: draft.id };
}

function encodeMimeHeader(text) {
  return '=?UTF-8?B?' + Utilities.base64Encode(text, Utilities.Charset.UTF_8) + '?=';
}

function wrapBase64(b64) {
  return b64.replace(/(.{76})/g, '$1\r\n');
}

/** Builds a multipart MIME message with one PDF attachment. */
function buildMimeMessage(to, subject, body, pdfBlob) {
  var boundary = 'backoffice-' + Utilities.getUuid();
  var lines = [];
  if (to) lines.push('To: ' + to);
  lines.push('Subject: ' + encodeMimeHeader(subject));
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');
  lines.push('');
  lines.push('--' + boundary);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(wrapBase64(Utilities.base64Encode(body, Utilities.Charset.UTF_8)));
  lines.push('--' + boundary);
  lines.push('Content-Type: application/pdf; name="' + encodeMimeHeader(pdfBlob.getName()) + '"');
  lines.push('Content-Disposition: attachment; filename="' + encodeMimeHeader(pdfBlob.getName()) + '"');
  lines.push('Content-Transfer-Encoding: base64');
  lines.push('');
  lines.push(wrapBase64(Utilities.base64Encode(pdfBlob.getBytes())));
  lines.push('--' + boundary + '--');
  return lines.join('\r\n');
}

/**
 * Creates the invoice for one row of the Invoices tab.
 * @param {{invoiceId: string, servicePeriod: string, description: string,
 *          expenseLabel: string, createDraft: boolean, ignoreErrors: boolean,
 *          allowDuplicate: boolean}} params
 */
function createInvoice(params) {
  var ctx = loadContext();
  var inv = findInvoice(ctx, params.invoiceId);
  var result = validateInvoice(inv, ctx, validationOptions());
  if (result.errors.length > 0 && !params.ignoreErrors) {
    throw new Error('The invoice row has errors:\n- ' + result.errors.join('\n- '));
  }
  if (isBlank(params.description)) throw new Error('Please enter a service description.');
  if (isBlank(params.servicePeriod)) throw new Error('Please enter the service period.');

  var client = findClient(ctx, normKey(inv.Client));
  if (!client) throw new Error('Client "' + normKey(inv.Client) + '" not found.');

  var templateFile = DriveApp.getFileById(requireSetting(CONFIG.propertyKeys.templateId, 'The invoice template'));
  var folder = outputFolder(templateFile);
  var name = invoiceFileName(normKey(inv.ID), normKey(inv.Client), normKey(inv.Assignment));

  if (folder.getFilesByName(name + '.pdf').hasNext() || folder.getFilesByName(name).hasNext()) {
    if (!params.allowDuplicate) {
      return { duplicate: true, name: name };
    }
    name += ' (' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm') + ')';
  }

  var copy = templateFile.makeCopy(name, folder);
  var ss = SpreadsheetApp.openById(copy.getId());
  var hasExpenses = (toNumber(inv.Expenses) || 0) !== 0;

  writeDataSheet(ss, inv, client);
  writeConfig(ss, normKey(inv.ID), params.servicePeriod);
  var warnings = layoutInvoiceSheet(ss, params.description.replace(/\s+$/, ''),
    params.expenseLabel || CONFIG.template.defaultExpenseLabel, hasExpenses);

  var pdfFile = folder.createFile(exportPdf(ss, CONFIG.template.invoiceSheet, name));

  var draft = params.createDraft ? createDraft(ss, pdfFile, client) : null;

  return {
    duplicate: false,
    name: name,
    sheetUrl: ss.getUrl(),
    pdfUrl: pdfFile.getUrl(),
    draft: draft,
    warnings: warnings
  };
}
