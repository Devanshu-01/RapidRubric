// ============================================================================
// TA Review feature — the two endpoints implemented for Assignment 2 Part 4,
// plus one supporting endpoint (review detail) needed for the full workflow.
//
//   GET  /api/v1/ta/queue                          -> getQueue   (implemented #1)
//   GET  /api/v1/ta/submissions/:id                -> getReview  (supporting)
//   POST /api/v1/ta/submissions/:id/release        -> release    (implemented #2)
// ============================================================================
const { query, pool } = require('../db')
const editIntegrity = require('../services/editIntegrity')

// ---------------------------------------------------------------------------
// GET /api/v1/ta/queue
// Returns every submission assigned to the calling TA, newest first.
// ---------------------------------------------------------------------------
async function getQueue(req, res, next) {
  try {
    const { rows } = await query(
      `select s.id,
              s.status,
              s.created_at,
              a.title              as assignment_title,
              p.full_name          as student_name
         from submissions s
         join assignments a on a.id = s.assignment_id
         join profiles    p on p.id = s.student_id
        where s.ta_id = $1
        order by s.created_at desc`,
      [req.user.id]
    )
    res.json({ queue: rows })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/ta/submissions/:submissionId
// Side-by-side review payload: submission meta + AI first-pass output.
// Enforces ownership: a TA may only open submissions in their own queue.
// ---------------------------------------------------------------------------
async function getReview(req, res, next) {
  try {
    const { submissionId } = req.params
    const { rows } = await query(
      `select s.id, s.status, s.storage_path, s.comments, s.ta_id,
              a.title as assignment_title,
              p.full_name as student_name,
              f.criteria as ai_criteria, f.flagged_issues, f.summary
         from submissions s
         join assignments a on a.id = s.assignment_id
         join profiles    p on p.id = s.student_id
         left join ai_feedback f on f.submission_id = s.id
        where s.id = $1`,
      [submissionId]
    )
    const row = rows[0]
    if (!row) return res.status(404).json({ message: 'Submission not found' })
    if (row.ta_id !== req.user.id) return res.status(403).json({ message: 'Forbidden' })

    res.json({
      id: row.id,
      status: row.status,
      assignment_title: row.assignment_title,
      student_name: row.student_name,
      student_comments: row.comments,
      storage_path: row.storage_path,
      ai_feedback: {
        criteria: row.ai_criteria,
        flagged_issues: row.flagged_issues,
        summary: row.summary,
      },
    })
  } catch (err) {
    next(err)
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/ta/submissions/:submissionId/release
// Body: { criteria:[{id,score,feedback}], overall_comment?, attest_no_edits? }
//
// Runs the review-integrity guardrail. If the TA made substantive edits the
// feedback is released to the student. If not, the release is rejected (422)
// unless the TA attests no edits are needed, in which case it is escalated to
// the instructor approval queue. Every outcome writes an audit_log entry.
// ---------------------------------------------------------------------------
async function release(req, res, next) {
  const client = await pool.connect()
  try {
    const { submissionId } = req.params
    const { criteria, overall_comment, attest_no_edits } = req.body

    // ----- input validation -----
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return res.status(400).json({ message: 'criteria must be a non-empty array' })
    }
    for (const c of criteria) {
      if (c.id === undefined || c.score === undefined || Number.isNaN(Number(c.score))) {
        return res.status(400).json({ message: 'each criterion needs an id and a numeric score' })
      }
    }

    const { rows } = await query(
      `select s.id, s.ta_id, s.status, s.student_id,
              a.title as assignment_title,
              f.ai_baseline
         from submissions s
         join assignments a on a.id = s.assignment_id
         left join ai_feedback f on f.submission_id = s.id
        where s.id = $1`,
      [submissionId]
    )
    const sub = rows[0]
    if (!sub) return res.status(404).json({ message: 'Submission not found' })

    // ----- broken-access-control guard: ownership -----
    if (sub.ta_id !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: this submission is not in your queue' })
    }
    if (sub.status === 'released') {
      return res.status(409).json({ message: 'Feedback has already been released' })
    }

    // ----- review-integrity guardrail -----
    const verdict = editIntegrity.evaluate(sub.ai_baseline || [], criteria, overall_comment)
    const totalScore = criteria.reduce((sum, c) => sum + Number(c.score), 0)

    await client.query('begin')

    if (!verdict.substantive && !attest_no_edits) {
      // Reject: TA must edit or explicitly attest.
      await client.query(
        `insert into audit_log (actor_id, action, target_id, metadata)
         values ($1, 'release_blocked', $2, $3)`,
        [req.user.id, submissionId, { per_field: verdict.perField, reason: verdict.reason }]
      )
      await client.query('commit')
      return res.status(422).json({
        message: 'Release blocked: no substantive edits detected.',
        guardrail: {
          reason: verdict.reason,
          per_field: verdict.perField,
          options: ['edit_and_release', 'submit_for_instructor_approval'],
        },
      })
    }

    if (!verdict.substantive && attest_no_edits) {
      // Escalation path: route to instructor approval instead of the student.
      await client.query(
        `insert into ta_reviews (submission_id, ta_id, criteria, total_score, overall_comment)
         values ($1, $2, $3, $4, $5)
         on conflict (submission_id) do update
            set criteria = excluded.criteria,
                total_score = excluded.total_score,
                overall_comment = excluded.overall_comment`,
        [submissionId, req.user.id, JSON.stringify(criteria), totalScore, overall_comment ?? null]
      )
      await client.query(
        `update submissions set status = 'pending_instructor_approval' where id = $1`,
        [submissionId]
      )
      await client.query(
        `insert into audit_log (actor_id, action, target_id, metadata)
         values ($1, 'submit_for_instructor_approval', $2, $3)`,
        [req.user.id, submissionId, { attestation: overall_comment ?? null, release_path: 'ta_attested' }]
      )
      await client.query('commit')
      return res.status(202).json({
        status: 'pending_instructor_approval',
        message: 'No substantive edits — routed to instructor for approval.',
      })
    }

    // ----- happy path: substantive edits -> release to student -----
    await client.query(
      `insert into ta_reviews (submission_id, ta_id, criteria, total_score, overall_comment)
       values ($1, $2, $3, $4, $5)
       on conflict (submission_id) do update
          set criteria = excluded.criteria,
              total_score = excluded.total_score,
              overall_comment = excluded.overall_comment`,
      [submissionId, req.user.id, JSON.stringify(criteria), totalScore, overall_comment ?? null]
    )
    await client.query(`update submissions set status = 'released' where id = $1`, [submissionId])
    await client.query(`update ai_feedback set status = 'released' where submission_id = $1`, [submissionId])
    await client.query(
      `insert into audit_log (actor_id, action, target_id, metadata)
       values ($1, 'release_feedback', $2, $3)`,
      [req.user.id, submissionId, { release_path: 'ta_edited', edited_fields: verdict.editedFieldCount, total_score: totalScore }]
    )
    await client.query('commit')

    res.json({
      status: 'released',
      submission_id: submissionId,
      total_score: totalScore,
      message: 'Feedback released to student.',
    })
  } catch (err) {
    await client.query('rollback').catch(() => {})
    next(err)
  } finally {
    client.release()
  }
}

module.exports = { getQueue, getReview, release }
