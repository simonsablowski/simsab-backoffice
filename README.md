# simsab-backoffice

Internal tool to simplify and partly automate administrative work for my independent practice, starting with validated invoicing.

It is a Google Apps Script bound to the Business Google Sheet. All data stays in the sheet. The script only helps and checks, so every step remains possible by hand.

## What it does

The script adds a **Backoffice** menu to the Business sheet.

**Prepare invoice row…** takes a client and one of its POs and proposes the whole row for the Invoices tab: next number, date, ID formula, quote and assignment from the PO, daily rate from the latest invoice on the PO or quote (else from the client tier if it is unambiguous), days as the tracked hours of all unbilled time entries rounded up to quarter days, and expenses as the net sum of the unbilled expenses. Optionally limit the entries to a period. After you confirm, the row is written (it can still be edited by hand) and the time entries and expenses are linked to the new invoice ID. The same function is in the **New row** tab of the web app.

**Create invoice…** opens a dialog for one row of the Invoices tab. It shows the validation results for the row, proposes the service period from the linked time entries and prefills the description from the latest invoice for the same quote. After you confirm, it

1. copies the invoice template into the output folder,
2. writes the invoice data as fixed values into the copy, so the issued invoice does not change later,
3. sets invoice ID, service period, description and the expenses line (the expenses row is removed if there are none),
4. resizes the spacer row so the footer stays at the bottom of the page,
5. exports the invoice tab as PDF into the same folder,
6. optionally creates a Gmail draft with the PDF attached. The recipient is taken from an optional `Invoice email` column in the Clients tab.

**Set up payment tracking…** adds a `Due date` column to the Invoices tab (a formula: invoice date plus the payment terms in days from an optional `Payment terms` column in the Clients tab, otherwise 14 days) and highlights unpaid invoices past the due date in amber. An invoice counts as unpaid while its `Paid` column is empty. Both are part of the sheet and work without the script; new invoice rows get the formula automatically. The column names and the default terms are in `Config.js` (`payment`).

**Limit dropdowns to matching values…** limits the Quote and PO cells in the Invoices tab to the quotes and POs of the chosen client (and the POs to the chosen quote, if the client has POs for it), and the Quote cell in the Purchase orders tab to the quotes of the client. The lists are set per row while you edit, and this menu item applies them to all existing rows. Other values can still be typed: they are accepted and marked with the sheet's warning, and the red highlighting still shows relations that do not fit.

**Show remaining PO budgets…** adds the columns `Invoiced` and `Remaining` to the Purchase orders tab if they are missing. Both are formulas (`SUMIFS` over the Invoices tab), so they work without the script, and new PO rows get them automatically. `Invoiced` is the service amount of all invoices on the PO (Amount minus Expenses, like in the validation), `Remaining` is the budget of all rows with the same PO ID minus `Invoiced`. A negative remaining budget is highlighted in red.

**Create quote…** works like creating an invoice, for a row of the Quotes tab: it validates the row (required fields, ID following from issue date and number, unique ID and number, client with address, totals, expiry date), copies the quote template, writes the quote data as fixed values, sets the quote ID, valid-until date and description, resizes the spacer row so the footer stays at the bottom, exports the PDF into the output folder and optionally creates a Gmail draft. The recipient is taken from an optional `Quote email` column in the Clients tab, else from `Invoice email`. The same function is in the **Quote** tab of the web app.

The quote template is a Google Sheet built like the invoice template (the easiest start is a copy of it). Set its link under Settings (`Quote template`). It needs:

- a tab `Quote` that is exported as PDF, with the description in the row whose column E contains the formula `=Data!F2` and the footer in the row whose column B contains `=Config!B20`;
- a tab `Config` with a row labelled `Quote ID` (the script writes the ID into column B) and optionally a row `Valid until`;
- a tab `Data`, which the script replaces with fixed values: `ID`, `Client`, `Issue date`, `Expiry date`, `Assignment`, `Amount`, `Tax`, `Amount with tax`, `Address`;
- optionally a tab `Message` with the mail subject in `A1` and the body in `A3`.

Tab names and markers are in `Config.js` (`quoteTemplate`). There is no expenses row in a quote.

**Check all invoices…** validates every row in the Invoices tab and lists errors and warnings.

**Highlight inconsistent values…** adds conditional formatting rules to the Business sheet. Cells turn red when a quote does not belong to the client, a PO does not match quote and client, an invoice ID does not follow from date, number and quote, an invoice number is used twice, or a time entry or expense points to an invoice of another client. The rules are part of the sheet and work without the script.

**Web app for the phone.** The Sheets mobile app does not show custom menus, so the same functions are available as a private web app (only you can open it): create invoices, check all invoices, change settings and install the highlighting. Open the link from the deployment (Apps Script editor > Deploy > Manage deployments) and add it to your home screen.

