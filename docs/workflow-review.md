# Review of the Business sheet workflow

Basis: an export of the Business sheet as of October 2026 and one recent invoice.

## Current workflow

1. A quote is added to the Quotes tab. The ID is a formula (e.g. `2026-A05`).
2. When the client sends a PO, it is added to the Purchase orders tab with a reference to the quote.
3. Work is tracked in the Time tracking tab with client, hours, hourly rate and a typed invoice ID.
4. Travel costs are added to the Expenses tab with a typed invoice ID.
5. At the end of the month a row is added to the Invoices tab. Number, date, period, client, assignment, quote, PO, ID, daily rate, days and expenses are entered by hand; amount and tax are formulas.
6. The previous invoice sheet is copied. It imports the Invoices tab via IMPORTRANGE and selects the row by the ID in Config!B1. Service period and description are edited by hand, and the spacer row is resized so the footer stays at the bottom.
7. The invoice is downloaded as PDF and sent by mail. The payment date is entered later.

## Findings from the data

Running the new validation over all existing invoices found a small number of rows with errors and a larger number with warnings. Most warnings are probably deliberate decisions, but the sheet has no way to tell them apart from mistakes. The types of findings, from most to least frequent:

| Finding | Comment |
|---------|---------|
| Billed days fewer than tracked hours rounded up to quarter days | Either a deliberate discount or forgotten hours. |
| PO recorded for a different quote than the invoice | May be a PO that was extended to a later quote, but then the Purchase orders tab should say so. |
| PO budget exceeded | Not visible in the sheet today. |
| Invoiced expenses differ from the Expenses tab | Expenses are usually invoiced net (gross / 1.19), but not always. |
| Daily rate does not match the client tier | May be individually agreed rates; the Rates tab does not show such agreements. |
| Invoice ID does not match number and quote | The ID is typed, not calculated. |
| Invoice date earlier than the previous invoice | Numbering and date order differ. |
| Days not a multiple of a quarter day | E.g. 0.375 days. |

## Weak points in the process

- **Typed keys.** The invoice ID is typed in four places (Invoices, Time tracking, Expenses, Config of the invoice copy). Quote and PO are chosen independently of each other. Any typo breaks a relation without being noticed.
- **Values that could be derived.** Hourly rate per time entry, daily rate, days, expenses on the invoice, the invoice ID and the VAT rate are entered or hard-coded although they follow from other data.
- **Living invoice copies.** Invoice sheets import the Invoices tab via IMPORTRANGE. If a row is changed later, the old invoice sheet shows different values than the PDF that was sent.
- **Manual layout.** The spacer row has to be adjusted by hand for each description length.
- **No overview of open items.** Remaining PO budget, unbilled hours, open and overdue invoices and expiring quotes are not visible without filtering.
- **VAT in many places.** 19% is written into formulas in Quotes, Purchase orders and Invoices and into the label of the template.

## Improvements

Implemented in this repository:

1. Invoice creation with validation, fixed values in the copy, automatic spacer, PDF export and optional Gmail draft.
2. Report of all invoices with errors and warnings.
3. Automatic filling of dependent values while editing (PO fills client, quote and assignment; new rows get number, dates, ID formula and totals).
4. Conditional formatting that highlights inconsistent relations directly in the sheet, also without the script.

Proposed next steps, in order of benefit:

1. **Prepare the invoice row** from client and PO: link unbilled time entries and expenses, propose days (tracked hours rounded up) and net expenses. This removes most of the typing in step 5.
2. **Remaining budget per PO**: a formula column `Invoiced` and `Remaining` in the Purchase orders tab (SUMIFS over Invoices). Works without the script.
3. **Payment overview**: `Due date` column (date + payment terms) and highlighting of unpaid invoices past the due date.
4. **Explicit billing adjustments**: a note or adjustment column in Invoices for deliberate deviations from tracked hours, so that the validation can tell them apart from mistakes.
5. **Activity in Time tracking** (coaching, training): the hourly rate then follows from tier and activity, and the Rates tab becomes the single source for rates.
6. **One VAT cell** referenced by all formulas.
7. **Quote documents** generated like invoices.

## E-invoicing

German B2B invoicing is moving to structured e-invoices. All domestic businesses have to be able to receive e-invoices since 1 January 2025. In 2027, issuers with a turnover of up to €800,000 in 2026 may still send PDF invoices with the recipient's consent. From 2028 the e-invoice requirement applies to all domestic B2B invoices. A PDF sent by email does not count as an e-invoice; accepted formats follow EN 16931, for example ZUGFeRD from version 2.0.1 or XRechnung.

For this tool that means: PDF invoices are fine for now, but before 2028 the invoice generation should produce a ZUGFeRD or XRechnung file. Invoices to clients abroad follow other rules. This is not tax advice; please confirm the details with your tax adviser.

Source: [IHK Stuttgart, E-Rechnungen](https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/steuerrecht/steuermeldungen/e-rechnungen-5864496)
