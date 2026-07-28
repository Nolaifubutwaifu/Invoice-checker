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

/**
 * The colours that actually exist in the product catalog (the inventory-app
 * item list). Taken from the live catalog, so these are the only colours a
 * bin or lid can really be.
 *
 * Several of them are ordinary colour words with a qualifier that is not a
 * generic modifier — "Council Green", "Ugly Red". An earlier version of this
 * file built colours from a modifier list plus a base list, which matched the
 * base word alone and silently turned "Council Green" into "Green": a product
 * that does not exist. Matching is now against whole names, longest first.
 *
 * INTEGRATION_PLAN.md phase 1 replaces this constant with a live read of the
 * catalog, so the two can no longer drift apart.
 */
const CATALOG_COLOURS = [
  'Black', 'Council Green', 'Dark Green', 'Dark Grey', 'Grass Green',
  'Light Blue', 'Light Grey', 'Lime Green', 'Mud Green', 'Orange', 'Purple',
  'Red', 'Red (AJ Bush)', 'Royal Blue', 'Sky Blue', 'Ugly Purple', 'Ugly Red',
  'White', 'Yellow',
];

/**
 * Colours worth recognising that are not in the catalog. Matching one is not
 * an error — it may be a new line — but it is flagged for review, because it
 * usually means either a new product or a description we have misread.
 */
const OTHER_COLOURS = [
  'Blue', 'Green', 'Grey', 'Brown', 'Beige', 'Burgundy', 'Maroon', 'Navy',
  'Navy Blue', 'Charcoal', 'Silver', 'Pink', 'Teal', 'Gold', 'Cream', 'Violet',
  'Aqua', 'Tan', 'Ivory', 'Magenta', 'Bronze', 'Olive', 'Terracotta', 'Lime',
  'Dark Blue', 'Dark Red', 'Light Green', 'Pale Blue', 'Bright Green',
  'Forest Green', 'Mid Blue', 'Burnt Orange',
];

// Alternative spellings, mapped to the catalog's own wording.
const COLOUR_ALIASES = new Map([
  ['gray', 'Grey'],
  ['dark gray', 'Dark Grey'],
  ['light gray', 'Light Grey'],
  ['aj bush red', 'Red (AJ Bush)'],
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

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reduces a colour to a comparable key: lowercase, punctuation dropped. */
const colourKey = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const CATALOG_KEYS = new Set(CATALOG_COLOURS.map(colourKey));

/** Every recognised spelling, mapped to the catalog's own wording. */
const CANONICAL = new Map();
for (const colour of [...CATALOG_COLOURS, ...OTHER_COLOURS]) {
  CANONICAL.set(colourKey(colour), colour);
}
for (const [alias, colour] of COLOUR_ALIASES) {
  CANONICAL.set(colourKey(alias), colour);
}

/**
 * One alternation over every spelling, longest first so that "Council Green"
 * wins over "Green" and "Dark Grey" over "Grey". Punctuation in a name is
 * optional when matching, so "Red (AJ Bush)" and "Red AJ Bush" both hit.
 */
const COLOUR_RE = (() => {
  const spellings = new Set();
  for (const key of CANONICAL.keys()) spellings.add(key);
  for (const colour of [...CATALOG_COLOURS, ...OTHER_COLOURS]) spellings.add(colour);

  const alternation = [...spellings]
    .sort((a, b) => b.length - a.length)
    .map((s) => escapeRe(s).replace(/\s+/g, '[\\s\\-()]+'))
    .join('|');

  // Letter-bounded rather than \b, so a trailing ")" does not break the match
  // and "Greenway" is still not read as "Green".
  return new RegExp(`(?<![A-Za-z])(?:${alternation})(?![A-Za-z])`, 'gi');
})();

/**
 * Finds every colour phrase in the text.
 * @returns {{colour: string, index: number, inCatalog: boolean}[]} in order
 */
function findColours(text) {
  const out = [];
  for (const m of text.matchAll(COLOUR_RE)) {
    const key = colourKey(m[0]);
    const colour = CANONICAL.get(key) ?? titleCase(key);
    out.push({
      colour,
      index: m.index,
      length: m[0].length,
      inCatalog: CATALOG_KEYS.has(colourKey(colour)),
    });
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

  // A colour we can name but that no catalog product uses. Usually a new line
  // or a description we have read wrongly, and worth a human glance either way.
  for (const c of colours) {
    if (!c.inCatalog) {
      review.push(`colour "${c.colour}" is not in the product catalog`);
    }
  }

  const kind = complete ? 'complete' : isBin && isLid ? 'bin+lid' : isBin ? 'bin' : 'lid';

  // Anything left after removing size, colours and the structural words is a
  // product variant worth keeping — "Vermin", "HD", "Vented".
  // Cut the colours out by position rather than by pattern: a name like
  // "Red (AJ Bush)" is not a valid regex on its own, and the same colour can
  // appear twice.
  let leftover = '';
  let cursor = 0;
  for (const c of [...colours].sort((a, b) => a.index - b.index)) {
    leftover += `${text.slice(cursor, c.index)} `;
    cursor = c.index + c.length;
  }
  leftover += text.slice(cursor);
  if (sizeMatch) leftover = leftover.replace(sizeMatch[0], ' ');
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
    binColour,
    lidColour,
    variant,
    components,
    review,
  };
}

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
