'use client';

import { useEffect, useRef, useState } from 'react';

interface AudioPlayerProps {
  src: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer({ src }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(1); // default 1x

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = SPEEDS[speedIndex];
    }
  }, [speedIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), duration || audio.duration);
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const value = Number(e.target.value);
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const cycleSpeed = () => {
    setSpeedIndex((prev) => (prev + 1) % SPEEDS.length);
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="my-6 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-sm px-6 py-3 md:px-8 md:py-4">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-4 md:gap-6">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex-shrink-0 w-11 h-11 md:w-[3.25rem] md:h-[3.25rem] rounded-full bg-yellow-400 hover:bg-yellow-300 transition-colors flex items-center justify-center shadow-lg shadow-yellow-400/20"
        >
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6 fill-black">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6 fill-black ml-1">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Progress bar */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={onSeek}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/15 accent-yellow-400"
            style={{
              background: `linear-gradient(to right, #facc15 ${progressPct}%, rgba(255,255,255,0.15) ${progressPct}%)`,
            }}
          />
          <div className="flex justify-between mt-1 text-white/50 text-xs tracking-wide">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Skip buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => skip(-15)}
            aria-label="Back 15 seconds"
            className="w-9 h-9 rounded-full border border-white/15 text-white/70 hover:text-yellow-400 hover:border-yellow-400/50 transition-colors flex items-center justify-center text-xs font-medium"
          >
            15«
          </button>
          <button
            onClick={() => skip(15)}
            aria-label="Forward 15 seconds"
            className="w-9 h-9 rounded-full border border-white/15 text-white/70 hover:text-yellow-400 hover:border-yellow-400/50 transition-colors flex items-center justify-center text-xs font-medium"
          >
            »15
          </button>
          <button
            onClick={cycleSpeed}
            aria-label="Playback speed"
            className="w-11 h-9 rounded-full border border-white/15 text-white/70 hover:text-yellow-400 hover:border-yellow-400/50 transition-colors flex items-center justify-center text-xs font-medium"
          >
            {SPEEDS[speedIndex]}x
          </button>
        </div>
      </div>

      <p className="text-white/40 text-xs italic mt-2 tracking-wide text-center">
        Narrated by ElevenLabs
      </p>
    </div>
  );
}
