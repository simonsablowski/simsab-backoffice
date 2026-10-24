/**
 * Pure logic for preparing a new invoice row from a client and a PO: which
 * values the row gets and which unbilled time entries and expenses it links.
 * Sheet access is in NewInvoice.js.
 */

/** Largest invoice number in the Invoices records, 0 if there is none. */
function maxInvoiceNumber(invoices) {
  return invoices.reduce(function (m, r) {
    var n = toNumber(r.Number);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
}

/** Daily rate of the latest invoice on the same PO, else on the same quote; NaN if there is none. */
function latestDailyRate(invoices, poKey, quoteKey, excludeRow) {
  var matching = invoices
    .filter(function (o) { return o._row !== excludeRow && toNumber(o['Daily rate']) > 0; })
    .filter(function (o) {
      return (poKey !== '' && normKey(o.PO) === poKey) || (quoteKey !== '' && normKey(o.Quote) === quoteKey);
    })
    .sort(function (a, b) {
      var onPo = (poKey !== '' && normKey(b.PO) === poKey ? 1 : 0) - (poKey !== '' && normKey(a.PO) === poKey ? 1 : 0);
      return onPo || (toNumber(b.Number) || 0) - (toNumber(a.Number) || 0);
    });
  return matching.length > 0 ? toNumber(matching[0]['Daily rate']) : NaN;
}

function withinPeriod(date, from, to) {
  if (!isDate(date)) return true;
  var n = dayNumber(date);
  return (!from || n >= dayNumber(from)) && (!to || n <= dayNumber(to));
}

/** Time entries of the client that are not linked to an invoice yet, within the period. */
function unbilledTimeEntries(ctx, clientName, from, to) {
  return ctx.timeTracking.filter(function (t) {
    return normKey(t.Client) === clientName && isBlank(t.Invoice) && !isNaN(toNumber(t.Hours)) && withinPeriod(t.Date, from, to);
  });
}

/** Expense entries of the client that are not linked to an invoice yet, within the period. */
function unbilledExpenseEntries(ctx, clientName, from, to) {
  return ctx.expenses.filter(function (e) {
    return normKey(e.Client) === clientName && isBlank(e.Invoice) && !isNaN(toNumber(e.Cost)) && withinPeriod(e.Date, from, to);
  });
}

/**
 * Proposes a new invoice row.
 * @param ctx   the records of all tabs, as for the validation
 * @param input {client, po, date (Date), from (Date or null), to (Date or null)}
 * @param options {vatRate, hoursPerDay, moneyTolerance, today (Date)}
 * @return {{errors: string[], warnings: string[], info: string[], row: Object|null,
 *           timeRows: number[], expenseRows: number[], facts: Object}}
 *         timeRows and expenseRows are the sheet rows to link to the new invoice ID.
 */
function prepareInvoiceRow(ctx, input, options) {
  var vatRate = options.vatRate;
  var hoursPerDay = options.hoursPerDay;
  var errors = [];
  var warnings = [];
  var info = [];
  var empty = { errors: errors, warnings: warnings, info: info, row: null, timeRows: [], expenseRows: [], facts: {} };

  var clientName = normKey(input.client);
  var poKey = normKey(input.po);
  var client = ctx.clients.find(function (c) { return normKey(c.Client) === clientName; });
  if (!client) errors.push('Choose a client from the Clients tab.');
  var pos = ctx.purchaseOrders.filter(function (p) { return normKey(p.ID) === poKey; });
  if (poKey === '' || pos.length === 0) errors.push('Choose a PO from the Purchase orders tab.');
  if (errors.length > 0) return empty;

  var po = pos.find(function (p) { return normKey(p.Client) === clientName; });
  if (!po) {
    errors.push('PO ' + poKey + ' belongs to "' + normKey(pos[0].Client) + '", not "' + clientName + '".');
    return empty;
  }
  var quoteKey = normKey(po.Quote);
  if (quoteKey === '') {
    errors.push('PO ' + poKey + ' has no quote in the Purchase orders tab.');
    return empty;
  }
  var quote = ctx.quotes.find(function (q) { return normKey(q.ID) === quoteKey; });
  if (!quote) warnings.push('Quote ' + quoteKey + ' of the PO is not listed in the Quotes tab.');

  var date = isDate(input.date) ? input.date : options.today;
  var number = maxInvoiceNumber(ctx.invoices) + 1;
  var id = expectedInvoiceId(date, number, quoteKey);
  var assignment = !isBlank(po.Assignment) ? po.Assignment : (quote ? quote.Assignment : '');

  var timeEntries = unbilledTimeEntries(ctx, clientName, input.from, input.to);
  var hours = sumBy(timeEntries, function (t) { return toNumber(t.Hours); });
  var days = hours > 0 ? suggestedDays(hours, hoursPerDay) : null;
  var expenseEntries = unbilledExpenseEntries(ctx, clientName, input.from, input.to);
  var gross = sumBy(expenseEntries, function (e) { return toNumber(e.Cost); });
  var net = roundMoney(gross / (1 + vatRate));

  var rate = latestDailyRate(ctx.invoices, poKey, quoteKey, -1);
  if (!isNaN(rate)) {
    info.push('Daily rate ' + formatEuro(rate) + ' from the latest invoice on this PO or quote.');
  } else {
    var allowed = allowedDailyRates(ctx, clientName, hoursPerDay).filter(function (r, i, all) { return all.indexOf(r) === i; });
    if (allowed.length === 1) {
      rate = allowed[0];
      info.push('Daily rate ' + formatEuro(rate) + ' from the tier of the client.');
    } else {
      warnings.push('No daily rate could be proposed. Enter it in the new row.');
    }
  }

  if (timeEntries.length === 0) {
    warnings.push('There are no unbilled time entries for ' + clientName + (input.from || input.to ? ' in this period' : '') + '.');
  } else {
    info.push(timeEntries.length + ' unbilled time entries, ' + hours + ' h, proposed as ' + days + ' days.');
  }
  if (expenseEntries.length > 0) {
    info.push(expenseEntries.length + ' unbilled expenses: ' + formatEuro(gross) + ' gross, proposed as ' + formatEuro(net) + ' net.');
  }

  var facts = { number: number, id: id, hours: hours, days: days, expensesGross: roundMoney(gross), expensesNet: net };
  if (!isNaN(rate) && days !== null) {
    var budget = sumBy(pos, function (p) { return toNumber(p.Amount); });
    var invoiced = sumBy(ctx.invoices.filter(function (o) { return normKey(o.PO) === poKey; }), serviceAmount);
    facts.poRemaining = roundMoney(budget - invoiced - rate * days);
    if (budget > 0 && facts.poRemaining < -options.moneyTolerance) {
      warnings.push('PO ' + poKey + ' would be exceeded by ' + formatEuro(-facts.poRemaining) + ' with this invoice.');
    }
  }

  return {
    errors: errors,
    warnings: warnings,
    info: info,
    row: {
      Number: number, Date: date, Period: date, Client: client.Client, Assignment: assignment, Quote: po.Quote, PO: po.ID,
      ID: id, 'Daily rate': isNaN(rate) ? '' : rate, 'Number of days': days === null ? '' : days, Expenses: net
    },
    timeRows: timeEntries.map(function (t) { return t._row; }),
    expenseRows: expenseEntries.map(function (e) { return e._row; }),
    facts: facts
  };
}
