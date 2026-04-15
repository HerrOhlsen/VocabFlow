-- VocabFlow schema — execute in Supabase SQL Editor (or `supabase db push`).
-- Creates all tables, indexes, and RLS policies.
-- After running this, deploy both Edge Functions (vocab-write, set-manager)
-- and insert at least one teacher row (see Dokumentation/06_Setup_Anleitung.md).

-- ============================================
-- 1. vocab_sets
-- ============================================
CREATE TABLE public.vocab_sets (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  language    text,
  level       text,
  subject     text,
  category    text,
  grade_level text,
  has_reverse boolean DEFAULT false,
  owner_id    text,
  archived    boolean DEFAULT false,
  published   boolean DEFAULT false,
  cards       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.vocab_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_vocab_sets" ON public.vocab_sets
  FOR SELECT TO anon USING (true);
-- Writes only via set-manager Edge Function (service-role key).

-- ============================================
-- 2. user_sets
-- ============================================
CREATE TABLE public.user_sets (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name     text NOT NULL,
  set_id        text NOT NULL REFERENCES public.vocab_sets(id) ON DELETE CASCADE,
  activated_at  timestamptz DEFAULT now(),
  UNIQUE (user_name, set_id)
);

CREATE INDEX idx_user_sets_user ON public.user_sets(user_name);
CREATE INDEX idx_user_sets_set  ON public.user_sets(set_id);

ALTER TABLE public.user_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_user_sets" ON public.user_sets
  FOR SELECT TO anon USING (true);

-- ============================================
-- 3. progress
-- ============================================
CREATE TABLE public.progress (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name      text NOT NULL,
  set_id         text NOT NULL,
  card_id        text NOT NULL,
  stability      real,
  difficulty     real,
  repetitions    int DEFAULT 0,
  interval_days  int DEFAULT 0,
  next_review    date,
  last_review    date,
  last_rating    int,
  lapses         int DEFAULT 0,
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (user_name, set_id, card_id)
);

CREATE INDEX idx_progress_user     ON public.progress(user_name);
CREATE INDEX idx_progress_user_set ON public.progress(user_name, set_id);
CREATE INDEX idx_progress_set      ON public.progress(set_id);

ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_progress" ON public.progress
  FOR SELECT TO anon USING (true);

-- ============================================
-- 4. teachers (whitelist)
-- ============================================
CREATE TABLE public.teachers (
  user_name    text PRIMARY KEY,
  display_name text NOT NULL,
  added_at     timestamptz DEFAULT now(),
  added_by     text
);

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_select_teachers" ON public.teachers
  FOR SELECT TO anon USING (true);

-- Example insert (adjust to your first teacher's Moodle user id):
--   INSERT INTO public.teachers (user_name, display_name, added_by)
--   VALUES ('moodle_42', 'Ms Example', 'admin');

-- ============================================
-- 5. audit_log (forensic log of all writes via vocab-write)
-- ============================================
CREATE TABLE public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_name   text,
  action      text,
  status      text,
  target      jsonb,
  ip_hash     text,
  user_agent  text,
  error       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_user    ON public.audit_log(user_name, created_at);
CREATE INDEX idx_audit_ip      ON public.audit_log(ip_hash, created_at);
CREATE INDEX idx_audit_created ON public.audit_log(created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- No anon policies — only service-role can read/write.
