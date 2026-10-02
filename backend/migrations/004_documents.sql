-- Documents uploaded by students and reviewed by their assigned supervisor.
-- File contents are stored in backend/private-uploads/documents; only
-- metadata and the generated storage filename are persisted in PostgreSQL.

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) NOT NULL,
  doc_type VARCHAR(100) NOT NULL,
  original_filename TEXT NOT NULL,
  file_path VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(150) NOT NULL,
  size_bytes BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  review_notes TEXT,
  reviewed_by_supervisor_id VARCHAR(50),
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_documents_student_uploaded
  ON documents(student_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status_uploaded
  ON documents(status, uploaded_at DESC);
