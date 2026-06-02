-- Migration: Fix meditation_feedback table schema location
-- Created: 2025-12-19
-- Description: Drops public.meditation_feedback and recreates in analytics schema

-- Drop existing table in public schema (if exists)
DROP TABLE IF EXISTS public.meditation_feedback CASCADE;

-- The corrected table creation is now in 20251219_create_meditation_feedback_table.sql
-- This migration just ensures cleanup of any existing table in wrong schema
