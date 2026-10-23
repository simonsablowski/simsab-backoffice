/**
 * Pure layout calculations for the invoice sheet.
 * The footer (address, contact and bank details) must stay at the bottom of
 * the page, so a spacer row between the line items and the footer absorbs
 * whatever height the description does not use.
 */

/** Estimates how many wrapped lines a text needs in a cell of the given width. */
function estimateLines(text, charsPerLine) {
  var trimmed = String(text || '').replace(/\s+$/, '');
  if (trimmed === '') return 1;
  return trimmed.split('\n').reduce(function (sum, paragraph) {
    return sum + Math.max(1, Math.ceil(paragraph.length / charsPerLine));
  }, 0);
}

/** Row height in pixels for the description cell. */
function descriptionRowHeight(text, layout) {
  return estimateLines(text, layout.charsPerLine) * layout.lineHeightPx + layout.paddingPx;
}

/**
 * Computes the new spacer height so that the total height of all rows equals
 * the total height of the template.
 *
 * @param {number} targetTotal   sum of all row heights in the unmodified template
 * @param {number} currentTotal  sum of all row heights after filling in content
 * @param {number} currentSpacer current height of the spacer row
 * @param {number} minSpacer     smallest allowed spacer height
 * @return {{height: number, overflowPx: number}} overflowPx > 0 means the content
 *         is taller than one page and the footer will move down
 */
function computeSpacerHeight(targetTotal, currentTotal, currentSpacer, minSpacer) {
  var desired = Math.round(currentSpacer + (targetTotal - currentTotal));
  if (desired < minSpacer) {
    return { height: minSpacer, overflowPx: minSpacer - desired };
  }
  return { height: desired, overflowPx: 0 };
}
