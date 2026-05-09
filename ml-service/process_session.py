import sys
import os
import json
import tempfile
import subprocess
import requests
from faster_whisper import WhisperModel
from transformers import pipeline

WHISPER_MODEL = WhisperModel(
    "small",
    device="cpu",
    compute_type="int8"
)

SUMMARIZER = pipeline(
    "summarization",
    model="sshleifer/distilbart-cnn-12-6"
)

def download_video(url, video_path):
    response = requests.get(url, stream=True)
    response.raise_for_status()

    with open(video_path, "wb") as file:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                file.write(chunk)

def extract_audio(video_path, audio_path):
    command = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        audio_path
    ]
    subprocess.run(command, check=True)

def transcribe_audio(audio_path):
    
    segments, info = WHISPER_MODEL.transcribe(audio_path, beam_size=5)

    transcript = ""
    for segment in segments:
        transcript += segment.text + " "

    return transcript.strip(), info.language

def translate_to_english_with_gemini(text, api_key):
    prompt = f"""
Convert the following transcript into clear English.
Do not summarize.
Do not remove important technical points.
Keep the meaning same.

Transcript:
{text}
"""

    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

    response = requests.post(
        url,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key
        },
        json={
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ]
        }
    )

    response.raise_for_status()
    data = response.json()

    return data["candidates"][0]["content"]["parts"][0]["text"]

def summarize_english_text(text):

    words = text.split()
    chunks = []

    for i in range(0, len(words), 650):
        chunks.append(" ".join(words[i:i + 650]))

    chunk_summaries = []

    for chunk in chunks:

        if len(chunk.split()) < 40:
            continue

        result = SUMMARIZER(
            chunk,
            max_length=150,
            min_length=40,
            do_sample=False
        )

        chunk_summaries.append(
            result[0]["summary_text"]
        )

    final_summary = " ".join(chunk_summaries)

    sentences = [
        s.strip()
        for s in final_summary.split(".")
        if len(s.strip()) > 20
    ]

    topics = sentences[:4]

    learnings = sentences[4:8]

    return {
        "shortSummary": final_summary,
        "topicsCovered": topics,
        "keyLearnings": learnings,
        "homework": ""
    }

def extract_bullets(text, limit):
    sentences = text.replace("\n", " ").split(".")
    bullets = []

    for sentence in sentences:
        clean = sentence.strip()
        if len(clean) > 25:
            bullets.append(clean)
        if len(bullets) == limit:
            break

    return bullets

def main():
    cloudinary_url = sys.argv[1]
    gemini_api_key = sys.argv[2]

    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, "session_video.webm")
    audio_path = os.path.join(temp_dir, "session_audio.wav")

    try:
        download_video(cloudinary_url, video_path)
        extract_audio(video_path, audio_path)

        original_transcript, detected_language = transcribe_audio(audio_path)

        english_transcript = translate_to_english_with_gemini(
            original_transcript,
            gemini_api_key
        )

        summary = summarize_english_text(english_transcript)

        print(json.dumps({
            "success": True,
            "detectedLanguage": detected_language,
            "originalTranscript": original_transcript,
            "englishTranscript": english_transcript,
            "summary": summary
        }))

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))

    finally:
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
            if os.path.exists(audio_path):
                os.remove(audio_path)
            os.rmdir(temp_dir)
        except:
            pass

if __name__ == "__main__":
    main()