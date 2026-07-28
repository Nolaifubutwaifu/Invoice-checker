/**
 * Turns a raw invoice line-item description into a structured bin/lid record.
 *
 * Brisbins descriptions follow a few shapes, e.g.
 *   "240L bin purple complete"                    -> bin and lid both purple
 *   "240L Wheelie Bin Dark Green/Light Blue Lid"  -> bin dark green, lid light blue
 *   "Red 240L Vermin lid"                         -> lid only, red, Vermin variant
 * and plenty of non-product lines we want nothing to do with
 *   "1100L Lid Pins", "80L HD Wheels", "Freight", "Pickup"
 */

// Colours seen on bins and lids. Two-word colours are matched before one-word
// ones so "Dark Green" never comes back as just "Green".
const MODIFIERS = [
  'dark', 'light', 'pale', 'bright', 'deep', 'mid', 'hot', 'sky', 'forest',
  'royal', 'olive', 'lime', 'navy', 'burnt', 'off',
];

const BASE_COLOURS = [
  'red', 'blue', 'green', 'yellow', 'black', 'grey', 'gray', 'white', 'purple',
  'orange', 'brown', 'beige', 'burgundy', 'maroon', 'lime', 'navy', 'charcoal',
  'silver', 'pink', 'teal', 'gold', 'cream', 'violet', 'aqua', 'tan', 'ivory',
  'magenta', 'bronze', 'olive', 'terracotta',
];

// Spelling normalisation applied after a colour is recognised.
const COLOUR_ALIASES = new Map([
  ['gray', 'Grey'],
  ['dark gray', 'Dark Grey'],
  ['light gray', 'Light Grey'],
]);

// If any of these words appear, the line is a spare part or a service, not a
// bin or a lid — even when it also says "lid" ("1100L Lid Pins").
const PART_WORDS = [
  'pin', 'pins', 'wheel', 'wheels', 'castor', 'castors', 'caster', 'casters',
  'axel', 'axels', 'axle', 'axles', 'plug', 'plugs', 'hinge', 'hinges',
  'bolt', 'bolts', 'nut', 'nuts', 'screw', 'screws', 'washer', 'washers',
  'rivet', 'rivets', 'bracket', 'brackets', 'clip', 'clips', 'spring',
  'springs', 'gasket', 'seal', 'seals', 'handle', 'handles', 'bar', 'bars',
  'key', 'keys', 'lock', 'locks', 'sticker', 'stickers', 'label', 'labels',
  'decal', 'decals', 'freight', 'shipping', 'delivery', 'postage', 'pickup',
  'repair', 'service', 'labour', 'discount', 'deposit', 'rental', 'hire',
];

const SIZE_RE = /\b(\d{2,4})\s*(?:L|LT|LTR|LITRES?|LITERS?)\b/i;

/** Words that carry no product identity once size/colour/type are pulled out. */
const FILLER_WORDS = new Set([
  'bin', 'bins', 'lid', 'lids', 'wheelie', 'wheeliebin', 'complete', 'set',
  'with', 'and', 'the', 'a', 'x', 'new', 'plastic', 'mgb',
]);

const titleCase = (s) =>
  s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/**
 * Finds every colour phrase in the text.
 * @returns {{colour: string, index: number}[]} in order of appearance
 */
function findColours(text) {
  const modAlt = MODIFIERS.join('|');
  const baseAlt = BASE_COLOURS.join('|');
  // Optional modifier, then a base colour. Word-bounded so "Greenway" is safe.
  const re = new RegExp(`\\b(?:(${modAlt})[\\s-]+)?(${baseAlt})\\b`, 'gi');
  const out = [];
  for (const m of text.matchAll(re)) {
    const raw = m[0].replace(/[\s-]+/g, ' ').toLowerCase().trim();
    // "lime green" / "navy blue" are one colour; a bare "lime" or "navy" is too.
    const colour = COLOUR_ALIASES.get(raw) ?? titleCase(raw);
    out.push({ colour, index: m.index, length: m[0].length });
  }
  return out;
}

/** Index of the first whole-word match of any term, or -1. */
function indexOfWord(text, terms) {
  let best = -1;
  for (const t of terms) {
    const m = new RegExp(`\\b${t}\\b`, 'i').exec(text);
    if (m && (best === -1 || m.index < best)) best = m.index;
  }
  return best;
}

function hasWord(text, terms) {
  return indexOfWord(text, terms) !== -1;
}

/**
 * Removes a trailing "with ..." / "inc ..." / "+ ..." clause so that accessories
 * bundled with a bin are not mistaken for the line being a spare part.
 */
function stripAccessoryClause(text) {
  return text.replace(/\s(?:with|w\/|inc|incl|including|plus|\+)\s.*$/i, '');
}

