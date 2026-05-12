import sys
import os
import json
import tempfile
import subprocess
import requests
import time
from requests.exceptions import HTTPError, RequestException
from faster_whisper import WhisperModel
from transformers import pipeline

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

# Initialize models
WHISPER_MODEL = WhisperModel(
    "small",
    device="cpu",
    compute_type="int8"
)

SUMMARIZER = pipeline(
    "summarization",
    model="sshleifer/distilbart-cnn-12-6"
)

def log(message):
    """Print logs to stderr so they don't interfere with JSON output"""
    print(message, file=sys.stderr)

def download_video(url, video_path, max_retries=3):
    """Download video with retry logic"""
    for attempt in range(max_retries):
        try:
            log(f"Downloading video from Cloudinary (attempt {attempt + 1}/{max_retries})...")
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            
            total_size = 0
            with open(video_path, "wb") as file:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        file.write(chunk)
                        total_size += len(chunk)
            
            log(f"Video downloaded successfully: {total_size / 1024 / 1024:.2f} MB")
            return True
            
        except Exception as e:
            log(f"Download attempt {attempt + 1} failed: {str(e)}")
            if attempt < max_retries - 1:
                wait_time = 2 ** attempt
                log(f"Retrying in {wait_time} seconds...")
                time.sleep(wait_time)
            else:
                raise
    
    return False

def extract_audio(video_path, audio_path):
    """Extract audio from video using ffmpeg"""
    log("Extracting audio from video...")
    command = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        audio_path
    ]
    
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"FFmpeg error: {result.stderr}")
    
    log(f"Audio extracted successfully to {audio_path}")
    return True

def transcribe_audio(audio_path):
    """Transcribe audio using faster-whisper"""
    log("Starting transcription with Whisper...")
    segments, info = WHISPER_MODEL.transcribe(audio_path, beam_size=5)
    
    transcript = ""
    segment_count = 0
    for segment in segments:
        transcript += segment.text + " "
        segment_count += 1
    
    log(f"Transcription complete: {segment_count} segments, language: {info.language}")
    return transcript.strip(), info.language

def translate_to_english_with_gemini(text, api_key, max_retries=5):
    """Translate text using Gemini API with retry logic and exponential backoff"""
    
    # Truncate text if too long (Gemini has token limits)
    max_chars = 30000
    if len(text) > max_chars:
        log(f"Text too long ({len(text)} chars), truncating to {max_chars} chars")
        text = text[:max_chars]
    
    prompt = f"""
Convert the following transcript into clear English.
Do not summarize.
Do not remove important technical points.
Keep the meaning same.

Transcript:
{text}
"""
    
    # Try multiple models in case one is rate limited
    models_to_try = [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]
    
    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        
        for attempt in range(max_retries):
            try:
                log(f"Attempting translation with {model} (attempt {attempt + 1}/{max_retries})...")
                
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
                    },
                    timeout=90
                )
                
                # Handle rate limiting
                if response.status_code == 429:
                    wait_time = (2 ** attempt) + (attempt * 2)
                    log(f"Rate limited (429) on {model}. Waiting {wait_time} seconds...")
                    time.sleep(wait_time)
                    continue
                
                # Handle 404 - model not found
                if response.status_code == 404:
                    log(f"Model {model} not found (404), trying next model...")
                    break  # Break out of retry loop for this model
                
                # Handle other errors
                if response.status_code != 200:
                    log(f"Error {response.status_code} on {model}: {response.text[:200]}")
                    if attempt == max_retries - 1:
                        continue
                    wait_time = 2 ** attempt
                    time.sleep(wait_time)
                    continue
                
                # Success
                response.raise_for_status()
                data = response.json()
                
                if "candidates" in data and len(data["candidates"]) > 0:
                    translated_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    log(f"Translation successful with {model}")
                    return translated_text
                else:
                    log(f"No candidates in response for {model}")
                    continue
                    
            except HTTPError as e:
                log(f"HTTP error on {model} attempt {attempt + 1}: {str(e)[:100]}")
                if attempt == max_retries - 1:
                    continue
                time.sleep(2 ** attempt)
                
            except RequestException as e:
                log(f"Request error on {model} attempt {attempt + 1}: {str(e)[:100]}")
                if attempt == max_retries - 1:
                    continue
                time.sleep(2 ** attempt)
                
            except Exception as e:
                log(f"Unexpected error on {model} attempt {attempt + 1}: {str(e)[:100]}")
                if attempt == max_retries - 1:
                    continue
                time.sleep(2 ** attempt)
    
    # If all models and retries fail
    raise Exception("All Gemini models failed after multiple retries")

