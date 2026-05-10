drop policy if exists "Users read visible course pose index" on public.course_pose_index;

create policy "Users read visible course pose index"
    on public.course_pose_index
    for select
    to anon, authenticated
    using (
        exists (
            select 1
            from public.courses c
            where c.id = course_pose_index.course_id
              and (
                  coalesce(c.is_system, false) = true
                  or auth.uid() = c.user_id
              )
        )
    );
