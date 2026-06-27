// Generates db/seed.sql and db/seed.json with fixed UUIDs + real bcrypt hashes.
// Run once locally; the produced files are the assignment's database source data.
const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')

const ids = {
  instructor: '11111111-1111-1111-1111-111111111111',
  ta:         '22222222-2222-2222-2222-222222222222',
  student1:   '33333333-3333-3333-3333-333333333333',
  student2:   '44444444-4444-4444-4444-444444444444',
  rubric:     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  assignment: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  subA:       'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  subB:       'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  fbA:        'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  fbB:        'dddddddd-dddd-dddd-dddd-ddddddddddd2',
}

const criteria = [
  { id: 'c1', name: 'Thesis & Argument', description: 'Clear, arguable thesis sustained throughout.', max_score: 10 },
  { id: 'c2', name: 'Evidence & Citations', description: 'Claims supported with cited evidence.', max_score: 10 },
  { id: 'c3', name: 'Structure & Organization', description: 'Logical flow and paragraph cohesion.', max_score: 10 },
  { id: 'c4', name: 'Grammar & Style', description: 'Mechanics, clarity, and academic tone.', max_score: 10 },
]
const baseA = [
  { id: 'c1', score: 7, feedback: 'Thesis is present but could be sharper and more specific.' },
  { id: 'c2', score: 6, feedback: 'Several claims lack citations; add sources for the second section.' },
  { id: 'c3', score: 8, feedback: 'Well organized; transitions between sections are smooth.' },
  { id: 'c4', score: 7, feedback: 'Generally clean prose with a few comma splices.' },
]
const baseB = [
  { id: 'c1', score: 5, feedback: 'Thesis is vague and shifts between paragraphs.' },
  { id: 'c2', score: 4, feedback: 'Evidence is thin and mostly uncited.' },
  { id: 'c3', score: 6, feedback: 'Structure is acceptable but the conclusion is abrupt.' },
  { id: 'c4', score: 6, feedback: 'Frequent run-on sentences reduce readability.' },
]
const flagged = ['Possible uncited claim', 'Check thesis specificity']
const summary = 'AI first-pass complete. Review per-criterion feedback before release.'

function q(s) { return s.replace(/'/g, "''") }
function j(o) { return q(JSON.stringify(o)) }

const hashes = {
  instructor: bcrypt.hashSync('Password123!', 12),
  ta: bcrypt.hashSync('Password123!', 12),
  student1: bcrypt.hashSync('Password123!', 12),
  student2: bcrypt.hashSync('Password123!', 12),
}

const sql = `-- ============================================================================
-- RapidRubric — Seed data (run AFTER schema.sql)
--   psql "$DATABASE_URL" -f schema.sql
--   psql "$DATABASE_URL" -f seed.sql
-- All demo accounts use the password:  Password123!
-- ============================================================================

insert into profiles (id, full_name, email, role, password_hash) values
  ('${ids.instructor}', 'Dr. Pat Instructor', 'instructor@test.com', 'instructor', '${hashes.instructor}'),
  ('${ids.ta}',         'Taylor TA',          'ta1@test.com',        'ta',         '${hashes.ta}'),
  ('${ids.student1}',   'Sam Student',        'student1@test.com',   'student',    '${hashes.student1}'),
  ('${ids.student2}',   'Riley Student',      'student2@test.com',   'student',    '${hashes.student2}')
on conflict (email) do nothing;

insert into rubrics (id, instructor_id, title, criteria, locked) values
  ('${ids.rubric}', '${ids.instructor}', 'Essay 1 — Argumentative Writing', '${j(criteria)}'::jsonb, true)
on conflict (id) do nothing;

insert into assignments (id, rubric_id, ta_id, title, due_at, allow_resubmission, locked) values
  ('${ids.assignment}', '${ids.rubric}', '${ids.ta}', 'Essay 1 — Argumentative Writing', now() + interval '7 days', true, true)
on conflict (id) do nothing;

insert into submissions (id, assignment_id, student_id, ta_id, storage_path, comments, status) values
  ('${ids.subA}', '${ids.assignment}', '${ids.student1}', '${ids.ta}', 'submissions/${ids.student1}/essay1_A.pdf', 'Please review my draft.', 'pending_ta_review'),
  ('${ids.subB}', '${ids.assignment}', '${ids.student2}', '${ids.ta}', 'submissions/${ids.student2}/essay1_B.pdf', 'Please review my draft.', 'pending_ta_review')
on conflict (id) do nothing;

insert into ai_feedback (id, submission_id, criteria, flagged_issues, summary, ai_baseline, status) values
  ('${ids.fbA}', '${ids.subA}', '${j(baseA)}'::jsonb, '${j(flagged)}'::jsonb, '${q(summary)}', '${j(baseA)}'::jsonb, 'pending_ta_review'),
  ('${ids.fbB}', '${ids.subB}', '${j(baseB)}'::jsonb, '${j(flagged)}'::jsonb, '${q(summary)}', '${j(baseB)}'::jsonb, 'pending_ta_review')
on conflict (submission_id) do nothing;
`

const jsonData = {
  _note: 'Database source data for RapidRubric TA Review feature. Password for all accounts: Password123!',
  profiles: [
    { id: ids.instructor, full_name: 'Dr. Pat Instructor', email: 'instructor@test.com', role: 'instructor', password_hash: hashes.instructor },
    { id: ids.ta, full_name: 'Taylor TA', email: 'ta1@test.com', role: 'ta', password_hash: hashes.ta },
    { id: ids.student1, full_name: 'Sam Student', email: 'student1@test.com', role: 'student', password_hash: hashes.student1 },
    { id: ids.student2, full_name: 'Riley Student', email: 'student2@test.com', role: 'student', password_hash: hashes.student2 },
  ],
  rubrics: [{ id: ids.rubric, instructor_id: ids.instructor, title: 'Essay 1 — Argumentative Writing', criteria, locked: true }],
  assignments: [{ id: ids.assignment, rubric_id: ids.rubric, ta_id: ids.ta, title: 'Essay 1 — Argumentative Writing', allow_resubmission: true, locked: true }],
  submissions: [
    { id: ids.subA, assignment_id: ids.assignment, student_id: ids.student1, ta_id: ids.ta, storage_path: `submissions/${ids.student1}/essay1_A.pdf`, comments: 'Please review my draft.', status: 'pending_ta_review' },
    { id: ids.subB, assignment_id: ids.assignment, student_id: ids.student2, ta_id: ids.ta, storage_path: `submissions/${ids.student2}/essay1_B.pdf`, comments: 'Please review my draft.', status: 'pending_ta_review' },
  ],
  ai_feedback: [
    { id: ids.fbA, submission_id: ids.subA, criteria: baseA, flagged_issues: flagged, summary, ai_baseline: baseA, status: 'pending_ta_review' },
    { id: ids.fbB, submission_id: ids.subB, criteria: baseB, flagged_issues: flagged, summary, ai_baseline: baseB, status: 'pending_ta_review' },
  ],
}

const dbDir = path.join(__dirname, '..', 'db')
fs.writeFileSync(path.join(dbDir, 'seed.sql'), sql)
fs.writeFileSync(path.join(dbDir, 'seed.json'), JSON.stringify(jsonData, null, 2))
console.log('Wrote db/seed.sql and db/seed.json')
