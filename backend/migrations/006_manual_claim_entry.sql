-- Phase 4 regression completion: retain trusted item context for report-independent claims.

ALTER TABLE claims
  ADD COLUMN item_category TEXT,
  ADD COLUMN item_date DATE,
  ADD COLUMN manual_entry BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE claims c
SET item_category = r.item_category,
    item_date = r.date_found
FROM reports r
WHERE c.report_id = r.id;

ALTER TABLE claims ADD CONSTRAINT claims_manual_item_category_check CHECK (
  item_category IS NULL OR item_category IN (
    'Accessories', 'Bags', 'Clothing', 'Documents', 'Electronics', 'Keys', 'Other'
  )
);

ALTER TABLE claims ADD CONSTRAINT claims_manual_entry_context_check CHECK (
  NOT manual_entry OR (
    report_id IS NULL
    AND lost_report_id IS NULL
    AND LENGTH(BTRIM(item_name)) > 0
    AND LENGTH(BTRIM(location)) > 0
    AND LENGTH(BTRIM(description)) > 0
    AND item_category IS NOT NULL
    AND item_date IS NOT NULL
  )
);

CREATE INDEX claims_manual_review_queue_idx
  ON claims (status, created_at DESC)
  WHERE manual_entry = TRUE;