**While editing**, dependent values are filled in automatically, but only into empty cells:

| Tab | When you set | The script fills in |
|-----|--------------|---------------------|
| Invoices | PO | Client, Quote, Assignment |
| Invoices | Quote | Client, Assignment |
| Invoices | any of Client, Quote, PO in a new row | Number, Date, Period, ID formula, Daily rate (from the last invoice on the same PO or quote), Expenses 0, Amount, Tax and total formulas |
| Purchase orders | Quote | Client, Assignment, tax formulas |
| Quotes | Client or Assignment in a new row | Number, Issue date, Expiry date (+1 month), ID formula, tax formulas |
| Time tracking | Client | Rate (latest rate for this client), Revenue formula |

## Validation rules

Errors block invoice creation unless you confirm. Warnings are shown but do not block.

Errors: required fields missing, ID does not match date, number and quote, duplicate ID or number, client, quote or PO not found, client without address, Amount, Tax or total not following from rate, days and expenses.

Warnings: gap in numbering, invoice date earlier than the previous invoice, quote or PO belonging to another client or quote, PO budget exceeded, days not a multiple of a quarter day, daily rate not matching the client tier, no linked time entries, billed days fewer than tracked hours rounded up to quarter days, invoiced expenses matching neither the gross nor the net sum in the Expenses tab, unlinked time entries for the client.

Billing more days than tracked is allowed, as it covers coordination and preparation that is not tracked.

## Setup

### 1. Create the Apps Script project

1. Open the Business sheet and choose **Extensions > Apps Script**. This creates a script bound to the sheet.
2. In the Apps Script editor open **Project Settings** and copy the **Script ID**.
3. Enable the Apps Script API for your account at <https://script.google.com/home/usersettings>.

### 2. Connect GitHub Actions

On your computer, in the repository folder (requires Node.js 22):

```
npm install
npx clasp login
```

This opens a browser for the Google login and writes `.clasprc.json` into your user folder (`C:\Users\<you>\.clasprc.json` on Windows).

In the GitHub repository settings:

- **Secrets and variables > Actions > Secrets**: add `CLASPRC_JSON` with the full content of `.clasprc.json`.
- **Secrets and variables > Actions > Variables**: add `SCRIPT_ID` with the script ID from step 1, and `DEPLOYMENT_ID` with the ID of the web app deployment, so the web app is updated on every push.

Every push to `main` now runs the tests and deploys the code to the sheet. The workflow can also be started by hand under **Actions**.

To deploy from your computer instead, create `.clasp.json` (not committed):

```json
{ "scriptId": "<script ID>", "rootDir": "src" }
```

and run `npm run push`.

### 3. First use in the sheet

1. Reload the Business sheet. The **Backoffice** menu appears.
2. Choose **Backoffice > Settings…** and enter
   - the link to the invoice template (a dedicated template, or your latest invoice sheet), and
   - the link to the Drive folder for new invoices (optional, default is the folder of the template).
3. The first run asks for permissions: Sheets, Drive (copy template, save PDF), external requests (PDF export), and Gmail compose (drafts only, the script cannot read or send mail).

## Invoice template

The script finds rows by their formulas, not by fixed row numbers:

- the description row has `=Data!F2` in column E,
- the expenses row has `=Data!H2` in column E,
- the footer row has `=Config!B20` in column B, and the row directly above it is the spacer.

The Config tab needs the labels `Invoice ID` and `Service period` in column A. The Data tab is overwritten with fixed values in each copy.

For manual invoices, copy the template (not a generated invoice), because generated invoices contain fixed values instead of the import from the Business sheet.

### Layout calibration

The description height is estimated from the text length. If the footer is not exactly at the page bottom, adjust these Script Properties in the Apps Script editor under **Project Settings > Script properties**:

| Property | Default | Meaning |
|----------|---------|---------|
| `LAYOUT_CHARS_PER_LINE` | 45 | characters per line in the description cell |
| `LAYOUT_LINE_HEIGHT_PX` | 18 | height of one text line |
| `LAYOUT_PADDING_PX` | 6 | extra height of the description row |
| `LAYOUT_MIN_SPACER_PX` | 10 | smallest spacer height |

## Development

```
npm install
npm test
```

The pure logic (`Config.js`, `Format.js`, `Layout.js`, `Validation.js`, and the formula parts of `Relations.js` and `Rules.js`) runs in Node and is covered by unit tests. Files that use Apps Script services (`Sheets.js`, `Invoice.js`, `Code.js`) can only be tested in the sheet.

Commit messages are in English.

See [BACKLOG.md](BACKLOG.md) for planned work and [docs/workflow-review.md](docs/workflow-review.md) for the review of the sheet-based workflow.