def summarize_english_text(text):
    """Summarize English text using Hugging Face pipeline"""
    log("Starting text summarization...")
    
    # Split text into chunks for summarization
    words = text.split()
    chunks = []
    
    for i in range(0, len(words), 650):
        chunks.append(" ".join(words[i:i + 650]))
    
    log(f"Split into {len(chunks)} chunks for summarization")
    
    chunk_summaries = []
    
    for idx, chunk in enumerate(chunks):
        if len(chunk.split()) < 40:
            log(f"Skipping chunk {idx + 1} - too short ({len(chunk.split())} words)")
            continue
        
        try:
            log(f"Summarizing chunk {idx + 1}/{len(chunks)}...")
            result = SUMMARIZER(
                chunk,
                max_length=150,
                min_length=40,
                do_sample=False
            )
            chunk_summaries.append(result[0]["summary_text"])
        except Exception as e:
            log(f"Error summarizing chunk {idx + 1}: {str(e)}")
            continue
    
    if not chunk_summaries:
        log("No summaries generated, using fallback")
        return {
            "shortSummary": "Summary could not be generated. Please check the recording.",
            "topicsCovered": ["Session recorded"],
            "keyLearnings": ["Review recording for details"],
            "homework": ""
        }
    
    final_summary = " ".join(chunk_summaries)
    
    # Extract topics and learnings from summary
    sentences = [s.strip() for s in final_summary.split(".") if len(s.strip()) > 20]
    
    topics = sentences[:4] if len(sentences) >= 4 else sentences
    learnings = sentences[4:8] if len(sentences) >= 8 else sentences[4:] if len(sentences) > 4 else ["Review session recording"]
    
    log(f"Summary generated: {len(topics)} topics, {len(learnings)} learnings")
    
    return {
        "shortSummary": final_summary,
        "topicsCovered": topics,
        "keyLearnings": learnings,
        "homework": ""
    }

def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Missing arguments. Usage: python process_session.py <cloudinary_url> <gemini_api_key>"
        }))
        sys.exit(1)
    
    cloudinary_url = sys.argv[1]
    gemini_api_key = sys.argv[2]
    
    log(f"Starting session processing...")
    log(f"Cloudinary URL: {cloudinary_url[:50]}...")
    
    temp_dir = tempfile.mkdtemp()
    video_path = os.path.join(temp_dir, "session_video.webm")
    audio_path = os.path.join(temp_dir, "session_audio.wav")
    
    try:
        # Step 1: Download video
        download_video(cloudinary_url, video_path)
        
        # Step 2: Extract audio
        extract_audio(video_path, audio_path)
        
        # Step 3: Transcribe audio
        original_transcript, detected_language = transcribe_audio(audio_path)
        
        if not original_transcript or len(original_transcript.strip()) < 10:
            log("Warning: Transcript is empty or too short")
            original_transcript = "No speech detected in the recording."
        
        log(f"Original transcript length: {len(original_transcript)} chars, Language: {detected_language}")
        
        # Step 4: Translate to English using Gemini
        english_transcript = original_transcript  # fallback
        try:
            english_transcript = translate_to_english_with_gemini(original_transcript, gemini_api_key)
            log(f"English translation length: {len(english_transcript)} chars")
        except Exception as e:
            log(f"Translation failed: {str(e)}")
            log("Using original transcript as fallback")
        
        # Step 5: Summarize
        summary = summarize_english_text(english_transcript)
        
        # IMPORTANT: Only print the JSON to stdout - NO other prints!
        result = {
            "success": True,
            "detectedLanguage": detected_language,
            "originalTranscript": original_transcript[:5000],
            "englishTranscript": english_transcript[:5000],
            "summary": summary
        }
        
        # This is the ONLY output to stdout
        print(json.dumps(result))
        
    except Exception as e:
        log(f"Error in main process: {str(e)}")
        # Error JSON also goes to stdout
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        
    finally:
        # Cleanup temporary files
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
                log(f"Deleted: {video_path}")
            if os.path.exists(audio_path):
                os.remove(audio_path)
                log(f"Deleted: {audio_path}")
            if os.path.exists(temp_dir):
                os.rmdir(temp_dir)
                log(f"Deleted: {temp_dir}")
        except Exception as cleanup_error:
            log(f"Cleanup error: {cleanup_error}")

if __name__ == "__main__":
    main()