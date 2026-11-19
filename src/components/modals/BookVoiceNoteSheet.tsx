import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { AVATAR_TONES } from '../../config/index.js';
import { formatShortShelfDate } from '../../features/rotations/usage-insights.js';
import {
  computeOwnerInitials,
  type BookAudioRecording,
  type ChildProfile,
} from '../../types/models.js';

function formatAudioTime(seconds: number): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Generates deterministic bar heights (0.24..1.0) seeded from clip ID so every saved
 * recording displays an authentic-looking static silhouette that fills dynamically on playback.
 */
function buildWaveformBars(seedId: string, count = 28): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seedId.length; i += 1) {
    hash ^= seedId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i += 1) {
    hash ^= (i + 1) * 374761393;
    hash = Math.imul(hash, 668265263);
    const norm = ((hash >>> 0) % 1000) / 1000;
    // Slight natural envelope: softer near ends, richer in middle
    const env = 0.65 + 0.35 * Math.sin((Math.PI * (i + 1)) / (count + 1));
    bars.push(Math.max(0.24, Math.min(1, (0.28 + norm * 0.72) * env)));
  }
  return bars;
}

interface WaveformScrubberProps {
  seedId: string;
  srcUrl?: string;
  durationSec: number;
  label?: string;
  /** Live bar levels (0..1) while actively recording */
  liveLevels?: number[];
}

