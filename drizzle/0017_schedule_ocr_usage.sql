CREATE TABLE schedule_ocr_usage (
  month TEXT PRIMARY KEY NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0
);
