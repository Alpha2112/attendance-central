-- 012: Record the requested date range on each manual sync job so the Sync
-- History view can show which window a run covered. Nullable + backward-compatible
-- (automatic/legacy jobs simply have NULL range).
ALTER TABLE sync_jobs
  ADD COLUMN date_from DATE NULL AFTER job_type,
  ADD COLUMN date_to DATE NULL AFTER date_from;
