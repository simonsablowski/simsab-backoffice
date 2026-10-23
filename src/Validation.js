/**
 * Pure validation of invoice rows against the other tabs of the Business sheet.
 *
 * The context object holds arrays of records, one object per sheet row, keyed
 * by the header names of each tab:
 *   { clients, rates, quotes, purchaseOrders, invoices, expenses, timeTracking }
 * Each record may carry a `_row` property with its sheet row number.
 */

var REQUIRED_INVOICE_FIELDS = ['Number', 'Date', 'Period', 'Client', 'Assignment', 'Quote', 'PO', 'ID', 'Daily rate', 'Number of days'];

function sumBy(records, fn) {
  return records.reduce(function (s, r) {
    var v = fn(r);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
}

/** Time entries linked to an invoice ID. */
function timeEntriesFor(ctx, invoiceId) {
  return ctx.timeTracking.filter(function (t) { return normKey(t.Invoice) === invoiceId; });
}

/** Expense entries linked to an invoice ID. */
function expenseEntriesFor(ctx, invoiceId) {
  return ctx.expenses.filter(function (e) { return normKey(e.Invoice) === invoiceId; });
}

/** Allowed daily rates for a client, derived from its tier and the Rates tab. */
function allowedDailyRates(ctx, clientName, hoursPerDay) {
  var client = ctx.clients.find(function (c) { return normKey(c.Client) === clientName; });
  if (!client) return [];
  var tier = normKey(client.Tier);
  return ctx.rates
    .filter(function (r) { return normKey(r.Tier) === tier; })
    .map(function (r) { return toNumber(r.Rate) * hoursPerDay; })
    .filter(function (x) { return !isNaN(x); });
}

/** Tracked hours converted to days and rounded up to the next quarter day. */
function suggestedDays(hours, hoursPerDay) {
  return Math.ceil((hours / hoursPerDay) * 4 - 1e-9) / 4;
}

/** Service amount (daily rate x days, without expenses) of an invoice record. */
function serviceAmount(inv) {
  var rate = toNumber(inv['Daily rate']);
  var days = toNumber(inv['Number of days']);
  return (isNaN(rate) ? 0 : rate) * (isNaN(days) ? 0 : days);
}

/**
 * Proposed service period: the range of tracked dates within the invoiced
 * month (preparation in earlier months is ignored), else all tracked dates,
 * else the whole invoiced month.
 */
function proposedServicePeriod(ctx, inv) {
  var base = isDate(inv.Period) ? inv.Period : inv.Date;
  var dates = timeEntriesFor(ctx, normKey(inv.ID))
    .map(function (t) { return t.Date; })
    .filter(isDate)
    .sort(function (a, b) { return a - b; });
  if (isDate(base)) {
    var inMonth = dates.filter(function (x) {
      return x.getFullYear() === base.getFullYear() && x.getMonth() === base.getMonth();
    });
    if (inMonth.length > 0) dates = inMonth;
  }
  if (dates.length > 0) return formatServicePeriod(dates[0], dates[dates.length - 1]);
  if (!isDate(base)) return '';
  var m = monthBounds(base);
  return formatServicePeriod(m.start, m.end);
}

/**
 * Validates one invoice record.
 * @return {{errors: string[], warnings: string[], info: string[], facts: Object}}
 */
function validateInvoice(inv, ctx, options) {
  var opts = options || {};
  var vatRate = opts.vatRate !== undefined ? opts.vatRate : 0.19;
  var hoursPerDay = opts.hoursPerDay || 8;
  var tol = opts.moneyTolerance || 0.01;

  var errors = [];
  var warnings = [];
  var info = [];
  var facts = {};

  var id = normKey(inv.ID);
  var clientName = normKey(inv.Client);
  var quoteKey = normKey(inv.Quote);
  var poKey = normKey(inv.PO);
  var number = toNumber(inv.Number);
  var rate = toNumber(inv['Daily rate']);
  var days = toNumber(inv['Number of days']);
  var invoicedExpenses = toNumber(inv.Expenses);
  if (isNaN(invoicedExpenses)) invoicedExpenses = 0;

  // Required fields
  REQUIRED_INVOICE_FIELDS.forEach(function (f) {
    if (isBlank(inv[f])) errors.push('Field "' + f + '" is empty.');
  });
  if (!isBlank(inv.Date) && !isDate(inv.Date)) errors.push('"Date" is not a date.');
  if (!isBlank(inv.Period) && !isDate(inv.Period)) errors.push('"Period" is not a date.');

  // ID and numbering
  if (isDate(inv.Date) && !isNaN(number) && quoteKey) {
    var expected = expectedInvoiceId(inv.Date, number, quoteKey);
    if (id && id !== expected) {
      errors.push('ID is "' + id + '", but date, number and quote give "' + expected + '".');
    }
  }
  var others = ctx.invoices.filter(function (o) { return o !== inv && !isBlank(o.Number); });
  if (id && others.some(function (o) { return normKey(o.ID) === id; })) {
    errors.push('ID "' + id + '" is used by another invoice.');
  }
  if (!isNaN(number)) {
    if (others.some(function (o) { return toNumber(o.Number) === number; })) {
      errors.push('Invoice number ' + number + ' is used by another invoice.');
    }
    if (number > 1 && !others.some(function (o) { return toNumber(o.Number) === number - 1; })) {
      warnings.push('There is no invoice with number ' + (number - 1) + ', so the numbering has a gap.');
    }
    var previous = others
      .filter(function (o) { return toNumber(o.Number) < number && isDate(o.Date); })
      .sort(function (a, b) { return toNumber(b.Number) - toNumber(a.Number); })[0];
    if (previous && isDate(inv.Date) && inv.Date < previous.Date) {
      warnings.push('Invoice date ' + formatDate(inv.Date) + ' is earlier than the date of invoice ' +
        toNumber(previous.Number) + ' (' + formatDate(previous.Date) + ').');
    }
  }
  if (isDate(inv.Date) && isDate(inv.Period) &&
      (inv.Period.getFullYear() * 12 + inv.Period.getMonth()) > (inv.Date.getFullYear() * 12 + inv.Date.getMonth())) {
    warnings.push('The invoiced period lies after the invoice date.');
  }

  // Client
  var client = ctx.clients.find(function (c) { return normKey(c.Client) === clientName; });
  if (clientName && !client) {
    errors.push('Client "' + clientName + '" is not listed in the Clients tab.');
  } else if (client && isBlank(client.Address)) {
    errors.push('Client "' + clientName + '" has no address in the Clients tab.');
  }

  // Quote
  var quote = ctx.quotes.find(function (q) { return normKey(q.ID) === quoteKey; });
  if (quoteKey && !quote) {
    errors.push('Quote "' + quoteKey + '" is not listed in the Quotes tab.');
  } else if (quote && normKey(quote.Client) !== clientName) {
    warnings.push('Quote ' + quoteKey + ' belongs to "' + normKey(quote.Client) + '", not "' + clientName + '".');
  }

  // Purchase order and budget
  var pos = ctx.purchaseOrders.filter(function (p) { return normKey(p.ID) === poKey; });
  if (poKey && pos.length === 0) {
    errors.push('PO "' + poKey + '" is not listed in the Purchase orders tab.');
  } else if (pos.length > 0) {
    if (!pos.some(function (p) { return normKey(p.Quote) === quoteKey; })) {
      warnings.push('PO ' + poKey + ' refers to quote ' + normKey(pos[0].Quote) + ', not ' + quoteKey + '.');
    }
    if (!pos.some(function (p) { return normKey(p.Client) === clientName; })) {
      warnings.push('PO ' + poKey + ' belongs to "' + normKey(pos[0].Client) + '", not "' + clientName + '".');
    }
    var budget = sumBy(pos, function (p) { return toNumber(p.Amount); });
    var invoicedOnPo = sumBy(ctx.invoices.filter(function (o) {
      return normKey(o.PO) === poKey && !isBlank(o.Number) && toNumber(o.Number) <= number;
    }), serviceAmount);
    facts.poBudget = roundMoney(budget);
    facts.poInvoiced = roundMoney(invoicedOnPo);
    facts.poRemaining = roundMoney(budget - invoicedOnPo);
    if (invoicedOnPo > budget + tol) {
      warnings.push('PO ' + poKey + ' is exceeded: ' + formatEuro(invoicedOnPo) + ' invoiced (services, including this invoice) against a budget of ' + formatEuro(budget) + '.');
    } else if (budget > 0) {
      info.push('PO ' + poKey + ': ' + formatEuro(invoicedOnPo) + ' of ' + formatEuro(budget) + ' used, ' + formatEuro(budget - invoicedOnPo) + ' remaining after this invoice.');
    }
  }

  // Rate and days
  if (!isNaN(days) && days <= 0) warnings.push('Number of days is ' + days + ', so the invoice has no services.');
  if (!isNaN(days) && Math.abs(days * 4 - Math.round(days * 4)) > 1e-9) {
    warnings.push('Number of days (' + days + ') is not a multiple of a quarter day.');
  }
  if (!isNaN(rate) && rate > 0 && clientName) {
    var allowed = allowedDailyRates(ctx, clientName, hoursPerDay);
    if (allowed.length > 0 && allowed.indexOf(rate) === -1) {
      warnings.push('Daily rate ' + formatEuro(rate) + ' does not match the tier rates for ' + clientName +
        ' (' + allowed.map(formatEuro).join(', ') + ').');
    }
  }

  // Totals in the row must follow from rate, days and expenses
  var expectedAmount = serviceAmount(inv) + invoicedExpenses;
  var expectedTax = expectedAmount * vatRate;
  [['Amount', expectedAmount], ['Tax', expectedTax], ['Amount with tax', expectedAmount + expectedTax]].forEach(function (pair) {
    var actual = toNumber(inv[pair[0]]);
    if (!isBlank(inv[pair[0]]) && (isNaN(actual) || Math.abs(actual - pair[1]) > tol)) {
      errors.push('"' + pair[0] + '" is ' + inv[pair[0]] + ', expected ' + formatEuro(pair[1]) + '.');
    }
  });
  facts.amount = roundMoney(expectedAmount);
  facts.tax = roundMoney(expectedTax);
  facts.total = roundMoney(expectedAmount + expectedTax);

  // Tracked time
  var entries = timeEntriesFor(ctx, id);
  var hours = sumBy(entries, function (t) { return toNumber(t.Hours); });
  facts.trackedHours = hours;
  facts.trackedDays = hours / hoursPerDay;
  facts.trackedRevenue = roundMoney(sumBy(entries, function (t) { return toNumber(t.Hours) * toNumber(t.Rate); }));
  facts.suggestedDays = suggestedDays(hours, hoursPerDay);
  if (id && entries.length === 0) {
    warnings.push('No time entries are linked to ' + id + ' in the Time tracking tab.');
  } else if (entries.length > 0) {
    info.push('Tracked: ' + hours + ' h, which is ' + roundMoney(hours / hoursPerDay) + ' days at ' + hoursPerDay +
      ' h/day, rounded up to ' + facts.suggestedDays + '. Billed: ' + days + ' days (' + formatEuro(serviceAmount(inv)) + ').');
    if (!isNaN(days) && days < facts.suggestedDays - 1e-9) {
      warnings.push('Billed days (' + days + ') are fewer than the tracked time rounded up (' + facts.suggestedDays +
        '). Check whether hours were left out.');
    }
  }

  // Expenses
  var expenseEntries = expenseEntriesFor(ctx, id);
  var gross = sumBy(expenseEntries, function (e) { return toNumber(e.Cost); });
  var net = gross / (1 + vatRate);
  facts.expensesGross = roundMoney(gross);
  facts.expensesNet = roundMoney(net);
  if (expenseEntries.length > 0 || invoicedExpenses !== 0) {
    var matchesGross = Math.abs(invoicedExpenses - gross) < tol;
    var matchesNet = Math.abs(invoicedExpenses - net) < tol;
    if (!matchesGross && !matchesNet) {
      warnings.push('Invoiced expenses are ' + formatEuro(invoicedExpenses) + ', but the Expenses tab lists ' +
        formatEuro(gross) + ' gross (' + formatEuro(net) + ' net) for ' + id + '.');
    } else {
      info.push('Expenses: ' + formatEuro(invoicedExpenses) + ' (' + (matchesNet && !matchesGross ? 'net' : 'gross') +
        ' of ' + expenseEntries.length + ' entries).');
    }
  }

  // Unbilled time for the same client
  var unbilled = ctx.timeTracking.filter(function (t) {
    return normKey(t.Client) === clientName && isBlank(t.Invoice) && !isBlank(t.Hours);
  });
  if (unbilled.length > 0) {
    warnings.push(unbilled.length + ' time entries for ' + clientName + ' (' +
      sumBy(unbilled, function (t) { return toNumber(t.Hours); }) + ' h) are not linked to any invoice.');
  }

  return { errors: errors, warnings: warnings, info: info, facts: facts };
}
