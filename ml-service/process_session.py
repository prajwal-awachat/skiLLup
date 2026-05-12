import sys
import os
import json
import tempfile
import subprocess
import requests
import time
from faster_whisper import WhisperModel
from transformers import pipeline, M2M100ForConditionalGeneration, M2M100Tokenizer

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

# Initialize M2M100 for translation (English-centric model good for code-switching)
print("Loading M2M100 translation model (this may take 1-2 minutes first time)...", file=sys.stderr)
M2M_MODEL = M2M100ForConditionalGeneration.from_pretrained("facebook/m2m100_418M")
M2M_TOKENIZER = M2M100Tokenizer.from_pretrained("facebook/m2m100_418M")
print("M2M100 model loaded successfully!", file=sys.stderr)

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

def translate_with_m2m100(text, source_lang="hi", target_lang="en"):
    """
    Translate text using M2M100 model (handles mixed languages well)
    M2M100 is English-centric but works well for code-switching
    """
    log(f"Translating with M2M100 (source: {source_lang} -> target: {target_lang})...")
    
    # Split long text into chunks to avoid memory issues
    max_chunk_length = 500  # words per chunk
    words = text.split()
    chunks = [words[i:i+max_chunk_length] for i in range(0, len(words), max_chunk_length)]
    
    if len(chunks) > 1:
        log(f"Text too long, splitting into {len(chunks)} chunks for translation")
    
    translated_chunks = []
    
    for idx, chunk in enumerate(chunks):
        chunk_text = " ".join(chunk)
        log(f"Translating chunk {idx + 1}/{len(chunks)} ({len(chunk_text)} chars)...")
        
        # Set source language (auto-detect or use detected language)
        M2M_TOKENIZER.src_lang = source_lang
        
        # Tokenize and translate
        encoded = M2M_TOKENIZER(chunk_text, return_tensors="pt", truncation=True, max_length=512)
        generated_tokens = M2M_MODEL.generate(
            **encoded,
            forced_bos_token_id=M2M_TOKENIZER.get_lang_id(target_lang),
            max_length=600,
            num_beams=5
        )
        
        translated = M2M_TOKENIZER.batch_decode(generated_tokens, skip_special_tokens=True)[0]
        translated_chunks.append(translated)
        
        # Small delay between chunks to avoid CPU spike
        if idx < len(chunks) - 1:
            time.sleep(0.5)
    
    # Combine all translated chunks
    full_translation = " ".join(translated_chunks)
    log(f"Translation complete! Output length: {len(full_translation)} chars")
    
    return full_translation

def translate_in_batches_long(text, source_lang="auto", target_lang="en"):
    """
    Intelligent batching for very long texts
    Uses M2M100 which has no rate limits and handles mixed languages
    """
    # M2M100 can handle up to 512 tokens per batch
    # ~500 words per batch is safe
    max_batch_chars = 3000
    batches = []
    
    # Split by sentences for better context
    sentences = text.split('. ')
    current_batch = ""
    
    for sentence in sentences:
        if len(current_batch) + len(sentence) < max_batch_chars:
            current_batch += sentence + ". "
        else:
            if current_batch:
                batches.append(current_batch)
            current_batch = sentence + ". "
    
    if current_batch:
        batches.append(current_batch)
    
    log(f"Split text into {len(batches)} batches for translation (max {max_batch_chars} chars each)")
    
    translated_batches = []
    for i, batch in enumerate(batches):
        log(f"Translating batch {i+1}/{len(batches)}...")
        translated = translate_with_m2m100(batch, source_lang, target_lang)
        translated_batches.append(translated)
        
        # No rate limiting needed! M2M100 is local
    
    return " ".join(translated_batches)

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
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Missing arguments. Usage: python process_session.py <cloudinary_url>"
        }))
        sys.exit(1)
    
    cloudinary_url = sys.argv[1]
    # No API key needed for M2M100!
    
    log(f"Starting session processing...")
    log(f"Cloudinary URL: {cloudinary_url[:50]}...")
    log("Using M2M100 for translation (no API limits, completely free!)")
    
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
        
        # Step 4: Translate to English using M2M100 (NO API KEY NEEDED!)
        english_transcript = original_transcript  # fallback
        try:
            # Map detected language to M2M100 language codes
            lang_map = {
                'hi': 'hi',      # Hindi
                'en': 'en',      # English
                'mr': 'mr',      # Marathi
                'ta': 'ta',      # Tamil
                'te': 'te',      # Telugu
                'bn': 'bn',      # Bengali
                'gu': 'gu',      # Gujarati
                'kn': 'kn',      # Kannada
                'ml': 'ml',      # Malayalam
            }
            source_lang = lang_map.get(detected_language[:2], 'hi')
            
            # Use batch processing for long texts
            if len(original_transcript) > 5000:
                english_transcript = translate_in_batches_long(original_transcript, source_lang, 'en')
            else:
                english_transcript = translate_with_m2m100(original_transcript, source_lang, 'en')
            
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
            "originalTranscript": original_transcript,  # FULL transcript - NO DATA LOSS
            "englishTranscript": english_transcript,    # FULL translation - NO DATA LOSS
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