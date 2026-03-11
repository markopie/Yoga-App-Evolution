const BASE_RAW_URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/";

const COURSES_URL = `${BASE_RAW_URL}courses.json`;
const MANIFEST_URL = `${BASE_RAW_URL}manifest.json`;
const ASANA_LIBRARY_URL = `${BASE_RAW_URL}asana_library.json`;
const LIBRARY_URL = ASANA_LIBRARY_URL;
const ID_ALIASES_URL = `${BASE_RAW_URL}id_aliases.json`;

// Current production deployment serves media from an external host.
const AUDIO_BASE = "https://qrcpiyncvfmpmeuyhsha.supabase.co/storage/v1/object/public/audio-assets/";

const COMPLETION_LOG_URL = "completion_log.php";
const LOCAL_SEQ_KEY = "yoga_sequences_v1";

export {
  BASE_RAW_URL,
  COURSES_URL,
  MANIFEST_URL,
  ASANA_LIBRARY_URL,
  LIBRARY_URL,
  ID_ALIASES_URL,
  AUDIO_BASE,
  COMPLETION_LOG_URL,
  LOCAL_SEQ_KEY,
};
