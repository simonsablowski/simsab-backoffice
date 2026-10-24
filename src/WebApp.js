/**
 * Web app for using the Backoffice on the phone, where the Sheets app does not
 * show custom menus. Deployed with access for the owner only.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Web').evaluate()
    .setTitle('Backoffice')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function fileLink(id, isFolder) {
  if (!id) return '';
  return isFolder ? 'https://drive.google.com/drive/folders/' + id : 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
}

/** Current settings for the settings page. */
function getSettings() {
  var props = PropertiesService.getScriptProperties();
  var keys = CONFIG.propertyKeys;
  return {
    business: fileLink(props.getProperty(keys.businessId), false),
    template: fileLink(props.getProperty(keys.templateId), false),
    quoteTemplate: fileLink(props.getProperty(keys.quoteTemplateId), false),
    folder: fileLink(props.getProperty(keys.folderId), true),
    layout: LAYOUT_FIELDS.map(function (f) {
      return { key: f.key, label: f.label, hint: f.hint, value: props.getProperty(f.key) || '', defaultValue: f.defaultValue };
    })
  };
}

/** Layout values that can be tuned from the settings page; empty means default. */
var LAYOUT_FIELDS = [
  { key: 'PDF_MARGIN', label: 'PDF margin (inches)', hint: 'Same margin on all sides.', defaultValue: CONFIG.pdf.top_margin },
  { key: 'LAYOUT_SPACER_ADJUST_PX', label: 'Footer position adjustment (px)', hint: 'Positive moves the footer down, negative moves it up.', defaultValue: CONFIG.layout.spacerAdjustPx },
  { key: 'LAYOUT_CHARS_PER_LINE', label: 'Description: characters per line', hint: 'Lower it if long descriptions push the footer down.', defaultValue: CONFIG.layout.charsPerLine },
  { key: 'LAYOUT_LINE_HEIGHT_PX', label: 'Description: line height (px)', hint: '', defaultValue: CONFIG.layout.lineHeightPx }
];

/**
 * Saves settings from the settings page. Empty fields keep the current value,
 * "-" clears the output folder (the template's folder is used then).
 */
function saveSettings(input) {
  var props = PropertiesService.getScriptProperties();
  var keys = CONFIG.propertyKeys;
  var checks = [
    ['business', keys.businessId, function (id) { SpreadsheetApp.openById(id); }],
    ['template', keys.templateId, function (id) { DriveApp.getFileById(id); }],
    ['quoteTemplate', keys.quoteTemplateId, function (id) { DriveApp.getFileById(id); }],
    ['folder', keys.folderId, function (id) { DriveApp.getFolderById(id); }]
  ];
  checks.forEach(function (c) {
    var text = String(input[c[0]] || '').trim();
    if (!text) return;
    if (c[0] === 'folder' && text === '-') { props.deleteProperty(c[1]); return; }
    var id = extractDriveId(text);
    if (!id) throw new Error('Could not read a Google Drive link for ' + c[0] + '.');
    try { c[2](id); } catch (e) { throw new Error('No access to the ' + c[0] + ' link. Please check it.'); }
    props.setProperty(c[1], id);
  });
  var layout = input.layout || {};
  LAYOUT_FIELDS.forEach(function (f) {
    if (!(f.key in layout)) return;
    var text = String(layout[f.key]).trim().replace(',', '.');
    if (text === '') { props.deleteProperty(f.key); return; }
    if (isNaN(Number(text))) throw new Error('"' + f.label + '" must be a number.');
    props.setProperty(f.key, String(Number(text)));
  });
  return getSettings();
}

/** Installs the highlighting rules from the web app. */
function installRulesFromWeb() {
  return installRelationRules();
}

function getRuleDescriptions() {
  return relationRules().map(function (r) { return r.sheet + ' › ' + r.column + ': ' + r.note; });
}
