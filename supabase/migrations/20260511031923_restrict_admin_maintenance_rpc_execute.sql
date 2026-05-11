-- Restrict direct RPC access to admin/server-only maintenance functions.
--
-- Some functions in this list exist in the live project from manual/admin
-- setup but are not part of a fresh migration replay. Harden each function
-- only when it exists so local replay remains clean.

do $$
declare
  target record;
begin
  for target in
    select *
    from (values
      (
        'public.process_course_analysis_refresh_queue(integer)',
        'Admin/server-only maintenance RPC. Processes course analysis refresh queue; call from service-role scripts, not browser clients.'
      ),
      (
        'public.queue_course_analysis_refresh(bigint, text)',
        'Admin/internal maintenance helper. Queues course analysis refresh work; used by database trigger functions and service-role maintenance.'
      ),
      (
        'public.refresh_course_pose_index(bigint)',
        'Admin/internal maintenance helper. Rebuilds course pose index for one course; not intended for browser RPC calls.'
      ),
      (
        'public.refresh_course_pose_index_trigger()',
        'Internal trigger function for course pose index maintenance; not intended for direct browser RPC calls.'
      ),
      (
        'public.refresh_course_sequence_analysis_for_course(bigint)',
        'Admin/server-only maintenance RPC. Recomputes cached course sequence analysis for one course; call from service-role maintenance.'
      ),
      (
        'public.get_tables()',
        'Admin/server-only backup helper. Lists public tables for service-role backup scripts; not intended for browser clients.'
      )
    ) as t(signature, comment_text)
  loop
    if to_regprocedure(target.signature) is not null then
      execute format('revoke execute on function %s from public', target.signature);
      execute format('revoke execute on function %s from anon', target.signature);
      execute format('revoke execute on function %s from authenticated', target.signature);
      execute format('grant execute on function %s to service_role', target.signature);
      execute format('comment on function %s is %L', target.signature, target.comment_text);
    end if;
  end loop;
end $$;
