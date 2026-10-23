/**
 * Static configuration. IDs of the invoice template and the output folder are
 * stored in Script Properties (menu Backoffice > Settings) so that they are
 * not part of the repository.
 */
var CONFIG = {
  sheets: {
    clients: 'Clients',
    rates: 'Rates',
    quotes: 'Quotes',
    purchaseOrders: 'Purchase orders',
    invoices: 'Invoices',
    expenses: 'Expenses',
    timeTracking: 'Time tracking'
  },

  vatRate: 0.19,
  hoursPerDay: 8,

  // Tolerance for comparing money amounts in euros.
  moneyTolerance: 0.01,

  // Sheet names inside the invoice template.
  template: {
    invoiceSheet: 'Invoice',
    configSheet: 'Config',
    dataSheet: 'Data',
    messageSheet: 'Message',
    // Helper sheet in older invoice copies that imports the Business sheet.
    importSheet: 'Invoices',
    // Formulas used to locate rows in the invoice sheet, so that the script
    // does not depend on fixed row numbers.
    descriptionRowMarker: '=Data!F2',
    expensesRowMarker: '=Data!H2',
    footerRowMarker: '=Config!B20',
    configLabels: {
      invoiceId: 'Invoice ID',
      servicePeriod: 'Service period'
    },
    defaultExpenseLabel: 'Reisekosten (Flüge, Hotel, Transfers)'
  },

  // Layout of the description cell. The script sets its height explicitly
  // and resizes the spacer row so that the footer stays at the page bottom.
  layout: {
    charsPerLine: 45,
    lineHeightPx: 18,
    paddingPx: 6,
    minSpacerPx: 10,
    // Added to the calculated spacer height; negative values move the footer up.
    spacerAdjustPx: 0
  },

  // Parameters for the PDF export of the invoice sheet.
  pdf: {
    size: 'A4',
    portrait: true,
    fitw: true,
    gridlines: false,
    printtitle: false,
    sheetnames: false,
    pagenum: 'UNDEFINED',
    fzr: false,
    // Margins in inches. The invoice design has coloured bands that run to the
    // page edges, so the default is no margin. Override with PDF_MARGIN.
    top_margin: 0,
    bottom_margin: 0,
    left_margin: 0,
    right_margin: 0
  },

  propertyKeys: {
    businessId: 'BUSINESS_SPREADSHEET_ID',
    templateId: 'TEMPLATE_SPREADSHEET_ID',
    folderId: 'OUTPUT_FOLDER_ID'
  }
};
