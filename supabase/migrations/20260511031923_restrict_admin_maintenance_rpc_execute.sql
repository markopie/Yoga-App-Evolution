-- Restrict direct RPC access to admin/server-only maintenance functions.
--
-- These functions are used by service-role maintenance scripts and internal
-- database triggers, not by the browser app. Keep service_role execution for
-- scripts while removing direct anon/authenticated REST RPC access.

revoke execute on function public.process_course_analysis_refresh_queue(integer) from public;
revoke execute on function public.process_course_analysis_refresh_queue(integer) from anon;
revoke execute on function public.process_course_analysis_refresh_queue(integer) from authenticated;
grant execute on function public.process_course_analysis_refresh_queue(integer) to service_role;
comment on function public.process_course_analysis_refresh_queue(integer)
  is 'Admin/server-only maintenance RPC. Processes course analysis refresh queue; call from service-role scripts, not browser clients.';

revoke execute on function public.queue_course_analysis_refresh(bigint, text) from public;
revoke execute on function public.queue_course_analysis_refresh(bigint, text) from anon;
revoke execute on function public.queue_course_analysis_refresh(bigint, text) from authenticated;
grant execute on function public.queue_course_analysis_refresh(bigint, text) to service_role;
comment on function public.queue_course_analysis_refresh(bigint, text)
  is 'Admin/internal maintenance helper. Queues course analysis refresh work; used by database trigger functions and service-role maintenance.';

revoke execute on function public.refresh_course_pose_index(bigint) from public;
revoke execute on function public.refresh_course_pose_index(bigint) from anon;
revoke execute on function public.refresh_course_pose_index(bigint) from authenticated;
grant execute on function public.refresh_course_pose_index(bigint) to service_role;
comment on function public.refresh_course_pose_index(bigint)
  is 'Admin/internal maintenance helper. Rebuilds course pose index for one course; not intended for browser RPC calls.';

revoke execute on function public.refresh_course_pose_index_trigger() from public;
revoke execute on function public.refresh_course_pose_index_trigger() from anon;
revoke execute on function public.refresh_course_pose_index_trigger() from authenticated;
grant execute on function public.refresh_course_pose_index_trigger() to service_role;
comment on function public.refresh_course_pose_index_trigger()
  is 'Internal trigger function for course pose index maintenance; not intended for direct browser RPC calls.';

revoke execute on function public.refresh_course_sequence_analysis_for_course(bigint) from public;
revoke execute on function public.refresh_course_sequence_analysis_for_course(bigint) from anon;
revoke execute on function public.refresh_course_sequence_analysis_for_course(bigint) from authenticated;
grant execute on function public.refresh_course_sequence_analysis_for_course(bigint) to service_role;
comment on function public.refresh_course_sequence_analysis_for_course(bigint)
  is 'Admin/server-only maintenance RPC. Recomputes cached course sequence analysis for one course; call from service-role maintenance.';

revoke execute on function public.get_tables() from public;
revoke execute on function public.get_tables() from anon;
revoke execute on function public.get_tables() from authenticated;
grant execute on function public.get_tables() to service_role;
comment on function public.get_tables()
  is 'Admin/server-only backup helper. Lists public tables for service-role backup scripts; not intended for browser clients.';
