// The base URL for any remaining raw assets on GitHub (images/icons)
const BASE_RAW_URL = "https://raw.githubusercontent.com/markopie/Yoga-App-Evolution/main/";

// Current production deployment serves media from Supabase Storage
const AUDIO_BASE = "https://qrcpiyncvfmpmeuyhsha.supabase.co/storage/v1/object/public/audio-assets/";

/**
 * BRIDGE_SKIP_PROBABILITY
 * Probability (0.0–1.0) that bridge_stage.mp3 is skipped on any given staged pose.
 * 0.0 = bridge always plays. 1.0 = bridge never plays.
 */
const BRIDGE_SKIP_PROBABILITY = 0.5;

export {
  BASE_RAW_URL,
  AUDIO_BASE,
  BRIDGE_SKIP_PROBABILITY,
};