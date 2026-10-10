-- 023: how to reach a student, and who to call if something happens to them.
--
-- A phone number and an emergency contact, entered by the student on their
-- own profile. The supervisor of that student and the coordinator can see
-- them; nobody else can. All optional.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
