-- ════════════════════════════════════════════════════════════════
--  Async analysis job store (D1)
--
--  A "job" is one document analysis. It is broken into "chunks"; each chunk
--  is evaluated against all 21 rules and its ChunkEvaluation JSON is stored.
--  When every chunk is done, the merge + report run and the final dataset is
--  stored on the job row. This mirrors a Queue: rows are work items and the
--  tick processor is the consumer (swap the tick loop for a queue later).
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY,               -- Job ID (returned to client)
  status            TEXT NOT NULL DEFAULT 'pending',-- pending|extracting|analyzing|merging|reporting|done|error|not_relevant
  provider          TEXT,                           -- deepseek | openai
  total_chunks      INTEGER NOT NULL DEFAULT 0,
  done_chunks       INTEGER NOT NULL DEFAULT 0,
  -- structured intake context (json)
  context_json      TEXT,
  -- R2 keys for the raw upload + extracted text
  raw_key           TEXT,
  text_key          TEXT,
  -- final scored dataset (json) and human-readable report (json)
  result_json       TEXT,
  error_message     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_chunks (
  job_id            TEXT NOT NULL,
  chunk_id          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending|done|error
  start_page        INTEGER NOT NULL DEFAULT 0,
  end_page          INTEGER NOT NULL DEFAULT 0,
  headings          TEXT,                            -- json array
  -- chunk text is stored in R2 (text_key + offset) OR inline for small chunks
  text_inline       TEXT,
  -- the ChunkEvaluation JSON returned by the LLM
  eval_json         TEXT,
  error_message     TEXT,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (job_id, chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_job_chunks_job ON job_chunks(job_id, status);
