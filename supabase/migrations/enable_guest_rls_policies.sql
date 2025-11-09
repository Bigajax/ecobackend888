-- Migration: Enable RLS policies for guest_sessions and guest_messages tables
-- Description: Allows anonymous users to insert guest sessions and messages
-- Date: 2025-11-08

-- Enable RLS on guest_sessions table if not already enabled
ALTER TABLE public.guest_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts to guest_sessions
CREATE POLICY guest_sessions_allow_insert
  ON public.guest_sessions
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow anonymous selects on guest_sessions (for checking if exists)
CREATE POLICY guest_sessions_allow_select
  ON public.guest_sessions
  FOR SELECT
  USING (true);

-- Create policy to allow anonymous updates on guest_sessions (for last_seen_at)
CREATE POLICY guest_sessions_allow_update
  ON public.guest_sessions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Enable RLS on guest_messages table if not already enabled
ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous inserts to guest_messages
CREATE POLICY guest_messages_allow_insert
  ON public.guest_messages
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow anonymous selects on guest_messages
CREATE POLICY guest_messages_allow_select
  ON public.guest_messages
  FOR SELECT
  USING (true);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS guest_sessions_created_at_idx
  ON public.guest_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS guest_sessions_last_seen_at_idx
  ON public.guest_sessions(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS guest_messages_guest_id_idx
  ON public.guest_messages(guest_id);

CREATE INDEX IF NOT EXISTS guest_messages_created_at_idx
  ON public.guest_messages(created_at DESC);

CREATE INDEX IF NOT EXISTS guest_messages_guest_id_created_at_idx
  ON public.guest_messages(guest_id, created_at DESC);
