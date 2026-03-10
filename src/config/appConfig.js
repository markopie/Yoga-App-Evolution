const BASE_RAW_URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/";

const COURSES_URL = `${BASE_RAW_URL}courses.json`;
const MANIFEST_URL = `${BASE_RAW_URL}manifest.json`;
const ASANA_LIBRARY_URL = `${BASE_RAW_URL}asana_library.json`;
const LIBRARY_URL = ASANA_LIBRARY_URL;
const ID_ALIASES_URL = `${BASE_RAW_URL}id_aliases.json`;

// Current production deployment serves media from an external host.
const IMAGES_BASE = "https://arrowroad.com.au/yoga/images/";
const AUDIO_BASE = "https://arrowroad.com.au/yoga/audio/";
const IMAGES_BASE_URL = IMAGES_BASE;

const COMPLETION_LOG_URL = "completion_log.php";
const LOCAL_SEQ_KEY = "yoga_sequences_v1";

export {
  BASE_RAW_URL,
  COURSES_URL,
  MANIFEST_URL,
  ASANA_LIBRARY_URL,
  LIBRARY_URL,
  ID_ALIASES_URL,
  IMAGES_BASE,
  AUDIO_BASE,
  IMAGES_BASE_URL,
  COMPLETION_LOG_URL,
  LOCAL_SEQ_KEY,
};
