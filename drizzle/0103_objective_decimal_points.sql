-- Keep historical real values intact while allowing new hundredth-point awards.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE objectives
  ALTER COLUMN objective_base_points TYPE numeric(12, 2) USING objective_base_points::numeric(12, 2),
  ALTER COLUMN objective_settlement_points TYPE double precision USING objective_settlement_points::double precision;
--> statement-breakpoint
ALTER TABLE objective_settlement_events
  ALTER COLUMN base_points TYPE double precision USING base_points::double precision,
  ALTER COLUMN settlement_points TYPE double precision USING settlement_points::double precision;
--> statement-breakpoint
ALTER TABLE point_ledger
  ALTER COLUMN points TYPE double precision USING points::double precision;
