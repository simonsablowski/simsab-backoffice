/**
 * Pure helper functions for keys, IDs, dates and names.
 * No Apps Script services are used here, so the file can be unit-tested in Node.
 */

/** Normalises a cell value so it can be compared as a key (e.g. PO numbers stored as floats). */
function normKey(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Returns a number for numeric cells, or NaN for empty or text cells. */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (value === null || value === undefined || value === '') return NaN;
  var n = Number(String(value).replace(',', '.'));
  return isNaN(n) ? NaN : n;
}

function isBlank(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function isDate(value) {
  return value instanceof Date && !isNaN(value.getTime());
}

function pad2(n) {
  var s = String(n);
  return s.length < 2 ? '0' + s : s;
}

/** Expected invoice ID, e.g. invoice 12 dated 2026 against quote 2026-A05 -> 2026-A12-A05. */
function expectedInvoiceId(invoiceDate, invoiceNumber, quote) {
  var suffix = String(quote).split('-').slice(1).join('-');
  return invoiceDate.getFullYear() + '-A' + pad2(invoiceNumber) + '-' + suffix;
}

/** Formats a date as dd.MM.yyyy. */
function formatDate(d) {
  return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
}

/** Formats a date as yyyy-MM-dd. */
function formatIsoDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

/**
 * Formats a service period in the style used on the invoices:
 * one day "16.03.2026", same month "15.-16.03.2026",
 * same year "29.03.-02.04.2026", otherwise "30.12.2025-02.01.2026".
 */
function formatServicePeriod(start, end) {
  if (!end || start.getTime() === end.getTime()) return formatDate(start);
  if (start.getFullYear() !== end.getFullYear()) {
    return formatDate(start) + '-' + formatDate(end);
  }
  if (start.getMonth() !== end.getMonth()) {
    return pad2(start.getDate()) + '.' + pad2(start.getMonth() + 1) + '.-' + formatDate(end);
  }
  return pad2(start.getDate()) + '.-' + formatDate(end);
}

/** First and last day of the month that contains the given date. */
function monthBounds(d) {
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 0)
  };
}

/** Name used for the invoice spreadsheet copy and the PDF. */
function invoiceFileName(invoiceId, client, assignment) {
  var name = 'Invoice ' + invoiceId + ' - ' + client + ' - ' + assignment;
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

function roundMoney(x) {
  return Math.round(x * 100) / 100;
}

function formatEuro(x) {
  var fixed = roundMoney(x).toFixed(2).split('.');
  var intPart = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '€' + intPart + ',' + fixed[1];
}
