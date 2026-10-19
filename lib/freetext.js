// Turns plain sentences from a doc into feedback entries using keyword rules (no AI).
// Every line becomes one entry. Section, Area and Persona are best guesses, so the
// importer flags these entries "needs review" for a person to confirm.

// Whole-word / stem patterns per area. The area with the most hits wins; ties go to the order below.
const AREA_RULES = [
  ['API', /\b(api|apis|endpoints?|webhooks?|payloads?|rate[- ]?limit\w*|integrations?|swagger|json|status code|40[0-9]|50[0-9]|tokens?|oauth)\b/gi],
  ['Performance', /\b(slow\w*|lag\w*|laggy|latency|loading time|takes? (?:too )?long|performance|speed|freez\w+|frozen|hang\w*|memory|sluggish|delay\w*|time[- ]to[- ]interactive)\b/gi],
  ['Backend', /\b(server|backend|database|db|quer(?:y|ies)|crash(?:es|ed|ing)?|time[- ]?outs?|timed out|cron|jobs?|queues?|records?|duplicates?|sync\w*|permissions?|logs?|stack ?trace|migration|data loss|saved?|storage|emails?|notifications?)\b/gi],
  ['Frontend', /\b(page|pages|browser|safari|chrome|firefox|edge|javascript|js|render\w*|spinner|validation|input|inputs|form|forms|console|refresh|reload|scroll\w*|state|cache|cached|responsive)\b/gi],
  ['UI', /\b(button|buttons|colou?rs?|layout|align\w*|fonts?|icons?|spacing|modal|dropdown|drop-down|screen|design|looks?|display\w*|overflow\w*|cut off|truncat\w+|theme|dark mode|contrast|logo|image|images|label|labels|padding|margin|text size|tiny|huge|banner|tooltip)\b/gi],
  ['UX', /\b(confus\w+|unclear|flow|hard to find|can'?t find|too many (?:steps|clicks)|navigat\w+|intuitive|usability|workflow|annoying|onboarding|cumbersome|clunky|unintuitive|instructions?|wording|misleading|expected|should be able)\b/gi],
];

// Who is affected. Keep these to the vocabulary of the platform (Fixer vs Clients).
const FIXER = /\b(fixers?|technicians?|artisans?|providers?|vendors?|workers?|engineers?|developers?|devs?|staff|agents?)\b/gi;
const CLIENT = /\b(clients?|customers?|end[- ]?users?|users?|buyers?|requesters?|consumers?)\b/gi;

const hits = (re, text) => (text.match(re) || []).length;

export function guessArea(text) {
  let best = 'Other';
  let bestScore = 0;
  for (const [area, re] of AREA_RULES) {
    const score = hits(re, text);
    if (score > bestScore) { best = area; bestScore = score; }
  }
  return best;
}

export function guessPersona(text) {
  const f = hits(FIXER, text) > 0;
  const c = hits(CLIENT, text) > 0;
  if (f && !c) return 'Fixer';
  if (c && !f) return 'Clients';
  return 'Both'; // both mentioned, or nobody is named
}

const NOUNS = 'page|screen|form|modal|dialog|dashboard|tab|menu|flow|section|view|popup|list|table|button|bar|panel|widget|checkout|login|signup|profile|settings';
const SECTION_PATTERN = new RegExp(`\\b(?:on|in|at|from|during|within|of)\\s+(?:the\\s+|our\\s+|a\\s+)?((?:[A-Za-z][\\w'/&-]*\\s+){0,3}?(?:${NOUNS}))\\b`, 'i');
const titleCase = (s) => s.trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function guessSection(text, heading) {
  const m = text.match(SECTION_PATTERN);
  if (m) {
    const words = m[1].split(/\s+/).filter((w) => !/^(the|a|an|our|this|that|my|your)$/i.test(w));
    if (words.length) return titleCase(words.join(' ')).slice(0, 60);
  }
  return heading || 'General';
}

// Headings carry the section for the lines beneath them. Docs text export loses heading styles,
// so detect them by shape: short, Title Case or ALL CAPS, or ending in a colon.
const GENERIC_HEADING = /\b(feedback|log|logs|issues?|notes?|template|how to|instructions?|todo|agenda|meeting|summary|bugs?|list|testing|test)\b/i;
// Lines that are about the doc itself, not about the product.
const NOT_FEEDBACK = /\b(meeting|notes|agenda|todo|to-do|template|instructions?|summary|feedback log)\b/i;

function isHeading(text, bulleted) {
  if (bulleted) return false;
  if (/:\s*$/.test(text)) return true;
  const words = text.split(/\s+/);
  // A lone word is only a heading when it is shouted ("SETTINGS"); "Slow" is more likely a stray remark.
  if (words.length === 1) return /[A-Z]{3,}/.test(text) && text === text.toUpperCase();
  if (/[.!?]$/.test(text) || words.length > 4) return false;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  return words.every((w) => /^[A-Z0-9]/.test(w) || /^(of|and|the|to|a|in|on|for|&|\/|-)$/i.test(w));
}

export const normalizeKey = (s) => 'txt:' + s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// "Elena: the pay button is too small". Only trusted when the prefix is a name we already know
// (someone declared as a reporter in the doc, or who has logged feedback before), so "Checkout: ..." isn't mistaken for a person.
function splitNamePrefix(text, known) {
  const m = text.match(/^([\p{L}][\p{L}'’.-]*(?:\s+[\p{L}][\p{L}'’.-]*){0,2})\s*:\s+(\S.*)$/u);
  if (!m || !known.has(m[1].toLowerCase())) return { name: null, text };
  return { name: m[1], text: m[2] };
}

// items: the doc lines that were not part of a structured entry, as { text, reporter }.
// knownNames: lowercase names of people who may appear as an inline prefix.
export function extractFreeText(items, knownNames = new Set()) {
  const entries = [];
  let heading = null;
  for (const item of items) {
    const raw = item.text;
    const reporter = item.reporter || null;
    const bulleted = /^\s*(?:[-*•▪◦‣]|\d{1,2}[.)])\s+/.test(raw);
    const text = raw.replace(/^\s*(?:[-*•▪◦‣]|\d{1,2}[.)])\s+/, '').replace(/^#+\s*/, '').trim();
    if (!text) continue;
    if (!bulleted && text.split(/\s+/).length <= 6 && !/[.!?]$/.test(text) && NOT_FEEDBACK.test(text)) {
      heading = null; // "Meeting notes", "Feedback log": skip, and don't let them name a section
      continue;
    }
    if (isHeading(text, bulleted)) {
      const h = text.replace(/:\s*$/, '');
      const nice = h === h.toUpperCase() ? h.toLowerCase() : h; // "FIXER DASHBOARD" -> "Fixer Dashboard"
      heading = GENERIC_HEADING.test(h) ? null : titleCase(nice).slice(0, 80);
      continue;
    }
    if (/^<[^>]*>$/.test(text)) continue; // an unfilled "<write your issue here>" placeholder
    const spoken = splitNamePrefix(text, knownNames);
    if (spoken.text.split(/\s+/).length < 3) continue; // too short to be actionable
    const description = spoken.text.slice(0, 4000);
    entries.push({
      section: guessSection(description, heading),
      description,
      area: guessArea(description),
      persona: guessPersona(description),
      name: spoken.name || reporter, // an inline "Elena:" wins over the section's reporter
    });
  }
  return entries;
}
