// Correct only known whole-word spelling errors; keep the original report for
// hashing, storage and audit. Never rewrite alarm codes or infer a diagnosis.
export function normalizeReportText(text, replacements) {
  return text.trim().replace(/\b[A-Za-z]+\b/g, word => replacements[word.toLowerCase()] || word);
}
