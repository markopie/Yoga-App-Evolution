-- ════════════════════════════════════════════════════════════════
-- Migration: Rename recover_pose_id to recovery_pose_id on stages
-- Run this in: Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════
-- Context: The stages table had the column named `recover_pose_id`
-- (missing the 'y'), while the asanas table uses `recovery_pose_id`
-- (with the 'y'). The code consistently uses `recovery_pose_id`
-- with fallback logic for the old name. This migration renames the
-- column to match the asanas table convention, eliminating the need
-- for fallback logic.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE stages RENAME COLUMN recover_pose_id TO recovery_pose_id;

-- ════════════════════════════════════════════════════════════════
-- Verification (run after to confirm)
-- ════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'stages' AND column_name = 'recovery_pose_id';
