alter table public.program_curriculum
drop constraint if exists program_curriculum_node_type_check;

alter table public.program_curriculum
add constraint program_curriculum_node_type_check
check (
  node_type in (
    'sequence',
    'composed_sequence',
    'revision',
    'choice',
    'recovery',
    'consolidation',
    'mastery_gate',
    'instruction',
    'assessment',
    'reserve',
    'rest'
  )
);

alter table public.program_curriculum
drop constraint if exists program_curriculum_completion_requirement_check;

alter table public.program_curriculum
add constraint program_curriculum_completion_requirement_check
check (
  completion_requirement in (
    'none',
    'attempt',
    'complete',
    'complete_all_parts',
    'repeat_until_ready',
    'optional',
    'choose_one',
    'acknowledge'
  )
);
