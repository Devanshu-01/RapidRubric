// ============================================================================
// Review-integrity guardrail (proposal §5a).
//
// Prevents a TA from "rubber-stamping" AI output. Compares the TA's submitted
// per-criterion feedback/scores against the frozen ai_baseline and decides
// whether the review was *substantively* edited.
//
// A review counts as substantively edited if EITHER:
//   (a) at least one criterion's feedback differs from baseline by more than
//       SIMILARITY_THRESHOLD (char-level edit distance ratio) AND by at least
//       MIN_ABS_CHARS absolute characters, OR
//   (b) the overall_comment contains >= MIN_COMMENT_WORDS words.
//
// To stop a single trivial change from passing, when only *minor* per-field
// changes exist, edits must span at least two distinct fields. A score change
// alone never satisfies the gate unless paired with a feedback edit; a score
// changed then reverted is treated as no change.
// ============================================================================

const SIMILARITY_THRESHOLD = 0.15 // 15% char-level edit distance
const MIN_ABS_CHARS = 20
const MIN_COMMENT_WORDS = 30

function normalize(s) {
  return (s ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase()
}

// Classic Levenshtein edit distance.
function levenshtein(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      prevDiag = tmp
    }
  }
  return prev[b.length]
}

function feedbackChanged(baselineText, taText) {
  const a = normalize(baselineText)
  const b = normalize(taText)
  if (a === b) return false
  const dist = levenshtein(a, b)
  const ratio = dist / Math.max(a.length, b.length, 1)
  return ratio >= SIMILARITY_THRESHOLD && dist >= MIN_ABS_CHARS
}

/**
 * @param {Array} baseline  ai_baseline: [{id, score, feedback}]
 * @param {Array} taCriteria TA-submitted: [{id, score, feedback}]
 * @param {string} overallComment
 * @returns {{ substantive: boolean, perField: object, editedFieldCount: number }}
 */
function evaluate(baseline, taCriteria, overallComment) {
  const baseById = Object.fromEntries((baseline || []).map((c) => [String(c.id), c]))
  const perField = {}
  let editedFeedbackFields = 0

  for (const c of taCriteria || []) {
    const base = baseById[String(c.id)] || {}
    const fbChanged = feedbackChanged(base.feedback, c.feedback)
    const scoreChanged = Number(base.score) !== Number(c.score)
    perField[c.id] = { feedbackChanged: fbChanged, scoreChanged }
    if (fbChanged) editedFeedbackFields += 1
  }

  const words = normalize(overallComment).split(' ').filter(Boolean).length
  const commentSubstantive = words >= MIN_COMMENT_WORDS

  // Rule (b): a sufficiently long overall comment alone is enough.
  if (commentSubstantive) {
    return { substantive: true, perField, editedFieldCount: editedFeedbackFields, reason: 'overall_comment' }
  }

  // Rule (a): need a feedback edit; if only one minor field changed, require it
  // to span at least two distinct fields (here: 2 edited criteria, or 1 + comment).
  const distinctFields = editedFeedbackFields + (words > 0 ? 1 : 0)
  const substantive = editedFeedbackFields >= 1 && distinctFields >= 2

  return {
    substantive,
    perField,
    editedFieldCount: editedFeedbackFields,
    reason: substantive ? 'feedback_edits' : 'insufficient_edits',
  }
}

module.exports = { evaluate, SIMILARITY_THRESHOLD, MIN_ABS_CHARS, MIN_COMMENT_WORDS }
