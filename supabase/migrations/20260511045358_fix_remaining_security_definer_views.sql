-- Fix remaining Security Advisor findings:
-- - security_definer_view on public view surfaces
-- These advisory views exist in the linked project but are not created by the
-- local replayable migration chain, so keep IF EXISTS for replay safety.

alter view if exists public.v_master_curriculum_candidate_pool
  set (security_invoker = true);

alter view if exists public.v_source_sequence_inventory_enriched
  set (security_invoker = true);

alter view if exists public.v_source_sequence_curriculum_coverage
  set (security_invoker = true);

alter view if exists public.v_curriculum_node_completion_status
  set (security_invoker = true);