export const WaveformScrubber: React.FC<WaveformScrubberProps> = ({
  seedId,
  srcUrl,
  durationSec,
  label = 'Voice note',
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(durationSec || 0);

  useEffect(() => {
    setResolvedDuration(durationSec || 0);
  }, [durationSec]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [srcUrl]);

  const bars = useMemo(() => buildWaveformBars(seedId, 28), [seedId]);

  const effectiveDuration =
    resolvedDuration > 0 && Number.isFinite(resolvedDuration) ? resolvedDuration : durationSec || 1;
  const progress = Math.max(0, Math.min(1, currentTime / Math.max(0.1, effectiveDuration)));

  const handleTogglePlay = async () => {
    const el = audioRef.current;
    if (!el || !srcUrl) return;
    if (isPlaying) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeekAtRatio = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const el = audioRef.current;
    if (!el || !srcUrl) return;
    const nextSec = clamped * effectiveDuration;
    el.currentTime = nextSec;
    setCurrentTime(nextSec);
  };

  const handleBarContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    handleSeekAtRatio((e.clientX - rect.left) / rect.width);
  };

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {srcUrl && (
        <audio
          ref={audioRef}
          src={srcUrl}
          preload="metadata"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0 && d < 36000) {
              setResolvedDuration(d);
            }
          }}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime || 0);
          }}
          className="hidden"
        />
      )}

      <button
        type="button"
        onClick={handleTogglePlay}
        disabled={!srcUrl}
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
        className="w-9 h-9 rounded-full bg-primary hover:bg-primary-hover disabled:opacity-45 text-primary-fg flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
      >
        <Icon name={isPlaying ? 'pause' : 'playFilled'} className="w-3.5 h-3.5" />
      </button>

      {/* Interactive Vertical Waveform Bars */}
      <div
        role="slider"
        tabIndex={srcUrl ? 0 : -1}
        aria-label={`Audio progress for ${label}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(effectiveDuration)}
        aria-valuenow={Math.round(currentTime)}
        onClick={handleBarContainerClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') handleSeekAtRatio(progress + 0.1);
          if (e.key === 'ArrowLeft') handleSeekAtRatio(progress - 0.1);
        }}
        className="flex-1 min-w-0 h-8 flex items-center gap-[2.5px] cursor-pointer select-none py-1"
      >
        {bars.map((heightNorm, idx) => {
          const barThreshold = (idx + 0.5) / bars.length;
          const isFilled = progress > 0 && barThreshold <= progress;
          return (
            <span
              key={idx}
              style={{ height: `${Math.round(heightNorm * 100)}%` }}
              className={`flex-1 min-w-[2px] max-w-[5px] rounded-full transition-colors duration-100 ${
                isFilled ? 'bg-primary' : 'bg-edge'
              }`}
            />
          );
        })}
      </div>

      <span className="text-[11px] font-mono-tabular text-ink-secondary shrink-0 whitespace-nowrap">
        {isPlaying || currentTime > 0
          ? `${formatAudioTime(currentTime)} / ${formatAudioTime(effectiveDuration)}`
          : formatAudioTime(effectiveDuration)}
      </span>
    </div>
  );
};

interface VoiceWaveformPlayerProps {
  recording: BookAudioRecording;
  srcUrl?: string;
  authorProfile?: ChildProfile | null;
  forProfile?: ChildProfile | null;
  onDelete: (recordingId: string) => Promise<void>;
}

export const VoiceWaveformPlayer: React.FC<VoiceWaveformPlayerProps> = ({
  recording,
  srcUrl,
  authorProfile,
  forProfile,
  onDelete,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const authorName = authorProfile?.name || 'Household';
  const authorTone =
    AVATAR_TONES[authorProfile?.avatarTone || 'teal'] || AVATAR_TONES.teal;
  const authorInitial = authorProfile
    ? computeOwnerInitials(authorProfile.name)
    : 'H';
  const titleLabel =
    recording.title ||
    (authorProfile ? `Voice note by ${authorProfile.name}` : 'Voice recording');

  return (
    <div className="rounded-xl bg-surface border border-edge p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-8 h-8 rounded-full text-[11px] font-bold inline-flex items-center justify-center shrink-0 ${
              authorProfile
                ? authorTone
                : 'bg-surface-subtle border border-edge text-ink-secondary'
            }`}
            title={`Recorded by ${authorName}`}
          >
            {authorInitial}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink truncate">{titleLabel}</p>
            <p className="text-[11px] text-ink-muted truncate">
              By {authorName}
              {forProfile ? ` · For ${forProfile.name}` : ''}
              {recording.createdAt ? ` · ${formatShortShelfDate(recording.createdAt)}` : ''}
            </p>
          </div>
        </div>

        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete voice note ${titleLabel}`}
            className="min-h-[32px] min-w-[32px] rounded-lg text-ink-muted hover:text-[#8C4A4F] dark:hover:text-[#C48A8E] hover:bg-surface-subtle flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded bg-surface-subtle border border-edge text-[10px] font-semibold text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onDelete(recording.id)}
              className="px-2 py-1 rounded bg-[#8C4A4F] text-[#FFFCF5] text-[10px] font-semibold cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <WaveformScrubber
        seedId={recording.id}
        srcUrl={srcUrl}
        durationSec={recording.durationSec}
        label={titleLabel}
      />
    </div>
  );
};

interface BookVoiceNoteSheetProps {
  isOpen: boolean;
  profiles: ChildProfile[];
  defaultAuthorId?: string;
  onClose: () => void;
  onSaveRecording: (payload: {
    title?: string;
    durationSec: number;
    mimeType: string;
    blob: Blob;
    authorProfileId?: string;
    forProfileId?: string;
  }) => Promise<void>;
}

export const BookVoiceNoteSheet: React.FC<BookVoiceNoteSheetProps> = ({
  isOpen,
  profiles,
  defaultAuthorId = '',
  onClose,
  onSaveRecording,
}) => {
  const [titleDraft, setTitleDraft] = useState('');
  const [authorId, setAuthorId] = useState(defaultAuthorId);
  const [forProfileId, setForProfileId] = useState('');
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>(() => Array(20).fill(0.25));
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewDurationSec, setPreviewDurationSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const cancelDiscardRef = useRef<boolean>(false);
  const analyserRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const previewUrlRef = useRef<string>('');

  const cleanupRecordingHardware = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (analyserRafRef.current !== null) {
      window.cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        // ignore close errors
      }
      audioCtxRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.onstop = null;
        rec.stop();
      } catch {
        // ignore stop errors
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((tr) => tr.stop());
      mediaStreamRef.current = null;
    }
  };

  const clearPreviewState = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setPreviewUrl('');
    setPreviewBlob(null);
    setPreviewDurationSec(0);
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setTitleDraft('');
      setAuthorId(defaultAuthorId);
      setForProfileId('');
      setPhase('idle');
      setElapsedSec(0);
      setSaving(false);
    } else {
      cancelDiscardRef.current = true;
      cleanupRecordingHardware();
      clearPreviewState();
    }
  }, [isOpen, defaultAuthorId]);

  useEffect(() => {
    return () => {
      cancelDiscardRef.current = true;
      cleanupRecordingHardware();
      clearPreviewState();
    };
  }, []);

  if (!isOpen) return null;

  const handleStartRecording = async () => {
    setError('');
    clearPreviewState();
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelDiscardRef.current = false;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setPhase('recording');

      // Live meter bars via Web Audio API when available
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioCtxRef.current = ctx;
          const src = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          src.connect(analyser);
          const freq = new Uint8Array(analyser.frequencyBinCount);
          const tickLevels = () => {
            analyser.getByteFrequencyData(freq);
            const avg =
              freq.reduce((acc, v) => acc + v, 0) / Math.max(1, freq.length) / 255;
            const boosted = Math.min(1, Math.max(0.18, avg * 2.2));
            setLiveLevels((prev) => [...prev.slice(1), boosted]);
            analyserRafRef.current = window.requestAnimationFrame(tickLevels);
          };
          analyserRafRef.current = window.requestAnimationFrame(tickLevels);
        }
      } catch {
        // Fallback gentle timer animation if AudioContext unavailable
      }

      timerRef.current = window.setInterval(() => {
        setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      }, 250);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const wasCancelled = cancelDiscardRef.current;
        const duration = Math.max(0.5, (Date.now() - startedAtRef.current) / 1000);
        const mimeType = recorder.mimeType || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];
        cleanupRecordingHardware();

        if (wasCancelled) {
          setPhase('idle');
          setElapsedSec(0);
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          previewUrlRef.current = url;
          setPreviewBlob(blob);
          setPreviewUrl(url);
          setPreviewDurationSec(duration);
          setPhase('preview');
        } else {
          setPhase('idle');
          setError('No audio was captured. Check microphone input and try again.');
        }
      };

      recorder.start();
    } catch (err) {
      cleanupRecordingHardware();
      setPhase('idle');
      setError(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}`
          : 'Microphone permission denied or unavailable.'
      );
    }
  };

  const handleStopAndPreview = () => {
    cancelDiscardRef.current = false;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupRecordingHardware();
      setPhase('idle');
    }
  };

  const handleCancelRecording = () => {
    cancelDiscardRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupRecordingHardware();
      setPhase('idle');
    }
    setElapsedSec(0);
  };

  const handleDiscardPreview = () => {
    clearPreviewState();
    setPhase('idle');
    setElapsedSec(0);
  };

  const handleSave = async () => {
    if (!previewBlob) return;
    setSaving(true);
    setError('');
    try {
      await onSaveRecording({
        title: titleDraft.trim() || undefined,
        durationSec: previewDurationSec,
        mimeType: previewBlob.type || 'audio/webm',
        blob: previewBlob,
        authorProfileId: authorId || undefined,
        forProfileId: forProfileId || undefined,
      });
      clearPreviewState();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const selectedAuthor = profiles.find((p) => p.id === authorId);

  return (
    <div
      data-backdrop-action="close-voice-sheet"
      className="fixed inset-0 z-[75] bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 text-left"
      onClick={() => {
        if (phase === 'recording') handleCancelRecording();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Record voice note"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-up w-full max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-surface border border-edge shadow-2xl overflow-hidden pb-safe sm:pb-0"
      >
        <div
          className="w-10 h-1 bg-edge rounded-full mx-auto mt-3 shrink-0 sm:hidden"
          aria-hidden="true"
        />

        {/* Sheet Header */}
        <div className="px-5 pt-4 pb-2 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted inline-flex items-center gap-1.5">
              <Icon name="mic" className="w-3.5 h-3.5 text-primary" />
              <span>Voice Notes &amp; Read-Alouds</span>
            </p>
            <h3 className="font-display text-2xl font-semibold text-ink mt-1 leading-tight">
              {phase === 'recording'
                ? 'Recording voice note…'
                : phase === 'preview'
                  ? 'Listen & save voice note'
                  : 'Record a family voice note'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              if (phase === 'recording') handleCancelRecording();
              onClose();
            }}
            aria-label="Close voice recorder"
            className="min-h-[40px] min-w-[40px] rounded-full text-ink-muted hover:text-ink hover:bg-surface-elevated flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Icon name="close" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 pt-2 space-y-4">
          {error && (
            <p role="alert" className="text-xs font-medium text-[#8C4A4F] dark:text-[#C48A8E]">
              {error}
            </p>
          )}

          {/* Metadata Inputs (editable before or after recording before save) */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="voice-sheet-title"
                className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1"
              >
                Clip label (optional)
              </label>
              <input
                id="voice-sheet-title"
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                disabled={phase === 'recording'}
                placeholder="e.g. Bedtime read-aloud, funny voice"
                className="w-full h-10 px-3 rounded-lg bg-surface-subtle border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary disabled:opacity-60"
              />
            </div>

            {profiles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="voice-sheet-author"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1"
                  >
                    Recorded by
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedAuthor ? (
                      <span
                        className={`w-8 h-8 rounded-full text-xs font-bold inline-flex items-center justify-center shrink-0 ${
                          AVATAR_TONES[selectedAuthor.avatarTone || 'teal'] || AVATAR_TONES.teal
                        }`}
                      >
                        {computeOwnerInitials(selectedAuthor.name)}
                      </span>
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-surface-subtle border border-edge text-ink-muted text-xs font-bold inline-flex items-center justify-center shrink-0">
                        H
                      </span>
                    )}
                    <select
                      id="voice-sheet-author"
                      value={authorId}
                      disabled={phase === 'recording'}
                      onChange={(e) => setAuthorId(e.target.value)}
                      className="flex-1 h-10 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink focus:outline-none focus:border-primary disabled:opacity-60"
                    >
                      <option value="">Household</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="voice-sheet-for"
                    className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1"
                  >
                    For reader
                  </label>
                  <select
                    id="voice-sheet-for"
                    value={forProfileId}
                    disabled={phase === 'recording'}
                    onChange={(e) => setForProfileId(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-lg bg-surface-subtle border border-edge text-xs font-medium text-ink focus:outline-none focus:border-primary disabled:opacity-60"
                  >
                    <option value="">Everyone</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Phase Studio Panel */}
          {phase === 'idle' && (
            <div className="rounded-2xl bg-surface-subtle border border-edge p-5 text-center space-y-4">
              <p className="text-xs text-ink-secondary leading-relaxed">
                Record a bedtime story, chapter read-aloud, or child voice reaction. Saved privately inside browser storage on this device.
              </p>
              <button
                type="button"
                data-action="sheet-start-audio-recording"
                onClick={handleStartRecording}
                className="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-[0.98] cursor-pointer"
              >
                <Icon name="mic" className="w-4 h-4" />
                <span>Start Recording</span>
              </button>
            </div>
          )}

          {phase === 'recording' && (
            <div className="rounded-2xl bg-surface-subtle border border-[#8C4A4F]/45 p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E] uppercase tracking-wider">
                  Microphone Active
                </span>
                <span className="font-mono-tabular text-lg font-bold text-ink">
                  {String(Math.floor(elapsedSec / 60)).padStart(2, '0')}:
                  {String(elapsedSec % 60).padStart(2, '0')}
                </span>
              </div>

              {/* Live Vertical Audio Level Bars */}
              <div
                aria-hidden="true"
                className="h-12 px-2 rounded-xl bg-surface border border-edge flex items-center justify-between gap-1"
              >
                {liveLevels.map((lvl, idx) => (
                  <span
                    key={idx}
                    style={{ height: `${Math.round(lvl * 100)}%` }}
                    className="flex-1 rounded-full bg-[#8C4A4F] dark:bg-[#C48A8E] transition-[height] duration-75"
                  />
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  data-action="cancel-audio-recording"
                  onClick={handleCancelRecording}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-edge text-xs sm:text-sm font-semibold text-ink cursor-pointer"
                >
                  Cancel Recording
                </button>
                <button
                  type="button"
                  data-action="stop-audio-recording"
                  onClick={handleStopAndPreview}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-[#8C4A4F] hover:bg-[#7A3F44] text-[#FFFCF5] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Icon name="square" className="w-3.5 h-3.5" />
                  <span>Stop &amp; Preview</span>
                </button>
              </div>
            </div>
          )}

          {phase === 'preview' && previewBlob && (
            <div className="rounded-2xl bg-surface-subtle border border-primary/40 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  Preview before saving
                </span>
                <span className="text-[11px] font-mono-tabular text-ink-muted">
                  {formatAudioTime(previewDurationSec)}
                </span>
              </div>

              <div className="rounded-xl bg-surface border border-edge p-3">
                <WaveformScrubber
                  seedId={`preview-${previewUrl}`}
                  srcUrl={previewUrl}
                  durationSec={previewDurationSec}
                  label={titleDraft.trim() || 'Voice preview'}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDiscardPreview}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-[#8C4A4F] dark:text-[#C48A8E] hover:bg-[#8C4A4F]/10 cursor-pointer"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Icon name="refresh" className="w-3.5 h-3.5" />
                    <span>Re-record</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-55 text-primary-fg text-xs sm:text-sm font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save Voice Note'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
