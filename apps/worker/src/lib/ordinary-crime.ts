// Rule-based guard: detect ordinary crime / accidents that GDELT's classifier
// sometimes mis-tags as ARMED-CONFLICT (e.g. "Nine-year-old girl killed in
// police shooting"). Such events must not feed a country's threat aggregation.
//
// Conservative by design (high precision): it only fires when an ordinary-crime
// signature is present AND there is NO armed-conflict context — so a genuine war
// event that happens to mention a civilian victim ("10-year-old killed in
// airstrike") is NOT excluded. Curated (UCDP) events never pass through this.

// Markers of organized armed violence — if any is present, it's NOT ordinary crime.
const CONFLICT_CONTEXT =
  /\b(air ?strikes?|shell(ing|ed)|artillery|missiles?|rockets?|drone strikes?|bomb(ing|ard)|militants?|insurgents?|rebels?|jihad|terror|militia|offensive|front[- ]?line|combat|troops|soldiers|army|armed (group|forces)|ambush|IED|clash(es)?|warfare|battle|besieg|occupation|paramilitary|junta|coup|airbase|warplane)\b/i

// Ordinary-crime / accident signatures.
const CRIME_PATTERNS: RegExp[] = [
  /\b\d{1,3}[-\s]year[-\s]old\b.{0,45}\b(killed|shot|stabbed|dead|dies|died|murdered|drowned)\b/i, // individual aged victim
  /\bpolice shooting\b/i,
  /\bofficer[-\s]involved shooting\b/i,
  /\b(car|road|traffic|bus|truck|lorry|train|boat|ferry|plane) (crash|accident|collision|capsiz|derail)/i,
  /\b(armed )?(robbery|burglar|carjack|mugg|shoplift|kidnap for ransom)/i,
  /\bdomestic (violence|abuse|dispute|incident)\b/i,
  /\b(drunk|drink)[-\s]driv/i,
  /\bhit[-\s]and[-\s]run\b/i,
  /\b(serial killer|gang rape|honou?r killing)\b/i,
]

/** True if the title reads as ordinary crime/accident with no armed-conflict context. */
export function looksLikeOrdinaryCrime(title: string): boolean {
  if (!title) return false
  if (CONFLICT_CONTEXT.test(title)) return false
  return CRIME_PATTERNS.some(re => re.test(title))
}
