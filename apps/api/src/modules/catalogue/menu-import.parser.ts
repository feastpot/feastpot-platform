/**
 * Conservative, deterministic menu OCR parser. This intentionally does not
 * inspect ingredient/allergen words: OCR is untrusted and allergen declarations
 * require an explicit vendor action.
 */
export interface ParsedMenuCandidate {
  name: string;
  description?: string;
  pricePence?: number;
  portionLabel?: string;
  reviewFlags: string[];
  allergens: [];
  allergensFreeFrom: false;
}

// Prices must be at the end of a line. This avoids interpreting years,
// quantities and prices embedded in descriptions as menu items.
const PRICE = /(?:£\s*(\d{1,3}(?:[.,]\d{2})?)|(\d{1,3})[.,](\d{2}))\s*[.!:;]?\s*$/;
const PORTION = /\b(single|small|medium|large|regular|family|sharing|portion|serves?\s+\d+)\b/i;
const REJECT =
  /\b(call|phone|tel(?:ephone)?|www\.|https?:|email|@|calories?|kcal|protein|fat|carbohydrate|nutrition|opening hours?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|served with|choice of|includes?|topped with|made with|\d+\s*(?:g|kg|ml|oz|people|servings?))\b/i;
const LIKELY_DESCRIPTION = /^(freshly|served|made|with|choice|our\s+(?:sauce|special)|contains)\b/i;

function clean(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s£&'’()./-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse at most 30 plausible item lines; never infer missing values. */
export function parseMenuText(text: string): ParsedMenuCandidate[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const out: ParsedMenuCandidate[] = [];
  for (let i = 0; i < lines.length && out.length < 30; i += 1) {
    const line = lines[i];
    if (!line || line.length < 2 || line.length > 255) continue;
    const match = line.match(PRICE);
    // A strong candidate has a terminal, currency-qualified price and a
    // plausible dish name. Heading/contact/nutrition rows are never items.
    if (REJECT.test(line)) continue;
    const pricePence = match
      ? Math.round(Number((match[1] ?? `${match[2]}.${match[3]}`).replace(',', '.')) * 100)
      : undefined;
    const name = clean(
      (match ? line.replace(PRICE, '') : line).replace(/^[\s\-–—:|•]+|[\s\-–—:|•]+$/g, ''),
    );
    if (
      !name ||
      /^\d+$/.test(name) ||
      name.length < 2 ||
      !/\p{L}/u.test(name) ||
      name.split(/\s+/).length > 12 ||
      /^(menu|starters?|mains?|desserts?|drinks?|sides?|breakfast|lunch|dinner)$/i.test(name) ||
      (!match &&
        !/\bask\s+us\b/i.test(name) &&
        (name.split(/\s+/).length < 2 || LIKELY_DESCRIPTION.test(name)))
    )
      continue;
    const portionMatch = name.match(PORTION);
    const candidate: ParsedMenuCandidate = {
      name,
      ...(pricePence !== undefined && pricePence >= 1 && pricePence <= 100000
        ? { pricePence }
        : {}),
      ...(portionMatch ? { portionLabel: portionMatch[0] } : {}),
      reviewFlags: [],
      allergens: [],
      allergensFreeFrom: false,
    };
    if (candidate.pricePence === undefined) candidate.reviewFlags.push('missing_price');
    if (!candidate.portionLabel) candidate.reviewFlags.push('missing_portion');
    out.push(candidate);
  }
  return out;
}
