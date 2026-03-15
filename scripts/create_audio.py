import os
import re
import subprocess
import tempfile
from pathlib import Path
from dotenv import load_dotenv
from workbench import supabase
from elevenlabs import VoiceSettings
from elevenlabs.client import ElevenLabs

# Assuming your environment already has 'supabase' defined from your workbench

# --- CONFIGURATION ---
load_dotenv()  # This looks for the .env file in your root
API_KEY = os.getenv("ELEVENLABS_API_KEY")
VOICE_ID = "ZUrEGyu8GFMwnHbvLhv2"
MODEL_ID = "eleven_multilingual_v2"
OUTPUT_FOLDER = "yoga_stage_audio"
SIDE_CUE_SILENCE_MS = 300

client = ElevenLabs(api_key=API_KEY)

# (filename, tts_text, silence_ms)
TASKS = [
    # Side cues — 300ms silence prefix fixes browser audio startup cutoff
    ("left_side.mp3",                                        "left side.",                                   SIDE_CUE_SILENCE_MS),
    ("right_side.mp3",                                       "right side.",                                  SIDE_CUE_SILENCE_MS),
    # Bridge connector phrase variants
    ("bridge_stage_2.mp3",                                   "now,",                                         0),
    ("bridge_stage_3.mp3",                                   "moving into,",                                 0),
    # Asana re-records with corrected Sanskrit phonetics
    ("061_ArdhaBaddhaPadmaPaschimottanasana.mp3",            "Ardha Baddha Padma Pashimottanasana",          0),
    ("062_TriangaMukhaikapadaPaschimottanasana.mp3",         "Trianga Mukhaikapada Pashimottanasana",        0),
    ("067_Brahmacharyasana.mp3",                             "Brahmacharyasana",                             0),
    ("068_ParivrttaPaschimottanasana.mp3",                   "Parivrtta Pashimottanasana",                   0),
    ("069_UrdhvaMukhaPaschimottanasanaI.mp3",                "Urdva Mukha Pashimottanasana the first",       0),
    ("071_UrdhvaMukhaPaschimottanasanaII.mp3",               "Urdva Mukha Pashimottanasana the second",      0),
    ("031_BhujangasanaI.mp3",                                "Bhoojangasana",                                0),
]

if not os.path.exists(OUTPUT_FOLDER):
    os.makedirs(OUTPUT_FOLDER)

def prepend_silence(mp3_bytes: bytes, silence_ms: int) -> bytes:
    """Prepend N ms of silence via ffmpeg. Returns original bytes on failure."""
    if silence_ms <= 0:
        return mp3_bytes
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(mp3_bytes)
        src = f.name
    out = src.replace(".mp3", "_s.mp3")
    try:
        subprocess.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-t", f"{silence_ms / 1000:.3f}",
            "-i", "anullsrc=r=24000:cl=mono",
            "-i", src,
            "-filter_complex", "[0][1]concat=n=2:v=0:a=1[o]",
            "-map", "[o]",
            "-codec:a", "libmp3lame", "-q:a", "4",
            out,
        ], check=True, capture_output=True)
        result = Path(out).read_bytes()
    except subprocess.CalledProcessError as e:
        print(f"⚠️  ffmpeg failed: {e.stderr.decode()[:200]}")
        result = mp3_bytes
    finally:
        for p in (src, out):
            try: os.unlink(p)
            except OSError: pass
    return result


def generate_audio():
    print(f"🎙️ Generating audio for {len(TASKS)} tasks...")
    Path(OUTPUT_FOLDER).mkdir(exist_ok=True)

    for filename, text, silence_ms in TASKS:
        filepath = os.path.join(OUTPUT_FOLDER, filename)
        print(f"\n🔊 {filename}  →  say: {text!r}  silence: {silence_ms}ms")
        try:
            audio_generator = client.text_to_speech.convert(
                text=text,
                voice_id=VOICE_ID,
                model_id=MODEL_ID,
                voice_settings=VoiceSettings(
                    stability=0.5,
                    similarity_boost=0.75,
                    style=0.0,
                    use_speaker_boost=True,
                    speed=0.80,  # slightly slower for Sanskrit clarity
                ),
            )
            raw = b"".join(chunk for chunk in audio_generator)
            mp3 = prepend_silence(raw, silence_ms)
            Path(filepath).write_bytes(mp3)
            print(f"   ✅ Saved  →  {filepath}")
        except Exception as e:
            print(f"   ❌ Error: {e}")

    print(f"\n✨ Done! Files in /{OUTPUT_FOLDER}")


if __name__ == "__main__":
    generate_audio()