/**
 * Classifies one invoice line.
 *
 * @param {string} description raw description cell
 * @returns {null | {
 *   size: string, kind: 'complete'|'bin+lid'|'bin'|'lid',
 *   binColour: string, lidColour: string, variant: string,
 *   product: string, review: string[]
 * }} null when the line is not a bin or lid at all
 */
export function parseLineItem(description) {
  const text = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const isBin = hasWord(text, ['bin', 'bins']);
  const isLid = hasWord(text, ['lid', 'lids']);
  if (!isBin && !isLid) return null;

  // A part that merely mentions a bin or lid ("1100L Lid Pins") is not a sale
  // of a bin or lid. A trailing accessory clause is not disqualifying though —
  // "240L Bin Green Complete with Lock" is still a bin sale — so that clause is
  // set aside before looking for part words.
  if (hasWord(stripAccessoryClause(text), PART_WORDS)) return null;

  const review = [];

  const sizeMatch = SIZE_RE.exec(text);
  const size = sizeMatch ? `${sizeMatch[1]}L` : '';
  if (!size) review.push('no size found');

  const colours = findColours(text);
  const complete = hasWord(text, ['complete']);

  let binColour = '';
  let lidColour = '';

  const binAt = indexOfWord(text, ['bin', 'bins']);
  const lidAt = indexOfWord(text, ['lid', 'lids']);

  if (isBin && isLid && !complete) {
    // Two colours, one belongs to the bin and one to the lid. Assign each
    // colour to whichever of the two words it sits closest to.
    if (colours.length >= 2) {
      const scored = colours.map((c) => ({
        ...c,
        toBin: Math.abs(c.index - binAt),
        toLid: Math.abs(c.index - lidAt),
      }));
      const binPick = scored.reduce((a, b) => (b.toBin < a.toBin ? b : a));
      const lidPick = scored
        .filter((c) => c !== binPick)
        .reduce((a, b) => (b.toLid < a.toLid ? b : a));
      binColour = binPick.colour;
      lidColour = lidPick.colour;
    } else if (colours.length === 1) {
      binColour = lidColour = colours[0].colour;
      review.push('bin and lid named separately but only one colour found');
    }
  } else if (complete || (isBin && isLid)) {
    // "complete" means the bin and lid match.
    binColour = lidColour = colours[0]?.colour ?? '';
    if (colours.length > 1) {
      review.push(`"complete" but ${colours.length} colours found`);
    }
  } else if (isBin) {
    binColour = colours[0]?.colour ?? '';
    if (colours.length > 1) review.push(`${colours.length} colours found for a bin`);
  } else {
    lidColour = colours[0]?.colour ?? '';
    if (colours.length > 1) review.push(`${colours.length} colours found for a lid`);
  }

  if (!colours.length) review.push('no colour found');

  const kind = complete ? 'complete' : isBin && isLid ? 'bin+lid' : isBin ? 'bin' : 'lid';

  // Anything left after removing size, colours and the structural words is a
  // product variant worth keeping — "Vermin", "HD", "Vented".
  let leftover = text;
  if (sizeMatch) leftover = leftover.replace(sizeMatch[0], ' ');
  for (const c of colours) leftover = leftover.replace(new RegExp(c.colour, 'i'), ' ');
  const variant = leftover
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !FILLER_WORDS.has(w.toLowerCase()))
    .map((w) => (w.length <= 3 ? w.toUpperCase() : titleCase(w.toLowerCase())))
    .join(' ')
    .trim();

  // Bins and lids are stocked separately, so one invoice line becomes one row
  // per physical component. A complete set yields a bin row and a lid row, each
  // carrying the line's full quantity.
  const components = [];
  if (isBin) {
    components.push({ component: 'Bin', colour: binColour });
  }
  if (isLid || complete) {
    components.push({ component: 'Lid', colour: lidColour });
  }

  // Only the first component carries the money, otherwise a bundled line would
  // be counted twice in the value totals. The other is priced as part of the set.
  for (const [i, c] of components.entries()) {
    c.priced = i === 0;
    c.product = buildProductName({ size, component: c.component, colour: c.colour, variant });
  }

  return {
    size,
    kind,
    soldAs: SOLD_AS[kind],
    binColour,
    lidColour,
    variant,
    components,
    review,
  };
}

const SOLD_AS = {
  complete: 'Complete set',
  'bin+lid': 'Bin + lid',
  bin: 'Bin only',
  lid: 'Lid only',
};

/**
 * Canonical name for a single component, in Brisbins' order: size first, then
 * the variant, then bin or lid, then the colour.
 */
export function buildProductName({ size, component, colour, variant }) {
  return [size, variant, component, colour]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
