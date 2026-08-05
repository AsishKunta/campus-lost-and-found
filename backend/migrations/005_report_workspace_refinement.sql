-- Phase 4 refinement: support multiple photos per Lost/Found report.

CREATE TABLE report_images (
  id         BIGSERIAL PRIMARY KEY,
  report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL CHECK (LENGTH(BTRIM(image_url)) > 0),
  sort_order SMALLINT NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, image_url)
);

INSERT INTO report_images (report_id, image_url, sort_order)
SELECT id, image_url, 0 FROM reports
WHERE image_url IS NOT NULL AND LENGTH(BTRIM(image_url)) > 0
ON CONFLICT DO NOTHING;

CREATE INDEX report_images_report_order_idx
  ON report_images (report_id, sort_order, id);
