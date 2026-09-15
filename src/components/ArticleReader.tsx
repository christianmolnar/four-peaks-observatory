'use client';

import { useEffect, useRef, useState } from 'react';

interface ArticleReaderProps {
  /** CSS selector (relative to document) for the container whose text should be read aloud */
  targetSelector: string;
}

/**
 * Free, client-only "Listen to this article" control.
 * Uses the browser's built-in Web Speech API (speechSynthesis) — no API keys,
 * no backend, no cost. Voice quality depends on the visitor's OS/browser.
 */
export default function ArticleReader({ targetSelector }: ArticleReaderProps) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceIndex, setVoiceIndex] = useState(0);
  const [rate, setRate] = useState(1);
  const [readMinutes, setReadMinutes] = useState<number | null>(null);
  const [listenMinutes, setListenMinutes] = useState<number | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const charIndexRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    setSupported(true);

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      const englishVoices = all.filter((v) => v.lang.startsWith('en'));
      setVoices(englishVoices.length ? englishVoices : all);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Estimate reading and listening time once the article text is available.
  useEffect(() => {
    const el = document.querySelector(targetSelector);
    if (!el) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('figure, figcaption').forEach((n) => n.remove());
    const text = clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const wordCount = text.length ? text.split(' ').length : 0;
    if (!wordCount) return;

    // Average adult silent reading speed (~200 wpm) and average natural
    // speech rate (~150 wpm at 1x) are standard estimates for this kind of label.
    setReadMinutes(Math.max(1, Math.round(wordCount / 200)));
    setListenMinutes(Math.max(1, Math.round(wordCount / 150)));
  }, [targetSelector]);

  const fullTextRef = useRef<string>('');

  const getArticleText = (): string => {
    const el = document.querySelector(targetSelector);
    if (!el) return '';
    // Skip figure captions and source/citation lines to keep the narration clean
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('figure, figcaption').forEach((n) => n.remove());
    return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  };

  // Speak starting at a given character offset into the full article text.
  // Needed because changing voice/rate mid-speech requires cancel + re-speak
  // (the Web Speech API has no way to change these on an in-flight utterance).
  const speakFrom = (offset: number, rateOverride?: number, voiceOverride?: SpeechSynthesisVoice) => {
    window.speechSynthesis.cancel();
    const text = fullTextRef.current.slice(offset);
    if (!text) {
      setStatus('idle');
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rateOverride ?? rate;
    const chosenVoice = voiceOverride ?? voices[voiceIndex];
    if (chosenVoice) utterance.voice = chosenVoice;
    utterance.onboundary = (e) => {
      charIndexRef.current = offset + e.charIndex;
    };
    utterance.onend = () => {
      charIndexRef.current = 0;
      setStatus('idle');
    };
    utterance.onerror = () => setStatus('idle');
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setStatus('playing');
  };

  const handlePlay = () => {
    if (!supported) return;

    if (status === 'paused') {
      window.speechSynthesis.resume();
      setStatus('playing');
      return;
    }

    fullTextRef.current = getArticleText();
    charIndexRef.current = 0;
    speakFrom(0);
  };

  const handlePause = () => {
    window.speechSynthesis.pause();
    setStatus('paused');
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    charIndexRef.current = 0;
    setStatus('idle');
  };

  // Applying a new voice or rate mid-playback requires restarting the
  // utterance from where we left off, since speechSynthesis can't update
  // an in-progress utterance's voice/rate live.
  const handleVoiceChange = (index: number) => {
    setVoiceIndex(index);
    if (status === 'playing' || status === 'paused') {
      speakFrom(charIndexRef.current, undefined, voices[index]);
    }
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    if (status === 'playing' || status === 'paused') {
      speakFrom(charIndexRef.current, newRate);
    }
  };

  if (!supported) return null;

  return (
    <div className="mb-10 rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm p-4 md:p-5 flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-yellow-400/90 text-xs uppercase tracking-[0.2em]">Listen to this article</span>
        {readMinutes !== null && listenMinutes !== null && (
          <span className="text-white/40 text-xs">
            {readMinutes} min read &middot; {listenMinutes} min listen
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {status !== 'playing' ? (
          <button
            onClick={handlePlay}
            className="inline-flex items-center gap-2 rounded-full bg-yellow-400/90 hover:bg-yellow-300 text-black text-sm font-medium px-4 py-1.5 transition-colors"
            aria-label={status === 'paused' ? 'Resume reading' : 'Play article'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            {status === 'paused' ? 'Resume' : 'Play'}
          </button>
        ) : (
          <button
            onClick={handlePause}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-1.5 transition-colors border border-white/20"
            aria-label="Pause reading"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            Pause
          </button>
        )}

        {status !== 'idle' && (
          <button
            onClick={handleStop}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 hover:bg-white/15 text-white/70 text-sm px-4 py-1.5 transition-colors border border-white/10"
            aria-label="Stop reading"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" /></svg>
            Stop
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {voices.length > 0 && (
          <select
            value={voiceIndex}
            onChange={(e) => handleVoiceChange(Number(e.target.value))}
            className="bg-black/60 border border-white/20 rounded-md text-white/80 text-xs px-2 py-1.5 max-w-[160px]"
            aria-label="Choose a voice"
          >
            {voices.map((v, i) => (
              <option key={`${v.name}-${i}`} value={i}>
                {v.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={rate}
          onChange={(e) => handleRateChange(Number(e.target.value))}
          className="bg-black/60 border border-white/20 rounded-md text-white/80 text-xs px-2 py-1.5"
          aria-label="Playback speed"
        >
          <option value={0.75}>0.75x</option>
          <option value={1}>1x</option>
          <option value={1.25}>1.25x</option>
          <option value={1.5}>1.5x</option>
        </select>
      </div>
    </div>
  );
}
