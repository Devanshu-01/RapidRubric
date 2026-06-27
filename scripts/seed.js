// Seeds demo data: one instructor, one TA, two students, a rubric, an
// assignment, and two submissions with AI first-pass feedback assigned to the
// TA. Passwords are bcrypt-hashed. Safe to re-run (idempotent on email).
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { pool, query } = require('../src/db')

const PASSWORD = 'Password123!'

const RUBRIC_CRITERIA = [
  { id: 'c1', name: 'Thesis & Argument', description: 'Clear, arguable thesis sustained throughout.', max_score: 10 },
  { id: 'c2', name: 'Evidence & Citations', description: 'Claims supported with cited evidence.', max_score: 10 },
  { id: 'c3', name: 'Structure & Organization', description: 'Logical flow and paragraph cohesion.', max_score: 10 },
  { id: 'c4', name: 'Grammar & Style', description: 'Mechanics, clarity, and academic tone.', max_score: 10 },
]

const AI_BASELINE_A = [
  { id: 'c1', score: 7, feedback: 'Thesis is present but could be sharper and more specific.' },
  { id: 'c2', score: 6, feedback: 'Several claims lack citations; add sources for the second section.' },
  { id: 'c3', score: 8, feedback: 'Well organized; transitions between sections are smooth.' },
  { id: 'c4', score: 7, feedback: 'Generally clean prose with a few comma splices.' },
]
const AI_BASELINE_B = [
  { id: 'c1', score: 5, feedback: 'Thesis is vague and shifts between paragraphs.' },
  { id: 'c2', score: 4, feedback: 'Evidence is thin and mostly uncited.' },
  { id: 'c3', score: 6, feedback: 'Structure is acceptable but the conclusion is abrupt.' },
  { id: 'c4', score: 6, feedback: 'Frequent run-on sentences reduce readability.' },
]

async function upsertUser(email, fullName, role) {
  const hash = await bcrypt.hash(PASSWORD, 12)
  const { rows } = await query(
    `insert into profiles (full_name, email, role, password_hash)
     values ($1, $2, $3, $4)
     on conflict (email) do update set full_name = excluded.full_name, role = excluded.role
     returning id`,
    [fullName, email, role, hash]
  )
  console.log(`  user ${email} (${role}) -> ${rows[0].id}`)
  return rows[0].id
}

async function main() {
  console.log('Seeding...')
  const instructorId = await upsertUser('instructor@test.com', 'Dr. Pat Instructor', 'instructor')
  const taId = await upsertUser('ta1@test.com', 'Taylor TA', 'ta')
  const student1 = await upsertUser('student1@test.com', 'Sam Student', 'student')
  const student2 = await upsertUser('student2@test.com', 'Riley Student', 'student')

  const { rows: rub } = await query(
    `insert into rubrics (instructor_id, title, criteria, locked)
     values ($1, $2, $3, true) returning id`,
    [instructorId, 'Essay 1 — Argumentative Writing', JSON.stringify(RUBRIC_CRITERIA)]
  )
  const rubricId = rub[0].id

  const { rows: asg } = await query(
    `insert into assignments (rubric_id, ta_id, title, due_at, allow_resubmission, locked)
     values ($1, $2, $3, now() + interval '7 days', true, true) returning id`,
    [rubricId, taId, 'Essay 1 — Argumentative Writing']
  )
  const assignmentId = asg[0].id

  for (const [student, baseline, tag] of [
    [student1, AI_BASELINE_A, 'A'],
    [student2, AI_BASELINE_B, 'B'],
  ]) {
    const { rows: s } = await query(
      `insert into submissions (assignment_id, student_id, ta_id, storage_path, comments, status)
       values ($1, $2, $3, $4, $5, 'pending_ta_review') returning id`,
      [assignmentId, student, taId, `submissions/${student}/essay1_${tag}.pdf`, 'Please review my draft.']
    )
    const submissionId = s[0].id
    await query(
      `insert into ai_feedback (submission_id, criteria, flagged_issues, summary, ai_baseline, status)
       values ($1, $2, $3, $4, $5, 'pending_ta_review')
       on conflict (submission_id) do nothing`,
      [
        submissionId,
        JSON.stringify(baseline),
        JSON.stringify(['Possible uncited claim', 'Check thesis specificity']),
        'AI first-pass complete. Review per-criterion feedback before release.',
        JSON.stringify(baseline),
      ]
    )
    console.log(`  submission ${tag} -> ${submissionId}`)
  }

  console.log('Seed complete. Login with any seeded email / Password123!')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
