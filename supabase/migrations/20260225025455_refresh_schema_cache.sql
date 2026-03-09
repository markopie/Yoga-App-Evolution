/*
  # Refresh Schema Cache

  This migration notifies PostgREST to reload its schema cache
  so that all columns in user_stages (including full_technique) are recognized.
*/

NOTIFY pgrst, 'reload schema';
