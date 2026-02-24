/*
  # Reload PostgREST Schema Cache

  Forces PostgREST to reload its schema cache so newly created tables
  (user_asanas, user_stages) are recognized correctly.

  This resolves the "Could not find column in schema cache" error that
  appears immediately after new tables are created.
*/

NOTIFY pgrst, 'reload schema';
