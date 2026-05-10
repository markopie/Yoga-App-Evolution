/*
  # Drop old two-parameter overload of get_today_curriculum_practice

  The previous migration added a new three-parameter version with
  p_repeat_node_id bigint DEFAULT NULL. The old two-parameter version still
  exists as a separate overload and would be called by existing clients that
  pass only two explicit arguments, bypassing the new parameter.

  Since all parameters in the new version have defaults, dropping the old
  overload causes no breakage: callers passing zero, one, or two arguments
  will resolve to the new three-parameter overload, which behaves identically
  when p_repeat_node_id is NULL.

  No data is affected. No other functions are changed.
*/

DROP FUNCTION IF EXISTS public.get_today_curriculum_practice(text, uuid);
