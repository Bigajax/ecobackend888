import sys
import os

if __name__ == "__main__":
    audio_path = sys.argv[1]
    # This is a mock script. In a real scenario, this would
    # use a speech-to-text library to transcribe the audio.
    print(f"transcribed text for {os.path.basename(audio_path)}")
