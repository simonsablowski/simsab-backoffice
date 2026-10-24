// Loads the pure Apps Script files into one context, as Apps Script does with its global scope.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Relations.js and Rules.js only call Apps Script services inside functions, so loading them is safe.
const PURE_FILES = ['Config.js', 'Format.js', 'Layout.js', 'Validation.js', 'Prepare.js', 'Payments.js', 'Relations.js', 'Rules.js'];

function loadPure() {
  const context = vm.createContext({ Date, Math, Number, String, isNaN, console });
  for (const file of PURE_FILES) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }
  return context;
}

module.exports = { loadPure };
