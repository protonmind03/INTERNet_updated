-- 074: the final evaluation as the university's form (revisions, November 2026).
--
-- PSU's Internship Evaluation Form (FM-AA-INT-13, Rev. 0, 01-Feb-2017), read
-- from the photo of a filled-in one: eight competencies, each with its own
-- weight and a sentence for every rating from 5 down to 1, and the OJT grade
--
--     grade = (sum of rating x weight) / 5 x 50 + 50
--
-- (on the form: "Total Points (A + B + ... + H x 10) / 50 x 50 + 50"; a
-- student rated 4 on all but Conduct, 5, has 4.1 points and a grade of 91).
--
--   evaluation_forms.criteria   each criterion may now carry
--                               "weight": its share in percent (all of a
--                               form's weights add up to 100), and
--                               "levels": one sentence per rating, from 1 up
--                               (the paper lists them 5 down).
--   final_evaluations.grade     the OJT grade, when the form is weighted
--   final_evaluations.outcome   the boxes at the foot of the form:
--                               { "employ": true, "improve": false,
--                                 "terminated": ["Lack of work", ...] }
--
-- The form the system started with was a sample. If it is still the one in
-- use (the coordinator never changed it), the university's form takes its
-- place; a form the coordinator wrote is left as it is. Evaluations already
-- submitted keep the form they were written on (form_snapshot).

ALTER TABLE final_evaluations ADD COLUMN IF NOT EXISTS grade NUMERIC(5,2);
ALTER TABLE final_evaluations ADD COLUMN IF NOT EXISTS outcome JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM evaluation_forms WHERE is_active = TRUE AND is_sample = TRUE)
     AND NOT EXISTS (SELECT 1 FROM evaluation_forms WHERE name = 'Internship Evaluation Form (FM-AA-INT-13)') THEN
    UPDATE evaluation_forms SET is_active = FALSE WHERE is_active = TRUE;
    INSERT INTO evaluation_forms (name, scale_max, criteria, is_active, is_sample)
    VALUES ('Internship Evaluation Form (FM-AA-INT-13)', 5, $json$[
      {"key": "c1", "label": "Ability to learn", "description": "", "weight": 10, "levels": [
        "Does not easily understand; needs repeated instructions on the same tasks.",
        "Slow to grasp concepts, sometimes does not remember important facts and procedures.",
        "Usually understands instructions; usually has good judgment and reasoning.",
        "Learns quickly, applies past experiences.",
        "Grasps new ideas quickly, can readily apply knowledge to new situations, flexible problem solver."]},
      {"key": "c2", "label": "Work attitude", "description": "", "weight": 15, "levels": [
        "Continually gripes about work assignments; disturbs others; uncooperative; temperamental; frequent absences or tardiness.",
        "Complains that many things are unfair, a whiner; reports to work but sometimes tardy and absent.",
        "Takes setbacks in stride; pleasant and cooperative in most situations; reports to work on time with minimal absences or tardiness.",
        "Accepts all work assignments; rarely complains; communicates well with superiors and coworkers; observes regularity and punctuality in attendance.",
        "Possesses a positive perspective; always upbeat and ready to work; a pleasure to work with; always reports to work ahead of time without any absences and tardiness."]},
      {"key": "c3", "label": "Conduct", "description": "", "weight": 10, "levels": [
        "Rude; ill mannered; uses obscene language; poor control of emotions; disrespectful to others.",
        "Harasses others; occasionally rude, foul language; not sensitive to others.",
        "Observes common courtesy but doesn't always recognize opportunities and/or need to be polite or helpful.",
        "Mostly polite and helpful; recognizes importance of human relationships; rarely loses temper.",
        "Always polite; careful not to offend anyone, maintains proper composure; makes special efforts to be helpful."]},
      {"key": "c4", "label": "Motivation/Initiative", "description": "", "weight": 10, "levels": [
        "Never anticipates requirements of any job or procedure; always wants or has to be told what to do; lacks initiative, needs prodding.",
        "Does what is told; sometimes anticipates parts of the job; does no more than what is required; seems uninterested at times.",
        "Asks questions; has adequate degree of knowledge; does routine tasks without prompting; ready with tools.",
        "Good knowledge of most procedures; anticipates next steps; goes beyond expectations and prepares ahead.",
        "Curiosity goes beyond immediate job procedures; eager to learn more; works hard."]},
      {"key": "c5", "label": "Quality and accuracy of work", "description": "", "weight": 20, "levels": [
        "Makes frequent mistakes; wastes materials; lacks mechanical ability; needs constant supervision.",
        "Aims just to get by; careless; some jobs need to be reworked.",
        "Work usually meets standard or expectations; needs some extra supervision.",
        "Does good work; careful; makes very few mistakes; uses good judgment.",
        "Work is very accurate; work meets or exceeds standards; takes pride in his/her work."]},
      {"key": "c6", "label": "Quantity of work", "description": "", "weight": 10, "levels": [
        "Doesn't plan work; slow; produces very little; wastes time; continually visiting with others which slows down the work.",
        "Does less than expected; does just enough to get by; requires additional oversight.",
        "Does fair share; looks busy but after finishing a task usually doesn't look for other tasks that need to be done.",
        "Plans work well; works efficiently; gets expected work on time.",
        "Highly productive; fast and accurate; when finished with assigned tasks finds other tasks to advance the job."]},
      {"key": "c7", "label": "Safety practices", "description": "", "weight": 15, "levels": [
        "A hazard to self and others; potential for putting self and others at risk because of risky and unsafe attitude.",
        "Careless, takes shortcuts which can create safety hazards.",
        "Usually follows most safety procedures; usually does the job in a safe manner.",
        "Observes safety precautions; uses correct tools and wears appropriate safety apparel.",
        "Always places safety first; helps others to be safe; does not take chances which might endanger self and others."]},
      {"key": "c8", "label": "Appearance/Hygiene", "description": "", "weight": 10, "levels": [
        "Generally not presentable: clothes dirty and not appropriate for the job; looks shabby; unclean; smells bad at times.",
        "Poorly groomed; hair disheveled; clothing barely job appropriate and unkempt.",
        "Clothes usually clean and appropriate for job; grooming acceptable.",
        "Arrives at work with clothes clean; showered and clean; clothes are proper, protective and safe.",
        "Clothes ideal for work; appearance and hygiene would be acceptable to customers and co-trainees/personnel."]}
    ]$json$::jsonb, TRUE, FALSE);
  END IF;
END $$;
