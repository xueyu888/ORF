UPDATE drive_files
SET preview_kind = 'docx',
    mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
WHERE preview_kind = 'download'
  AND lower(file_name) LIKE '%.docx'
  AND (
    mime_type = ''
    OR mime_type = 'application/octet-stream'
    OR mime_type = 'application/zip'
    OR mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
--> statement-breakpoint
UPDATE drive_file_versions
SET preview_kind = 'docx',
    mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
WHERE preview_kind = 'download'
  AND lower(file_name) LIKE '%.docx'
  AND (
    mime_type = ''
    OR mime_type = 'application/octet-stream'
    OR mime_type = 'application/zip'
    OR mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
