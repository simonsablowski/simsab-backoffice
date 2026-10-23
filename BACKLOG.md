# Backlog

Guiding rule: all data stays in the Business Google Sheet. The script only helps and checks; every step must remain possible by hand.

Status: **done** (implemented, not yet deployed), **next**, **later**, **open question**.

## Invoicing

| # | Item | Status |
|---|------|--------|
| 1 | Create invoice from a row in the Invoices tab: copy the template, fill in data, service period and description, keep the footer at the page bottom, export the PDF to Drive | done |
| 2 | Optional Gmail draft with the PDF attached (subject and body from the template's Message tab, recipient from an optional "Invoice email" column in Clients) | done |
| 3 | Validate the invoice row before creating it: ID format, unique number, client, quote, PO, totals, tier rates, PO budget, linked time and expenses | done |
| 4 | Warn when billed days are fewer than tracked hours rounded up to quarter days (billing more is allowed as margin) | done |
| 5 | Report of all invoices with errors and warnings | done |
| 6 | Generated invoice sheets store fixed values, so issued invoices no longer change when the Business sheet changes | done |
| 7 | Calibrate description height and spacer row with real invoices (chars per line, line height) | next |
| 8 | Prepare a new invoice row: choose client and PO, link unbilled time entries and expenses, propose days and net expenses | next |
| 9 | Payment tracking: due date from payment terms, overdue highlighting | later |
| 10 | E-invoice format (ZUGFeRD or XRechnung) for B2B invoices in Germany, required for issuing from 2028 for small businesses | later |
| 11 | Calculate expenses on the invoice from the Expenses tab (net) instead of typing them | later |

## Data consistency in the Business sheet

| # | Item | Status |
|---|------|--------|
| 12 | Auto-fill dependent values while editing: PO fills client, quote and assignment; quote fills client and assignment; new rows get number, date, ID formula, daily rate and totals | done |
| 13 | Highlight inconsistent relations directly in the sheet (conditional formatting that works without the script): quote vs client, PO vs quote and client, ID format, duplicate numbers, invoice links in Time tracking and Expenses | next |
| 14 | Dropdowns limited to matching values (e.g. only POs of the selected client) | later |
| 15 | Central VAT rate instead of 19% in every formula and label | later |
| 16 | Activity column in Time tracking so the hourly rate follows from tier and activity | open question |
| 17 | Make intentional billing adjustments explicit (e.g. a note column) so they are not confused with forgotten hours | open question |

## Quotes and purchase orders

| # | Item | Status |
|---|------|--------|
| 18 | Remaining budget per PO visible in the Purchase orders tab | later |
| 19 | Quote expiry highlighting and status updates | later |
| 20 | Generate quote documents from the Quotes tab, like invoices | later |

## Engineering

| # | Item | Status |
|---|------|--------|
| 23 | Private web app for creating invoices, checking and settings on the phone | done |
| 21 | Apps Script project with unit tests and automatic deployment via GitHub Actions | done |
| 22 | One-time setup: script ID, clasp credentials as GitHub secret, template and folder settings | next (needs Simon) |
