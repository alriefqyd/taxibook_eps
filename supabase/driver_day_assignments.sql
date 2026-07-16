-- driver_day_assignments: coordinator assigns a driver for an entire day
-- Taxis in this table for a given date are skipped by auto-assign for that day.
-- Coordinators can still manually reassign to these taxis if needed.

CREATE TABLE IF NOT EXISTS driver_day_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taxi_id     uuid NOT NULL REFERENCES taxis(id) ON DELETE CASCADE,
  assign_date date NOT NULL,
  reason      text,
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(taxi_id, assign_date)
);

ALTER TABLE driver_day_assignments ENABLE ROW LEVEL SECURITY;

-- Coordinators can create, read, and delete
CREATE POLICY "Coordinators manage driver day assignments"
  ON driver_day_assignments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'coordinator')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'coordinator')
  );

-- All authenticated users can read (for reporting and display)
CREATE POLICY "Authenticated users can view driver day assignments"
  ON driver_day_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ============================================================
-- MIGRATION: partial-day duty window
-- A duty can now be a specific time range instead of the full day.
-- NULL start_time/end_time means full day (original behavior).
-- ============================================================
ALTER TABLE driver_day_assignments ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE driver_day_assignments ADD COLUMN IF NOT EXISTS end_time   time;

-- ============================================================
-- REALTIME — enable for live updates
-- Missing this is why driver/home's postgres_changes subscription on this
-- table never fired: Supabase Realtime only streams tables added to this
-- publication, so coordinator assign/release actions never pushed live to
-- the driver — they only saw it after a manual reload.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'driver_day_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_day_assignments;
  END IF;
END $$;
