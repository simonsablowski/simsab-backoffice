/**
 * Quote documents: created from a row of the Quotes tab in the same way as
 * invoices (copy the template, write fixed values, fix the layout, export the
 * PDF, optionally create a Gmail draft). The template follows the conventions
 * of the invoice template, see CONFIG.quoteTemplate and the README.
 */

/** Expected quote ID, e.g. a quote dated 2026 with number 5 -> 2026-A05. */
function expectedQuoteId(issueDate, number) {
  return issueDate.getFullYear() + '-A' + pad2(number);
}

/** Name used for the quote spreadsheet copy and the PDF. */
function quoteFileName(quoteId, client, assignment) {
  var name = 'Quote ' + quoteId + ' - ' + client + ' - ' + assignment;
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

var REQUIRED_QUOTE_FIELDS = ['Number', 'Issue date', 'Expiry date', 'Client', 'Assignment', 'ID', 'Amount'];

/**
 * Validates one quote record against the other tabs.
 * @param options {vatRate, moneyTolerance, today (Date)}
 * @return {{errors: string[], warnings: string[], info: string[], facts: Object}}
 */
function validateQuote(quote, ctx, options) {
  var tol = options.moneyTolerance || 0.01;
  var errors = [];
  var warnings = [];
  var info = [];

  var id = normKey(quote.ID);
  var clientName = normKey(quote.Client);
  var number = toNumber(quote.Number);
  var amount = toNumber(quote.Amount);

  REQUIRED_QUOTE_FIELDS.forEach(function (f) {
    if (isBlank(quote[f])) errors.push('Field "' + f + '" is empty.');
  });
  ['Issue date', 'Expiry date'].forEach(function (f) {
    if (!isBlank(quote[f]) && !isDate(quote[f])) errors.push('"' + f + '" is not a date.');
  });

  if (isDate(quote['Issue date']) && !isNaN(number)) {
    var expected = expectedQuoteId(quote['Issue date'], number);
    if (id && id !== expected) errors.push('ID is "' + id + '", but issue date and number give "' + expected + '".');
  }
  var others = ctx.quotes.filter(function (o) { return o !== quote && !isBlank(o.Number); });
  if (id && others.some(function (o) { return normKey(o.ID) === id; })) errors.push('ID "' + id + '" is used by another quote.');
  if (!isNaN(number) && others.some(function (o) { return toNumber(o.Number) === number; })) {
    errors.push('Quote number ' + number + ' is used by another quote.');
  }

  var client = ctx.clients.find(function (c) { return normKey(c.Client) === clientName; });
  if (clientName && !client) errors.push('Client "' + clientName + '" is not listed in the Clients tab.');
  else if (client && isBlank(client.Address)) errors.push('Client "' + clientName + '" has no address in the Clients tab.');

  if (isDate(quote['Issue date']) && isDate(quote['Expiry date'])) {
    if (quote['Expiry date'] < quote['Issue date']) errors.push('The expiry date is before the issue date.');
    else if (options.today && dayNumber(quote['Expiry date']) < dayNumber(options.today)) {
      warnings.push('The quote expired on ' + formatDate(quote['Expiry date']) + '.');
    }
  }

  var tax = amount * options.vatRate;
  [['Tax', tax], ['Amount with tax', amount + tax]].forEach(function (pair) {
    var actual = toNumber(quote[pair[0]]);
    if (!isNaN(amount) && !isBlank(quote[pair[0]]) && (isNaN(actual) || Math.abs(actual - pair[1]) > tol)) {
      errors.push('"' + pair[0] + '" is ' + quote[pair[0]] + ', expected ' + formatEuro(pair[1]) + '.');
    }
  });

  if (id && ctx.purchaseOrders.some(function (p) { return normKey(p.Quote) === id; })) {
    info.push('A PO already refers to this quote.');
  }

  return {
    errors: errors,
    warnings: warnings,
    info: info,
    facts: { amount: isNaN(amount) ? 0 : roundMoney(amount), tax: roundMoney(isNaN(amount) ? 0 : tax), total: roundMoney(isNaN(amount) ? 0 : amount + tax) }
  };
}

// Sheet access and document creation ------------------------------------------

function findQuote(ctx, quoteId) {
  var quote = ctx.quotes.find(function (r) { return normKey(r.ID) === quoteId; });
  if (!quote) throw new Error('Quote "' + quoteId + '" not found in the Quotes tab.');
  return quote;
}

function quoteValidationOptions() {
  var options = validationOptions();
  options.today = today();
  return options;
}

/** Quotes for the selection list, newest first. */
function getQuoteList() {
  return readRecords(CONFIG.sheets.quotes)
    .filter(function (r) { return !isBlank(r.ID); })
    .sort(function (a, b) { return (toNumber(b.Number) || 0) - (toNumber(a.Number) || 0); })
    .slice(0, 30)
    .map(function (r) {
      return {
        id: normKey(r.ID),
        label: normKey(r.ID) + ' · ' + normKey(r.Client) + ' · ' + normKey(r.Assignment) +
          (isDate(r['Issue date']) ? ' · ' + formatDate(r['Issue date']) : '')
      };
    });
}

/** Validation result and proposed inputs for one quote. */
function getQuotePreview(quoteId) {
  var ctx = loadContext();
  var quote = findQuote(ctx, quoteId);
  var result = validateQuote(quote, ctx, quoteValidationOptions());
  return {
    id: quoteId,
    client: normKey(quote.Client),
    assignment: normKey(quote.Assignment),
    issueDate: isDate(quote['Issue date']) ? formatDate(quote['Issue date']) : '',
    expiryDate: isDate(quote['Expiry date']) ? formatDate(quote['Expiry date']) : '',
    amount: formatEuro(result.facts.amount),
    total: formatEuro(result.facts.total),
    description: normKey(quote.Assignment),
    errors: result.errors,
    warnings: result.warnings,
    info: result.info,
    templateConfigured: !!getSetting(CONFIG.propertyKeys.quoteTemplateId)
  };
}

/** Replaces the data in the Data tab with fixed values, so the copy does not depend on the Business sheet. */
function writeQuoteData(ss, quote, client) {
  var t = CONFIG.quoteTemplate;
  var data = ss.getSheetByName(t.dataSheet);
  if (!data) throw new Error('The quote template has no "' + t.dataSheet + '" tab.');
  var headers = ['ID', 'Client', 'Issue date', 'Expiry date', 'Assignment', 'Amount', 'Tax', 'Amount with tax', 'Address'];
  var amount = toNumber(quote.Amount) || 0;
  var tax = amount * CONFIG.vatRate;
  var values = [normKey(quote.ID), normKey(quote.Client), quote['Issue date'], quote['Expiry date'], normKey(quote.Assignment),
    amount, tax, amount + tax, String(client.Address).trim()];
  data.getRange(1, 1, 2, headers.length).clearContent();
  data.getRange(1, 1, 2, headers.length).setValues([headers, values]);
  var importSheet = ss.getSheetByName(t.importSheet);
  if (importSheet) ss.deleteSheet(importSheet);
}

/** Writes the quote ID (and the validity text, if the template has a row for it) into the Config tab. */
function writeQuoteConfig(ss, quoteId, validUntil) {
  var t = CONFIG.quoteTemplate;
  var config = ss.getSheetByName(t.configSheet);
  if (!config) throw new Error('The quote template has no "' + t.configSheet + '" tab.');
  var idRow = findRowByLabel(config, t.configLabels.quoteId);
  if (idRow < 0) throw new Error('The Config tab of the quote template has no "' + t.configLabels.quoteId + '" row.');
  config.getRange(idRow, 2).setValue(quoteId);
  var validRow = findRowByLabel(config, t.configLabels.validUntil);
  if (validRow > 0) config.getRange(validRow, 2).setValue(validUntil);
}

/**
 * Creates the quote document for one row of the Quotes tab.
 * @param {{quoteId: string, description: string, createDraft: boolean,
 *          ignoreErrors: boolean, allowDuplicate: boolean}} params
 */
function createQuote(params) {
  var ctx = loadContext();
  var quote = findQuote(ctx, params.quoteId);
  var result = validateQuote(quote, ctx, quoteValidationOptions());
  if (result.errors.length > 0 && !params.ignoreErrors) {
    throw new Error('The quote row has errors:\n- ' + result.errors.join('\n- '));
  }
  if (isBlank(params.description)) throw new Error('Please enter a service description.');

  var client = ctx.clients.find(function (c) { return normKey(c.Client) === normKey(quote.Client); });
  if (!client) throw new Error('Client "' + normKey(quote.Client) + '" not found.');

  var templateFile = DriveApp.getFileById(requireSetting(CONFIG.propertyKeys.quoteTemplateId, 'The quote template'));
  var folder = outputFolder(templateFile);
  var name = quoteFileName(normKey(quote.ID), normKey(quote.Client), normKey(quote.Assignment));

  if (folder.getFilesByName(name + '.pdf').hasNext() || folder.getFilesByName(name).hasNext()) {
    if (!params.allowDuplicate) return { duplicate: true, name: name };
    name += ' (' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH-mm') + ')';
  }

  var copy = templateFile.makeCopy(name, folder);
  var ss = SpreadsheetApp.openById(copy.getId());

  writeQuoteData(ss, quote, client);
  writeQuoteConfig(ss, normKey(quote.ID), isDate(quote['Expiry date']) ? formatDate(quote['Expiry date']) : '');
  var warnings = layoutInvoiceSheet(ss, params.description.replace(/\s+$/, ''), '', false, CONFIG.quoteTemplate);

  var pdfFile = folder.createFile(exportPdf(ss, CONFIG.quoteTemplate.invoiceSheet, name));
  var draft = params.createDraft ? createDraft(ss, pdfFile, client, CONFIG.quoteTemplate, ['Quote email', 'Invoice email']) : null;

  return { duplicate: false, name: name, sheetUrl: ss.getUrl(), pdfUrl: pdfFile.getUrl(), draft: draft, warnings: warnings };
}

/** Called from the quote dialog and the web app. */
function submitQuote(params) {
  return createQuote(params);
}
