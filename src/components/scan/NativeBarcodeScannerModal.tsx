import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../common/Icon.js';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock.js';
import { triggerScanSuccessFeedback } from '../../utils/scannerFeedback.js';
import { createBarcodeDecoder } from '../../features/scan/barcode-decoder.js';
import {
  computeModeCropBox,
  loadUploadedImage,
  renderCroppedCanvas,
} from '../../features/scan/frame-processor.js';
import { createOcrEngine } from '../../features/scan/ocr-engine.js';
import { validateBarcodeAsIsbn } from '../../features/scan/isbn-extractor.js';
import type { ScanMode } from '../../types/models.js';
import {
  acquireCameraStream,
  diagnoseCameraAccessError,
  type CameraErrorDiagnosis,
} from '../../features/scan/camera-access.js';

interface NativeBarcodeScannerModalProps {
  isOpen: boolean;
  initialMode?: ScanMode;
  prewarmedStreamPromise?: Promise<MediaStream> | null;
  onDetectedIsbn: (isbn13: string, sourceLabel: string) => void;
  onDetectedTitle?: (titleQuery: string, sourceLabel: string) => void;
  onClose: () => void;
}

type CameraStage = 'starting' | 'streaming' | 'locked' | 'fallback';

export const NativeBarcodeScannerModal: React.FC<NativeBarcodeScannerModalProps> = ({
  isOpen,
  initialMode = 'barcode',
  prewarmedStreamPromise = null,
  onDetectedIsbn,
  onDetectedTitle,
  onClose,
}) => {
  useBodyScrollLock(isOpen);
  const maskId = useId();

  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [stage, setStage] = useState<CameraStage>('starting');
  const [statusText, setStatusText] = useState('Initializing rear camera…');
  const [fallbackDiagnosis, setFallbackDiagnosis] = useState<CameraErrorDiagnosis | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lockedLabel, setLockedLabel] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [isAnalyzingUpload, setIsAnalyzingUpload] = useState(false);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);

  const pendingStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const frameBusyRef = useRef(false);
  const lockedRef = useRef(false);
  const mountedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const decoderRef = useRef<ReturnType<typeof createBarcodeDecoder> | null>(null);
  const ocrRef = useRef<ReturnType<typeof createOcrEngine> | null>(null);

  const getDecoder = () => {
    if (!decoderRef.current) decoderRef.current = createBarcodeDecoder();
    return decoderRef.current;
  };

  const getOcr = () => {
    if (!ocrRef.current) ocrRef.current = createOcrEngine();
    return ocrRef.current;
  };

  const stopAllMediaTracks = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    frameBusyRef.current = false;

    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          if (typeof track.applyConstraints === 'function') {
            track
              .applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints)
              .catch(() => {});
          }
        } catch {
          // Ignore torch off errors on teardown
        }
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        // Ignore video teardown errors
      }
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleSuccessfulLock = useCallback(
    (payload: { kind: 'isbn'; isbn13: string; label: string } | { kind: 'title'; titleQuery: string; label: string }) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setStage('locked');
      setLockedLabel(
        payload.kind === 'isbn'
          ? `ISBN ${payload.isbn13}`
          : `"${payload.titleQuery}"`
      );
      setStatusText(`Locked via ${payload.label}`);

      triggerScanSuccessFeedback();
      stopAllMediaTracks();

      window.setTimeout(() => {
        if (!mountedRef.current) return;
        if (payload.kind === 'isbn') {
          onDetectedIsbn(payload.isbn13, payload.label);
        } else if (onDetectedTitle) {
          onDetectedTitle(payload.titleQuery, payload.label);
        }
      }, 280);
    },
    [onDetectedIsbn, onDetectedTitle, stopAllMediaTracks]
  );

  const inspectCurrentFrame = useCallback(
    async (forceCapture = false) => {
      if (frameBusyRef.current || lockedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      frameBusyRef.current = true;
      try {
        const rect = video.getBoundingClientRect();
        const crop = computeModeCropBox({
          sourceWidth: video.videoWidth,
          sourceHeight: video.videoHeight,
          mode,
          containerWidth: rect.width,
          containerHeight: rect.height,
        });

        if (mode === 'barcode') {
          const frame = renderCroppedCanvas({ source: video, crop, enhanceOcr: false });
          const decoded = await getDecoder().decodeFrame(frame);
          if (decoded.matched) {
            handleSuccessfulLock({
              kind: 'isbn',
              isbn13: decoded.isbn13,
              label:
                decoded.engine === 'native-barcode-detector'
                  ? 'Barcode (Native)'
                  : 'Barcode (ZXing)',
            });
          }
        } else if (mode === 'isbn-ocr') {
          const frame = renderCroppedCanvas({ source: video, crop, enhanceOcr: true });
          const ocrOut = await getOcr().recognizeFrame(frame.canvas, { mode: 'isbn-ocr' });
          if (ocrOut.matchedIsbn) {
            handleSuccessfulLock({
              kind: 'isbn',
              isbn13: ocrOut.isbn13,
              label: ocrOut.confidence === 'ocr-repaired' ? 'ISBN OCR (Repaired)' : 'ISBN Text OCR',
            });
          } else if (forceCapture) {
            setStatusText('Move slightly closer to the printed ISBN digits and tap again.');
          }
        } else if (mode === 'cover') {
          const passive = renderCroppedCanvas({ source: video, crop, enhanceOcr: false });
          const bar = await getDecoder().decodeFrame(passive);
          if (bar.matched) {
            handleSuccessfulLock({
              kind: 'isbn',
              isbn13: bar.isbn13,
              label: 'Cover Back-Barcode',
            });
            return;
          }
          if (forceCapture) {
            setStatusText('Reading cover typography…');
            const enhanced = renderCroppedCanvas({ source: video, crop, enhanceOcr: true });
            const ocrOut = await getOcr().recognizeFrame(enhanced.canvas, { mode: 'cover' });
            if (ocrOut.matchedIsbn) {
              handleSuccessfulLock({
                kind: 'isbn',
                isbn13: ocrOut.isbn13,
                label: 'Cover ISBN OCR',
              });
            } else if (ocrOut.suggestedTitleQuery) {
              handleSuccessfulLock({
                kind: 'title',
                titleQuery: ocrOut.suggestedTitleQuery,
                label: 'Cover Title OCR',
              });
            } else {
              setStatusText('Could not read title clearly — try reducing glare or upload a photo.');
            }
          }
        }
      } catch {
        // Ignore single-frame transient errors
      } finally {
        frameBusyRef.current = false;
      }
    },
    [handleSuccessfulLock, mode]
  );

  // Sync mode & prewarmed stream prop when opening
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      lockedRef.current = false;
      setLockedLabel('');
      setManualError('');
      setFallbackDiagnosis(null);
      if (prewarmedStreamPromise && !pendingStreamPromiseRef.current) {
        pendingStreamPromiseRef.current = prewarmedStreamPromise;
      }
    } else {
      pendingStreamPromiseRef.current = null;
    }
  }, [isOpen, initialMode, prewarmedStreamPromise]);

  // Core camera lifecycle: consume synchronous-gesture stream promise or initiate camera, strict cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    if (!isOpen) {
      stopAllMediaTracks();
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;
    lockedRef.current = false;
    setStage('starting');
    setStatusText('Requesting camera permission…');
    setFallbackDiagnosis(null);

    async function bootCamera() {
      const gestureStreamPromise = pendingStreamPromiseRef.current;
      pendingStreamPromiseRef.current = null;

      const streamPromise = gestureStreamPromise || acquireCameraStream(facingMode);
      if (!streamPromise) {
        if (!cancelled) {
          const diag = await diagnoseCameraAccessError(
            new Error('Camera API unavailable in this browser.')
          );
          if (!cancelled) {
            setStage('fallback');
            setFallbackDiagnosis(diag);
          }
        }
        return;
      }

      let stream: MediaStream | null = null;
      try {
        stream = await streamPromise;

        if (cancelled) {
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {
              // Ignore
            }
          });
          return;
        }

        streamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0] || null;
        const caps =
          videoTrack && typeof videoTrack.getCapabilities === 'function'
            ? (videoTrack.getCapabilities() as MediaTrackCapabilities & { torch?: boolean })
            : null;
        setTorchSupported(Boolean(caps && 'torch' in caps && caps.torch));
        setTorchOn(false);

        const video = videoRef.current;
        if (video) {
          video.defaultMuted = true;
          video.muted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.srcObject = stream;
          video.play().catch(() => {});
        }

        setStage('streaming');
        setStatusText(
          mode === 'barcode'
            ? 'Align the back-cover ISBN barcode inside the frame'
            : mode === 'isbn-ocr'
              ? 'Hold steady over the printed ISBN line'
              : 'Frame the front cover and tap Capture'
        );
      } catch (err) {
        if (cancelled) return;
        const diag = await diagnoseCameraAccessError(err);
        if (cancelled) return;
        setStage('fallback');
        setFallbackDiagnosis(diag);
      }
    }

    bootCamera();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      stopAllMediaTracks();
    };
  }, [isOpen, facingMode, cameraRetryNonce, stopAllMediaTracks]);

  // Polling loop while streaming
  useEffect(() => {
    if (!isOpen || stage !== 'streaming') {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    setStatusText(
      mode === 'barcode'
        ? 'Align the back-cover ISBN barcode inside the frame'
        : mode === 'isbn-ocr'
          ? 'Hold steady over the printed ISBN line'
          : 'Frame the front cover and tap Capture'
    );

    const intervalMs = mode === 'isbn-ocr' ? 1200 : 220;
    pollTimerRef.current = window.setInterval(() => {
      inspectCurrentFrame(false);
    }, intervalMs);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, stage, mode, inspectCurrentFrame]);

  // Dismiss on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopAllMediaTracks();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, stopAllMediaTracks]);

  if (!isOpen) return null;

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }],
      } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleRetryCameraFromTap = () => {
    stopAllMediaTracks();
    pendingStreamPromiseRef.current = acquireCameraStream(facingMode);
    setFallbackDiagnosis(null);
    setStage('starting');
    setCameraRetryNonce((n) => n + 1);
  };

  const handleSwitchCamera = () => {
    stopAllMediaTracks();
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    pendingStreamPromiseRef.current = acquireCameraStream(nextFacing);
    setFacingMode(nextFacing);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsAnalyzingUpload(true);
    setManualError('');
    setStatusText('Analyzing uploaded image…');
    try {
      const loaded = await loadUploadedImage(file);
      try {
        const fullCrop = computeModeCropBox({
          sourceWidth: loaded.width,
          sourceHeight: loaded.height,
          mode,
          fullImage: true,
        });
        const frame = renderCroppedCanvas({ source: loaded.image, crop: fullCrop, enhanceOcr: false });
        const decoded = await getDecoder().decodeFrame(frame);
        if (decoded.matched) {
          handleSuccessfulLock({
            kind: 'isbn',
            isbn13: decoded.isbn13,
            label: 'Photo Barcode',
          });
          return;
        }

        const ocrFrame = renderCroppedCanvas({ source: loaded.image, crop: fullCrop, enhanceOcr: true });
        const ocrOut = await getOcr().recognizeFrame(ocrFrame.canvas, {
          mode: mode === 'cover' ? 'cover' : 'isbn-ocr',
        });
        if (ocrOut.matchedIsbn) {
          handleSuccessfulLock({
            kind: 'isbn',
            isbn13: ocrOut.isbn13,
            label: 'Photo ISBN OCR',
          });
          return;
        }
        if (mode === 'cover' && ocrOut.suggestedTitleQuery) {
          handleSuccessfulLock({
            kind: 'title',
            titleQuery: ocrOut.suggestedTitleQuery,
            label: 'Photo Cover OCR',
          });
          return;
        }
        setManualError('No ISBN barcode or readable title detected in that photo. Try cropping closer or entering the ISBN manually.');
        setStatusText('No match found in photo');
      } finally {
        try {
          URL.revokeObjectURL(loaded.objectUrl);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Failed to read uploaded image.');
    } finally {
      setIsAnalyzingUpload(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');
    const trimmed = manualInput.trim();
    if (!trimmed) {
      setManualError('Enter a 10- or 13-digit ISBN, or a book title.');
      return;
    }
    const isbnCheck = validateBarcodeAsIsbn(trimmed);
    if (isbnCheck.valid && isbnCheck.isbn13) {
      handleSuccessfulLock({
        kind: 'isbn',
        isbn13: isbnCheck.isbn13,
        label: 'Manual ISBN',
      });
      return;
    }
    if (onDetectedTitle) {
      handleSuccessfulLock({
        kind: 'title',
        titleQuery: trimmed,
        label: 'Manual Search',
      });
      return;
    }
    setManualError('Please enter a valid 10- or 13-digit ISBN starting with 978/979 or 10 digits.');
  };

  // SVG viewfinder dimensions in percentage for clean responsive cutout
  const cutout =
    mode === 'barcode'
      ? { x: '8%', y: '34%', width: '84%', height: '32%', rx: 14 }
      : mode === 'isbn-ocr'
        ? { x: '8%', y: '41%', width: '84%', height: '18%', rx: 10 }
        : { x: '18%', y: '18%', width: '64%', height: '64%', rx: 16 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live Barcode and Book Scanner"
      data-native-scanner-overlay="true"
      className="fixed inset-0 z-50 bg-scanner flex flex-col justify-between pt-safe pb-safe select-none overflow-hidden"
    >
      {/* Top Bar: Dismiss, Mode Selector, Status */}
      <div className="relative z-20 px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            stopAllMediaTracks();
            onClose();
          }}
          aria-label="Close scanner"
          className="min-h-[44px] min-w-[44px] rounded-lg bg-scanner-surface/90 hover:bg-scanner-surface-hover border border-scanner-edge active:scale-95 text-scanner-ink flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
        >
          <Icon name="close" className="w-5 h-5" />
        </button>

        {/* Compact Mode Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-scanner-surface/90 backdrop-blur-md border border-scanner-edge">
          {(
            [
              { id: 'barcode', label: 'Barcode' },
              { id: 'isbn-ocr', label: 'ISBN Text' },
              { id: 'cover', label: 'Cover' },
            ] as const
          ).map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`min-h-[36px] px-3.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-scanner-accent text-scanner-accent-fg shadow-xs'
                    : 'text-scanner-ink/85 hover:text-scanner-ink active:scale-95'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {stage === 'fallback' ? (
          <button
            type="button"
            onClick={handleRetryCameraFromTap}
            aria-label="Retry camera"
            title="Retry camera"
            className="min-h-[44px] min-w-[44px] rounded-lg bg-scanner-surface/90 hover:bg-scanner-surface-hover border border-scanner-edge active:scale-95 text-scanner-ink flex items-center justify-center backdrop-blur-md transition-all cursor-pointer"
          >
            <Icon name="camera" className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Center Viewport: Live Video + SVG Mask + Laser Line OR Graceful Fallback */}
      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            stage === 'streaming' || stage === 'locked' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {stage !== 'fallback' ? (
          <>
            {/* Semi-transparent SVG Viewfinder Cutout Mask */}
            <svg
              aria-hidden="true"
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              preserveAspectRatio="none"
            >
              <defs>
                <mask id={maskId}>
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={cutout.x}
                    y={cutout.y}
                    width={cutout.width}
                    height={cutout.height}
                    rx={cutout.rx}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="var(--scanner-scrim)" mask={`url(#${maskId})`} />
            </svg>

            {/* Target Frame Reticle + Animated Scanning Laser */}
            <div
              className="relative z-10 pointer-events-none flex items-center justify-center transition-all duration-200"
              style={{
                width: cutout.width,
                height: cutout.height,
                borderRadius: `${cutout.rx}px`,
              }}
            >
              <div
                className={`absolute inset-0 rounded-[inherit] border-2 transition-colors ${
                  stage === 'locked'
                    ? 'lr-scanner-locked-frame'
                    : 'border-scanner-ink/40'
                }`}
              />

              {/* Crisp Corner Brackets */}
              <span
                className={`absolute -top-0.5 -left-0.5 w-6 h-6 border-t-[3px] border-l-[3px] rounded-tl-lg ${
                  stage === 'locked' ? 'border-scanner-locked' : 'border-scanner-accent'
                }`}
              />
              <span
                className={`absolute -top-0.5 -right-0.5 w-6 h-6 border-t-[3px] border-r-[3px] rounded-tr-lg ${
                  stage === 'locked' ? 'border-scanner-locked' : 'border-scanner-accent'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-[3px] border-l-[3px] rounded-bl-lg ${
                  stage === 'locked' ? 'border-scanner-locked' : 'border-scanner-accent'
                }`}
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-[3px] border-r-[3px] rounded-br-lg ${
                  stage === 'locked' ? 'border-scanner-locked' : 'border-scanner-accent'
                }`}
              />

              {/* Animated Scanning Laser Line */}
              {stage === 'streaming' && (
                <div className="absolute inset-x-3 top-2 bottom-2 overflow-hidden">
                  <div className="w-full h-0.5 lr-scanner-sweep-line animate-scan-sweep" />
                </div>
              )}

              {stage === 'starting' && (
                <div className="px-4 py-2 rounded-lg bg-scanner/85 border border-scanner-edge text-xs font-medium text-scanner-ink flex items-center gap-2">
                  <Icon name="camera" className="w-3.5 h-3.5 text-scanner-accent" />
                  <span>Starting camera…</span>
                </div>
              )}

              {stage === 'locked' && (
                <div className="px-4 py-2 rounded-lg bg-scanner-locked text-scanner-locked-fg text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                  <Icon name="check" className="w-4 h-4" />
                  <span>{lockedLabel}</span>
                </div>
              )}
            </div>

            {/* Live Status Below Frame */}
            <div className="absolute bottom-4 inset-x-4 z-20 flex flex-col items-center gap-2 pointer-events-none">
              <p className="px-4 py-1.5 rounded-lg bg-scanner/85 backdrop-blur-md border border-scanner-edge text-xs font-medium text-scanner-ink text-center max-w-sm">
                {statusText}
              </p>
              {manualError && (
                <p className="px-4 py-1.5 rounded-lg bg-scanner-error/95 border border-scanner-error-edge/40 text-xs text-scanner-error-ink text-center max-w-sm">
                  {manualError}
                </p>
              )}
            </div>
          </>
        ) : (
          /* Graceful Inline Camera Fallback Card */
          <div className="relative z-20 w-full max-w-md mx-4 rounded-xl bg-scanner-surface border border-scanner-edge p-5 sm:p-6 text-left text-scanner-ink shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-lg bg-scanner-surface-hover border border-scanner-edge text-scanner-accent flex items-center justify-center shrink-0">
                <Icon name="camera" className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold text-scanner-ink leading-snug">
                  {fallbackDiagnosis?.title || 'Enter ISBN or Upload Photo'}
                </h2>
                <p className="text-xs text-scanner-muted mt-1 leading-relaxed">
                  {fallbackDiagnosis?.message ||
                    'Type a 10- or 13-digit ISBN from the back cover, or pick a photo from your library.'}
                </p>
              </div>
            </div>

            {fallbackDiagnosis && (
              <div className="flex flex-wrap items-center gap-2">
                {fallbackDiagnosis.canRetry && (
                  <button
                    type="button"
                    onClick={handleRetryCameraFromTap}
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-scanner-surface-hover hover:bg-scanner-surface-active border border-scanner-edge active:scale-[0.98] text-scanner-ink text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Icon name="refresh" className="w-3.5 h-3.5 text-scanner-accent" />
                    <span>Retry Camera</span>
                  </button>
                )}

                {fallbackDiagnosis.canOpenNewTab && typeof window !== 'undefined' && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[42px] px-4 py-2 rounded-lg bg-scanner-surface-hover hover:bg-scanner-surface-active border border-scanner-accent/40 text-scanner-accent text-xs font-semibold inline-flex items-center gap-1.5 transition-all"
                  >
                    <Icon name="externalLink" className="w-3.5 h-3.5" />
                    <span>Open in New Tab</span>
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label htmlFor="scanner-fallback-isbn" className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-scanner-muted mb-1">
                  ISBN or Book Title
                </label>
                <input
                  id="scanner-fallback-isbn"
                  type="text"
                  autoFocus
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. 9780064431781 or Goodnight Moon"
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-lg bg-scanner border border-scanner-edge text-base sm:text-sm text-scanner-ink placeholder:text-scanner-subtle focus:outline-none focus:ring-2 focus:ring-scanner-accent"
                />
              </div>

              {manualError && (
                <p role="alert" className="text-xs font-medium text-scanner-error-ink">
                  {manualError}
                </p>
              )}

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  className="flex-1 min-h-[46px] px-4 py-2.5 rounded-lg bg-scanner-accent hover:bg-scanner-accent-hover active:scale-[0.98] text-scanner-accent-fg font-semibold text-sm transition-all cursor-pointer"
                >
                  Look Up Book
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzingUpload}
                  className="min-h-[46px] px-4 py-2.5 rounded-lg bg-scanner-surface-hover hover:bg-scanner-surface-active border border-scanner-edge active:scale-[0.98] text-scanner-ink text-sm font-semibold inline-flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Icon name="photo" className="w-4 h-4" />
                  <span>{isAnalyzingUpload ? 'Reading…' : 'Photo'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Bottom Thumb-Zone Hardware Controls */}
      <div className="relative z-20 px-5 pt-3 pb-4 flex items-center justify-between gap-3 max-w-sm w-full mx-auto">
        <button
          type="button"
          onClick={handleToggleTorch}
          disabled={!torchSupported || stage !== 'streaming'}
          aria-pressed={torchOn}
          aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
          className={`min-h-[44px] min-w-[44px] px-4 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
            torchOn
              ? 'bg-scanner-accent text-scanner-accent-fg shadow-lg'
              : 'bg-scanner-surface/90 hover:bg-scanner-surface-hover text-scanner-ink border border-scanner-edge'
          }`}
        >
          <Icon name={torchOn ? 'flashlightFilled' : 'flashlight'} className="w-5 h-5" />
          <span className="hidden xs:inline">{torchOn ? 'Light On' : 'Torch'}</span>
        </button>

        {mode === 'cover' && (
          <button
            type="button"
            disabled={stage !== 'streaming'}
            onClick={() => inspectCurrentFrame(true)}
            aria-label="Capture cover for title OCR"
            className="min-h-[50px] px-6 rounded-xl bg-scanner-accent hover:bg-scanner-accent-hover active:scale-95 text-scanner-accent-fg font-semibold text-sm inline-flex items-center gap-2 shadow-xl disabled:opacity-40 transition-all cursor-pointer"
          >
            <Icon name="camera" className="w-5 h-5" />
            <span>Capture Cover</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleSwitchCamera}
          aria-label="Switch front or rear camera"
          className="min-h-[44px] min-w-[44px] px-4 rounded-lg bg-scanner-surface/90 hover:bg-scanner-surface-hover active:scale-95 text-scanner-ink border border-scanner-edge flex items-center justify-center gap-2 text-xs font-semibold backdrop-blur-md transition-all cursor-pointer"
        >
          <Icon name="flip" className="w-5 h-5" />
          <span className="hidden xs:inline">Flip</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="sr-only"
        />
      </div>
    </div>
  );
};
