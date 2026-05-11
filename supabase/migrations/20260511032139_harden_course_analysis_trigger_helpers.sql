-- Keep course-analysis trigger helpers internal after restricting the queue RPC.
--
-- Authenticated app writes to courses/asanas/stages can fire these triggers.
-- Run the trigger helpers as database-owner maintenance code so they can call
-- restricted queue helpers without exposing direct RPC access to clients.
--
-- Some legacy helper names are present in the live project but not on a clean
-- migration replay. Harden each helper only when it exists.

do $$
declare
  target record;
begin
  for target in
    select *
    from (values
      (
        'public.queue_courses_for_asana_change()',
        'Internal trigger helper. Queues course analysis refreshes after asana changes; not intended for direct browser RPC calls.'
      ),
      (
        'public.queue_courses_for_stage_change()',
        'Internal trigger helper. Queues course analysis refreshes after stage changes; not intended for direct browser RPC calls.'
      ),
      (
        'public.queue_course_for_self_change()',
        'Internal trigger helper. Queues course analysis refreshes after course changes; not intended for direct browser RPC calls.'
      ),
      (
        'public.trg_queue_course_analysis_from_asana()',
        'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.'
      ),
      (
        'public.trg_queue_course_analysis_from_stage()',
        'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.'
      ),
      (
        'public.trg_queue_course_analysis_from_course()',
        'Legacy/internal trigger helper for course analysis refresh queueing; not intended for direct browser RPC calls.'
      )
    ) as t(signature, comment_text)
  loop
    if to_regprocedure(target.signature) is not null then
      execute format('alter function %s security definer set search_path = public', target.signature);
      execute format('revoke execute on function %s from public', target.signature);
      execute format('revoke execute on function %s from anon', target.signature);
      execute format('revoke execute on function %s from authenticated', target.signature);
      execute format('grant execute on function %s to service_role', target.signature);
      execute format('comment on function %s is %L', target.signature, target.comment_text);
    end if;
  end loop;
end $$;
