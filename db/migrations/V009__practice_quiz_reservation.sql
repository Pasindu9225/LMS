-- A quiz row is reserved (status 'generating') before the slow AI call, so concurrent requests
-- can't all pass the daily limit; failed generations still count toward it.
alter table practice_quizzes alter column questions drop not null;
alter table practice_quizzes add column status text not null default 'ready'
  check (status in ('generating', 'ready', 'failed'));
