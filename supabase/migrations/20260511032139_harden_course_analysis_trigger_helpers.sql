-- Keep course-analysis trigger helpers internal after restricting the queue RPC.
--
-- Authenticated app writes to courses/asanas/stages can fire these triggers.
-- Run the trigger helpers as database-owner maintenance code so they can call
-- the restricted queue helper without exposing direct RPC access to clients.

alter function public.queue_courses_for_asana_change()
  security definer
  set search_path = public;
revoke execute on function public.queue_courses_for_asana_change() from public;
revoke execute on function public.queue_courses_for_asana_change() from anon;
revoke execute on function public.queue_courses_for_asana_change() from authenticated;
grant execute on function public.queue_courses_for_asana_change() to service_role;
comment on function public.queue_courses_for_asana_change()
  is 'Internal trigger helper. Queues course analysis refreshes after asana changes; not intended for direct browser RPC calls.';

alter function public.queue_courses_for_stage_change()
  security definer
  set search_path = public;
revoke execute on function public.queue_courses_for_stage_change() from public;
revoke execute on function public.queue_courses_for_stage_change() from anon;
revoke execute on function public.queue_courses_for_stage_change() from authenticated;
grant execute on function public.queue_courses_for_stage_change() to service_role;
comment on function public.queue_courses_for_stage_change()
  is 'Internal trigger helper. Queues course analysis refreshes after stage changes; not intended for direct browser RPC calls.';

alter function public.queue_course_for_self_change()
  security definer
  set search_path = public;
revoke execute on function public.queue_course_for_self_change() from public;
revoke execute on function public.queue_course_for_self_change() from anon;
revoke execute on function public.queue_course_for_self_change() from authenticated;
grant execute on function public.queue_course_for_self_change() to service_role;
comment on function public.queue_course_for_self_change()
  is 'Internal trigger helper. Queues course analysis refreshes after course changes; not intended for direct browser RPC calls.';

alter function public.trg_queue_course_analysis_from_asana()
  security definer
  set search_path = public;
revoke execute on function public.trg_queue_course_analysis_from_asana() from public;
revoke execute on function public.trg_queue_course_analysis_from_asana() from anon;
revoke execute on function public.trg_queue_course_analysis_from_asana() from authenticated;
grant execute on function public.trg_queue_course_analysis_from_asana() to service_role;
comment on function public.trg_queue_course_analysis_from_asana()
  is 'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.';

alter function public.trg_queue_course_analysis_from_stage()
  security definer
  set search_path = public;
revoke execute on function public.trg_queue_course_analysis_from_stage() from public;
revoke execute on function public.trg_queue_course_analysis_from_stage() from anon;
revoke execute on function public.trg_queue_course_analysis_from_stage() from authenticated;
grant execute on function public.trg_queue_course_analysis_from_stage() to service_role;
comment on function public.trg_queue_course_analysis_from_stage()
  is 'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.';

alter function public.trg_queue_course_analysis_from_course()
  security definer
  set search_path = public;
revoke execute on function public.trg_queue_course_analysis_from_course() from public;
revoke execute on function public.trg_queue_course_analysis_from_course() from anon;
revoke execute on function public.trg_queue_course_analysis_from_course() from authenticated;
grant execute on function public.trg_queue_course_analysis_from_course() to service_role;
comment on function public.trg_queue_course_analysis_from_course()
  is 'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.';
