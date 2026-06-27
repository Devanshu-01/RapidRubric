-- ============================================================================
-- RapidRubric — Seed data (run AFTER schema.sql)
--   psql "$DATABASE_URL" -f schema.sql
--   psql "$DATABASE_URL" -f seed.sql
-- All demo accounts use the password:  Password123!
-- ============================================================================

insert into profiles (id, full_name, email, role, password_hash) values
  ('11111111-1111-1111-1111-111111111111', 'Dr. Pat Instructor', 'instructor@test.com', 'instructor', '$2a$12$ZqXcc.JKuNdol7viDjf0uedPObAXx2NU4VWKzGWaWwOeegYi.zgau'),
  ('22222222-2222-2222-2222-222222222222',         'Taylor TA',          'ta1@test.com',        'ta',         '$2a$12$18GXkzChtuhnlOr7K1uaWuE3oDRv0TIP4YRRM2dpkL0p610FWncNe'),
  ('33333333-3333-3333-3333-333333333333',   'Sam Student',        'student1@test.com',   'student',    '$2a$12$xtrlh8LjxAQ08dpbmodGZeawKDm.6FLf4p4ZwCP4xY/ZDkhEfMYkS'),
  ('44444444-4444-4444-4444-444444444444',   'Riley Student',      'student2@test.com',   'student',    '$2a$12$6a4vjZ2cDkIcyIR7GXWexOyY41zFgt7h37Evm1XGyTO6NnMCAL/ru')
on conflict (email) do nothing;

insert into rubrics (id, instructor_id, title, criteria, locked) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Essay 1 — Argumentative Writing', '[{"id":"c1","name":"Thesis & Argument","description":"Clear, arguable thesis sustained throughout.","max_score":10},{"id":"c2","name":"Evidence & Citations","description":"Claims supported with cited evidence.","max_score":10},{"id":"c3","name":"Structure & Organization","description":"Logical flow and paragraph cohesion.","max_score":10},{"id":"c4","name":"Grammar & Style","description":"Mechanics, clarity, and academic tone.","max_score":10}]'::jsonb, true)
on conflict (id) do nothing;

insert into assignments (id, rubric_id, ta_id, title, due_at, allow_resubmission, locked) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'Essay 1 — Argumentative Writing', now() + interval '7 days', true, true)
on conflict (id) do nothing;

insert into submissions (id, assignment_id, student_id, ta_id, storage_path, comments, status) values
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'submissions/33333333-3333-3333-3333-333333333333/essay1_A.pdf', 'Please review my draft.', 'pending_ta_review'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'submissions/44444444-4444-4444-4444-444444444444/essay1_B.pdf', 'Please review my draft.', 'pending_ta_review')
on conflict (id) do nothing;

insert into ai_feedback (id, submission_id, criteria, flagged_issues, summary, ai_baseline, status) values
  ('dddddddd-dddd-dddd-dddd-ddddddddddd1', 'cccccccc-cccc-cccc-cccc-ccccccccccc1', '[{"id":"c1","score":7,"feedback":"Thesis is present but could be sharper and more specific."},{"id":"c2","score":6,"feedback":"Several claims lack citations; add sources for the second section."},{"id":"c3","score":8,"feedback":"Well organized; transitions between sections are smooth."},{"id":"c4","score":7,"feedback":"Generally clean prose with a few comma splices."}]'::jsonb, '["Possible uncited claim","Check thesis specificity"]'::jsonb, 'AI first-pass complete. Review per-criterion feedback before release.', '[{"id":"c1","score":7,"feedback":"Thesis is present but could be sharper and more specific."},{"id":"c2","score":6,"feedback":"Several claims lack citations; add sources for the second section."},{"id":"c3","score":8,"feedback":"Well organized; transitions between sections are smooth."},{"id":"c4","score":7,"feedback":"Generally clean prose with a few comma splices."}]'::jsonb, 'pending_ta_review'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd2', 'cccccccc-cccc-cccc-cccc-ccccccccccc2', '[{"id":"c1","score":5,"feedback":"Thesis is vague and shifts between paragraphs."},{"id":"c2","score":4,"feedback":"Evidence is thin and mostly uncited."},{"id":"c3","score":6,"feedback":"Structure is acceptable but the conclusion is abrupt."},{"id":"c4","score":6,"feedback":"Frequent run-on sentences reduce readability."}]'::jsonb, '["Possible uncited claim","Check thesis specificity"]'::jsonb, 'AI first-pass complete. Review per-criterion feedback before release.', '[{"id":"c1","score":5,"feedback":"Thesis is vague and shifts between paragraphs."},{"id":"c2","score":4,"feedback":"Evidence is thin and mostly uncited."},{"id":"c3","score":6,"feedback":"Structure is acceptable but the conclusion is abrupt."},{"id":"c4","score":6,"feedback":"Frequent run-on sentences reduce readability."}]'::jsonb, 'pending_ta_review')
on conflict (submission_id) do nothing;
