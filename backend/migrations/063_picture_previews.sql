-- 063: a small preview beside every picture, and pictures sent later.
--
-- Lists of entries showed each picture by fetching the whole picture (up
-- to about 1600 pixels). The phone now also makes a 480-pixel WebP of it
-- and sends both; lists load the preview and the whole picture only opens
-- on a tap (routes/attachments.ts).
--
--   preview_path        where the preview is kept (services/privateFileStore.ts);
--                       NULL for a picture sent before this, or from a
--                       browser that cannot make a WebP: lists then fetch
--                       the picture itself, as before.
--   preview_size_bytes  its size, for the upload quota.
--
-- Pictures chosen for a time-out recorded with no connection now wait on
-- the phone with it and are sent after it. A picture may then be sent more
-- than once (the connection drops before the answer arrives), so the phone
-- gives each one an id of its own:
--
--   client_ref          the phone's id for the picture; a second upload with
--                       the same id onto the same entry is answered with the
--                       picture already there instead of adding another.
--
-- Additive and safe to run again.

ALTER TABLE attachments ADD COLUMN IF NOT EXISTS preview_path TEXT;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS preview_size_bytes INTEGER;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS client_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_client_ref
  ON attachments (owner_type, owner_id, client_ref)
  WHERE client_ref IS NOT NULL;
