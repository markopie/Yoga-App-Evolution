## Plan: Migrate app from cloud Supabase to local Docker-backed Supabase

TL;DR - Make the app use a configurable local Supabase target instead of the hardcoded cloud project, leverage the existing `supabase/config.toml` local stack, and add a home-network option so your Android phone can still connect while at home.

**Steps**
1. Update the runtime Supabase bootstrap in `src/services/supabaseClient.js` so it no longer hardcodes the remote URL/key.
   - Replace the fixed cloud values with a small config-export or fallback mechanism.
   - Prefer a local config file or build-time env-driven values instead of embedding the hosted project URL.
2. Add a local Supabase runtime config artifact in the repo.
   - Add a new file such as `src/config/supabaseRuntimeConfig.js` or `src/services/localSupabaseConfig.js`.
   - Export `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and a boolean switch or selector for local vs remote target.
3. Add a root `.env.example` and `.env.local` pattern for local Supabase values.
   - Example values: `SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_ANON_KEY=<local anon key>`, `SUPABASE_DB_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres`.
   - Keep real keys out of source control.
4. Use the existing local Supabase CLI config in `supabase/config.toml`.
   - Confirm `api.port = 54321` and `db.port = 54322` are correct.
   - For Android-phone use on LAN, update `auth.site_url` and `auth.additional_redirect_urls` to include `http://<machine-ip>:3000` if you plan to use OAuth.
5. Run the local Supabase Docker stack.
   - Install Docker Desktop and Supabase CLI if not already installed.
   - Start the stack from repo root using `supabase start`.
   - Reset the local DB with `supabase db reset` to replay the committed migrations.
6. Validate the local runtime.
   - Run the app locally and confirm it connects to `http://127.0.0.1:54321`.
   - If using `npm run dev`, run it with `--host 0.0.0.0` or otherwise serve the app on the LAN-accessible address.
7. Test Android home access.
   - Access the app from your phone via `http://<pc-ip>:3000` on the same Wi-Fi network.
   - If the phone must use Google Auth, ensure `supabase/config.toml` and the local app URL match the phone-accessible host.
   - If you only need anonymous guest usage, this is much simpler and likely sufficient.

**Relevant files**
- `src/services/supabaseClient.js` — change the hardcoded cloud client bootstrap.
- `supabase/config.toml` — confirm local ports and update auth redirect/site URL for LAN access.
- `src/config/appConfig.js` — review the remaining remote storage asset base URL if you want full local isolation.
- new root `.env.example` / `.env.local` — store local Supabase addresses and keys.

**Verification**
1. Start the local Supabase stack and confirm `supabase start` completes without errors.
2. Run `supabase db reset` and verify the migrations replay.
3. Launch the app and verify the browser client uses local Supabase instead of the cloud URL.
4. Open the app on Android via the host machine IP and confirm it loads and reads data from local Supabase.
5. If using auth, verify login works with the new local redirect URL.

**Decisions**
- Use local Supabase only for development and personal use; do not migrate the production cloud project yet.
- Keep the cloud storage URL in mind as a separate future task if you want fully local storage.
- Prefer local anonymous/guest auth on Android for a simpler home-only flow.

**Further Considerations**
1. The app currently still references cloud storage in `src/config/appConfig.js`; if you need complete local operation, that will need its own migration.
2. If you want the app accessible on Android at home, the machine must serve both the app and local Supabase on a LAN-accessible host/IP.
3. If you want to use real Google OAuth on the phone, local auth redirect URLs must be updated and the Supabase auth site URL must be aligned with the phone-accessible address.
