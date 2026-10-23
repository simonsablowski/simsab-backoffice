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
    folder: fileLink(props.getProperty(keys.folderId), true)
  };
}

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
  return getSettings();
}

/** Installs the highlighting rules from the web app. */
function installRulesFromWeb() {
  return installRelationRules();
}

function getRuleDescriptions() {
  return relationRules().map(function (r) { return r.sheet + ' › ' + r.column + ': ' + r.note; });
}
