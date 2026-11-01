/**
 * @fileoverview Scanner Session Controller:
 * Orchestrates browser capability probing, `getUserMedia` camera lifecycle & track cleanup,
 * debounced live frame polling (barcode + OCR), uploaded photo scanning with animated sweep feedback,
 * visual emerald detection-lock state transitions, and graceful degradation errors.
 */

import { createBarcodeDecoder } from './barcode-decoder.js';
import {
  computeModeCropBox,
  loadUploadedImage,
  renderCroppedCanvas,
} from './frame-processor.js';
import { createOcrEngine } from './ocr-engine.js';

/**
 * @typedef {'idle' | 'starting-camera' | 'streaming' | 'analyzing-upload' | 'locked' | 'error'} ScannerPhase
 */

/**
 * @typedef {Object} ScannerDetectionLock
 * @property {'isbn' | 'cover-title'} kind
 * @property {string} isbn13 - Populated when kind === 'isbn'
 * @property {string} [isbn10]
 * @property {string} [titleQuery] - Populated when kind === 'cover-title'
 * @property {string} sourceLabel - e.g. 'Barcode (Native)', 'Barcode (ZXing)', 'ISBN Text OCR', 'Cover OCR'
 * @property {string} lockedAt - ISO-8601 timestamp
 */

/**
 * @typedef {Object} BrowserScanSupport
 * @property {boolean} secureContext - Whether HTTPS / localhost is active
 * @property {boolean} cameraApi - Whether `navigator.mediaDevices.getUserMedia` exists
 * @property {boolean} nativeBarcodeDetector - Whether hardware `BarcodeDetector` supports `ean_13`
 * @property {boolean} webAssembly - Whether WASM is available for Tesseract OCR
 * @property {string} barcodeEngineLabel - Human-readable active barcode engine summary
 */

/**
 * Maps DOMException / camera errors into clear, actionable mobile recovery guidance.
 * @param {unknown} err
 * @returns {string}
 */
export function describeCameraError(err) {
  const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Camera permission was denied. Allow camera access in your browser address bar, or tap "Upload Photo" below to scan from your gallery or phone camera sheet.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No camera hardware was detected on this device. Use "Upload Photo" below to scan a picture of a barcode, ISBN line, or cover.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your camera is currently in use by another app or tab. Close other camera apps or use "Upload Photo" instead.';
  }
  if (name === 'OverconstrainedError') {
    return 'Could not match the preferred rear camera resolution. Use "Upload Photo" or retry camera start.';
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Live camera streaming requires HTTPS or localhost. Use "Upload Photo" or open the app over HTTPS.';
  }
  return err instanceof Error && err.message
    ? err.message
    : 'Unable to start live camera preview. Use "Upload Photo" to scan an image instead.';
}

/**
 * Probes browser scanning capabilities without triggering permission prompts.
 * @param {Record<string, any>} [globalScope]
 * @param {ReturnType<typeof createBarcodeDecoder>} [barcodeDecoder]
 * @returns {Promise<BrowserScanSupport>}
 */
export async function probeBrowserScanSupport(globalScope, barcodeDecoder) {
  const scope = globalScope || (typeof globalThis !== 'undefined' ? globalThis : {});
  const secureContext = scope.isSecureContext !== false;
  const cameraApi = Boolean(
    secureContext &&
      scope.navigator &&
      scope.navigator.mediaDevices &&
      typeof scope.navigator.mediaDevices.getUserMedia === 'function'
  );
  const webAssembly = typeof scope.WebAssembly === 'object';

  const decoder = barcodeDecoder || createBarcodeDecoder({ globalScope: scope });
  const caps = await decoder.getCapabilities();

  const barcodeEngineLabel = caps.nativeBarcodeDetector
    ? 'Native BarcodeDetector + ZXing Fallback'
    : 'ZXing Pure-JS Engine (Universal Fallback)';

  return {
    secureContext,
    cameraApi,
    nativeBarcodeDetector: caps.nativeBarcodeDetector,
    webAssembly,
    barcodeEngineLabel,
  };
}

/**
 * Creates a stateful scanner controller that manages camera tracks, live frame polling,
 * uploaded photo scanning, and detection-lock debouncing.
 *
 * @param {{
 *   barcodeDecoder?: ReturnType<typeof createBarcodeDecoder>,
 *   ocrEngine?: ReturnType<typeof createOcrEngine>,
 *   onLock?: (lock: ScannerDetectionLock) => void,
 *   onStateChange?: () => void,
 *   lockHoldMs?: number
 * }} [options]
 */
export function createScannerController(options = {}) {
  const barcodeDecoder = options.barcodeDecoder || createBarcodeDecoder();
  const ocrEngine = options.ocrEngine || createOcrEngine();
  const lockHoldMs = options.lockHoldMs ?? 650;

  /** @type {MediaStream | null} */
  let activeStream = null;
  /** @type {HTMLVideoElement | null} */
  let boundVideoEl = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let pollTimer = null;
  let frameBusy = false;
  let lastLockedValue = '';
  let lastLockedAtMs = 0;

  /** @type {string | null} */
  let uploadedPreviewUrl = null;

  const state = {
    /** @type {ScannerPhase} */
    phase: 'idle',
    /** @type {import('../../types/models.js').ScanMode} */
    mode: 'barcode',
    statusMessage: 'Ready to scan via live camera or uploaded photo.',
    errorMessage: '',
    ignoredHint: '',
    uploadedPreviewUrl: '',
    /** @type {ScannerDetectionLock | null} */
    lock: null,
    /** @type {BrowserScanSupport | null} */
    support: null,
    facingMode: /** @type {'environment' | 'user'} */ ('environment'),
    torchSupported: false,
    torchOn: false,
  };

  function emit() {
    if (options.onStateChange) options.onStateChange();
  }

  async function initSupport() {
    if (!state.support) {
      state.support = await probeBrowserScanSupport(undefined, barcodeDecoder);
      emit();
    }
    return state.support;
  }

  function revokeUploadPreview() {
    if (uploadedPreviewUrl) {
      try {
        URL.revokeObjectURL(uploadedPreviewUrl);
      } catch (_) {}
      uploadedPreviewUrl = null;
    }
    state.uploadedPreviewUrl = '';
  }

  /**
   * Stops active polling and releases all camera hardware tracks immediately.
   * @param {{ preserveLock?: boolean, preserveUpload?: boolean }} [stopOpts]
   */
  function stopCamera(stopOpts = {}) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    frameBusy = false;

    if (boundVideoEl) {
      try {
        boundVideoEl.pause();
        boundVideoEl.srcObject = null;
      } catch (_) {}
      boundVideoEl = null;
    }

    if (activeStream) {
      for (const track of activeStream.getTracks()) {
        try {
          if (state.torchOn && typeof track.applyConstraints === 'function') {
            track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: false }] })).catch(() => {});
          }
        } catch (_) {}
        try {
          track.stop();
        } catch (_) {}
      }
      activeStream = null;
    }
    state.torchSupported = false;
    state.torchOn = false;

    if (!stopOpts.preserveUpload) {
      revokeUploadPreview();
    }

    if (!stopOpts.preserveLock) {
      state.lock = null;
      if (state.phase === 'streaming' || state.phase === 'starting-camera') {
        state.phase = 'idle';
        state.statusMessage = 'Camera stopped. Tap Start Camera or Upload Photo to scan.';
      }
    }
    emit();
  }

  /**
   * Switches scan guide mode (`barcode`, `isbn-ocr`, `cover`) while adjusting polling cadence if live.
   * @param {import('../../types/models.js').ScanMode} nextMode
   */
  function setMode(nextMode) {
    state.mode = nextMode;
    state.errorMessage = '';
    state.ignoredHint = '';
    state.lock = null;
    if (activeStream) {
      state.phase = 'streaming';
      state.statusMessage =
        nextMode === 'barcode'
          ? 'Align a 978/979 ISBN barcode inside the wide guide…'
          : nextMode === 'isbn-ocr'
            ? 'Hold steady over the printed "ISBN 978-..." line…'
            : 'Center the book cover inside the 3:4 frame or tap Capture Frame…';
      restartPollingLoop();
    } else {
      if (state.phase === 'locked' || state.phase === 'error') {
        state.phase = 'idle';
      }
      revokeUploadPreview();
    }
    emit();
  }

  /**
   * Records a verified detection lock, turns the scan guide emerald green, pauses the camera,
   * and fires the `onLock` handoff after `lockHoldMs` so the user clearly sees visual lock confirmation.
   *
   * @param {ScannerDetectionLock} lockPayload
   */
  function triggerDetectionLock(lockPayload) {
    const dedupeKey = `${lockPayload.kind}:${lockPayload.isbn13 || lockPayload.titleQuery || ''}`;
    const now = Date.now();
    if (dedupeKey === lastLockedValue && now - lastLockedAtMs < 2500) {
      return;
    }
    lastLockedValue = dedupeKey;
    lastLockedAtMs = now;

    state.lock = lockPayload;
    state.phase = 'locked';
    state.errorMessage = '';
    state.ignoredHint = '';
    state.statusMessage =
      lockPayload.kind === 'isbn'
        ? `Locked ISBN ${lockPayload.isbn13} via ${lockPayload.sourceLabel}`
        : `Extracted cover title "${lockPayload.titleQuery}" via ${lockPayload.sourceLabel}`;

    // Release camera tracks while preserving the emerald locked visual state
    stopCamera({ preserveLock: true, preserveUpload: Boolean(state.uploadedPreviewUrl) });

    setTimeout(() => {
      if (options.onLock) {
        options.onLock(lockPayload);
      }
    }, lockHoldMs);
  }

  /**
   * Attaches the active `MediaStream` to the rendered `#scanner-live-video` element after DOM updates.
   * Explicitly initializes `.muted`, `.defaultMuted`, `.playsInline`, and `.autoplay` IDL properties
   * before assigning `srcObject` so iOS Safari / WebKit and Chromium never reject programmatic `.play()`.
   *
   * @param {HTMLVideoElement | null} videoEl
   */
  function attachVideoElement(videoEl) {
    if (!videoEl || !activeStream) return;

    videoEl.defaultMuted = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;
    if (typeof videoEl.setAttribute === 'function') {
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.setAttribute('autoplay', '');
    }

    if (boundVideoEl !== videoEl || videoEl.srcObject !== activeStream) {
      boundVideoEl = videoEl;
      videoEl.srcObject = activeStream;
      videoEl.onloadedmetadata = () => {
        if (typeof videoEl.play === 'function') {
          videoEl.play().catch(() => {});
        }
      };
    }

    if (videoEl.paused !== false && typeof videoEl.play === 'function') {
      videoEl.play().catch(() => {});
    }
  }

  /**
   * Evaluates a single live video frame according to the active scan mode.
   * @param {boolean} [forceCapture] - True when user explicitly taps "Capture Frame" in OCR/Cover mode
   */
  async function inspectLiveVideoFrame(forceCapture = false) {
    if (frameBusy || state.phase !== 'streaming' || !boundVideoEl) return;
    if (boundVideoEl.readyState < 2 || !boundVideoEl.videoWidth || !boundVideoEl.videoHeight) {
      return;
    }

    // In `cover` mode, avoid heavy continuous full-jacket OCR unless user taps Capture Frame;
    // still run fast barcode check passively in case they show the back cover.
    frameBusy = true;
    try {
      const rect = boundVideoEl.getBoundingClientRect();
      const crop = computeModeCropBox({
        sourceWidth: boundVideoEl.videoWidth,
        sourceHeight: boundVideoEl.videoHeight,
        mode: state.mode,
        containerWidth: rect.width,
        containerHeight: rect.height,
      });

      if (state.mode === 'barcode') {
        const frame = renderCroppedCanvas({
          source: boundVideoEl,
          crop,
          enhanceOcr: false,
        });
        const decoded = await barcodeDecoder.decodeFrame(frame);
        if (decoded.matched) {
          triggerDetectionLock({
            kind: 'isbn',
            isbn13: decoded.isbn13,
            isbn10: decoded.isbn10,
            sourceLabel:
              decoded.engine === 'native-barcode-detector'
                ? 'Barcode (Native)'
                : 'Barcode (ZXing)',
            lockedAt: new Date().toISOString(),
          });
          return;
        }
        if (decoded.ignoredReason && decoded.ignoredReason !== state.ignoredHint) {
          state.ignoredHint = decoded.ignoredReason;
          emit();
        }
      } else if (state.mode === 'isbn-ocr') {
        const frame = renderCroppedCanvas({
          source: boundVideoEl,
          crop,
          enhanceOcr: true,
        });
        const ocrOut = await ocrEngine.recognizeFrame(frame.canvas, {
          mode: 'isbn-ocr',
          onStatus: (msg) => {
            if (state.phase === 'streaming') {
              state.statusMessage = `OCR scanning ISBN line · ${msg}`;
              emit();
            }
          },
        });
        if (ocrOut.matchedIsbn) {
          triggerDetectionLock({
            kind: 'isbn',
            isbn13: ocrOut.isbn13,
            isbn10: ocrOut.isbn10,
            sourceLabel:
              ocrOut.confidence === 'ocr-repaired' ? 'ISBN OCR (Auto-Repaired)' : 'ISBN Text OCR',
            lockedAt: new Date().toISOString(),
          });
        } else if (forceCapture) {
          state.ignoredHint =
            'No valid 10/13-digit ISBN check digit detected in frame yet. Move closer to the "ISBN 978..." line.';
          emit();
        }
      } else if (state.mode === 'cover') {
        // Fast passive barcode check first in case user flips to back cover
        const passiveFrame = renderCroppedCanvas({
          source: boundVideoEl,
          crop,
          enhanceOcr: false,
        });
        const barcodeHit = await barcodeDecoder.decodeFrame(passiveFrame);
        if (barcodeHit.matched) {
          triggerDetectionLock({
            kind: 'isbn',
            isbn13: barcodeHit.isbn13,
            isbn10: barcodeHit.isbn10,
            sourceLabel: 'Cover Back-Barcode',
            lockedAt: new Date().toISOString(),
          });
          return;
        }

        if (forceCapture) {
          state.statusMessage = 'Reading cover typography via OCR…';
          emit();
          const ocrFrame = renderCroppedCanvas({
            source: boundVideoEl,
            crop,
            enhanceOcr: true,
          });
          const coverOcr = await ocrEngine.recognizeFrame(ocrFrame.canvas, {
            mode: 'cover',
          });
          if (coverOcr.matchedIsbn) {
            triggerDetectionLock({
              kind: 'isbn',
              isbn13: coverOcr.isbn13,
              isbn10: coverOcr.isbn10,
              sourceLabel: 'Cover ISBN OCR',
              lockedAt: new Date().toISOString(),
            });
          } else if (coverOcr.suggestedTitleQuery) {
            triggerDetectionLock({
              kind: 'cover-title',
              isbn13: '',
              titleQuery: coverOcr.suggestedTitleQuery,
              sourceLabel: 'Cover Title OCR',
              lockedAt: new Date().toISOString(),
            });
          } else {
            state.ignoredHint =
              'Could not read clear title letters from cover frame. Reduce glare or use Title Search.';
            state.statusMessage = 'Center the book cover inside the 3:4 frame and tap Capture Cover.';
            emit();
          }
        }
      }
    } catch (_) {
      // Transient frame errors should not crash live polling loop
    } finally {
      frameBusy = false;
    }
  }

  function restartPollingLoop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (!activeStream) return;
    // Fast 240ms cadence for 1D barcodes; gentler 1350ms cadence for WASM text-line OCR
    const intervalMs = state.mode === 'isbn-ocr' ? 1350 : 260;
    pollTimer = setInterval(() => {
      inspectLiveVideoFrame(false);
    }, intervalMs);
  }

  /**
   * Requests rear camera (`environment`) with graceful fallback to any available camera.
   * Invokes `getUserMedia` synchronously within the user tap gesture (without awaiting async capability probes first)
   * so iOS Safari PWAs and mobile browsers always grant and display the live camera stream reliably.
   */
  async function startCamera() {
    if (!state.support) {
      initSupport().catch(() => {});
    }

    if (activeStream || boundVideoEl || pollTimer) {
      stopCamera();
    }

    const secureOk = typeof window === 'undefined' || window.isSecureContext !== false;
    const hasGetUserMedia = Boolean(
      secureOk &&
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
    );

    if (!hasGetUserMedia) {
      state.phase = 'error';
      state.errorMessage = describeCameraError(new Error('Camera API unavailable in this browser.'));
      emit();
      return;
    }

    state.phase = 'starting-camera';
    state.errorMessage = '';
    state.ignoredHint = '';
    state.lock = null;
    state.statusMessage = 'Requesting camera access…';
    emit();

    try {
      /** @type {MediaStreamConstraints} */
      const preferredConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      try {
        activeStream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (firstErr) {
        const errName =
          firstErr && typeof firstErr === 'object' && 'name' in firstErr ? String(firstErr.name) : '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          throw firstErr;
        }
        try {
          activeStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: state.facingMode },
          });
        } catch (_) {
          activeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      const primaryVideoTrack =
        activeStream && typeof activeStream.getVideoTracks === 'function'
          ? activeStream.getVideoTracks()[0] || null
          : null;
      const trackCaps =
        primaryVideoTrack && typeof primaryVideoTrack.getCapabilities === 'function'
          ? /** @type {any} */ (primaryVideoTrack.getCapabilities())
          : null;
      state.torchSupported = Boolean(trackCaps && 'torch' in trackCaps && trackCaps.torch);
      state.torchOn = false;

      state.phase = 'streaming';
      state.statusMessage =
        state.mode === 'barcode'
          ? 'Align a 978/979 ISBN barcode inside the wide guide…'
          : state.mode === 'isbn-ocr'
            ? 'Hold steady over the printed "ISBN 978-..." line…'
            : 'Center the book cover inside the 3:4 frame and tap Capture Cover…';

      if (typeof document !== 'undefined') {
        const liveVideo = document.getElementById('scanner-live-video');
        if (liveVideo) {
          attachVideoElement(/** @type {HTMLVideoElement} */ (liveVideo));
        }
      }

      restartPollingLoop();
      emit();
    } catch (err) {
      state.phase = 'error';
      state.errorMessage = describeCameraError(err);
      state.statusMessage = 'Camera unavailable — Upload Photo fallback ready.';
      emit();
    }
  }

  /**
   * Toggles the rear camera hardware flashlight (`torch` constraint) when supported by the device.
   * @returns {Promise<{ ok: boolean, torchOn: boolean, message?: string }>}
   */
  async function toggleTorch() {
    const track =
      activeStream && typeof activeStream.getVideoTracks === 'function'
        ? activeStream.getVideoTracks()[0] || null
        : null;
    if (!track || state.phase !== 'streaming' || typeof track.applyConstraints !== 'function') {
      return {
        ok: false,
        torchOn: false,
        message: 'Start the rear camera first to toggle the flashlight.',
      };
    }

    const nextTorch = !state.torchOn;
    try {
      await track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: nextTorch }] }));
      state.torchSupported = true;
      state.torchOn = nextTorch;
      emit();
      return { ok: true, torchOn: nextTorch };
    } catch (_) {
      state.torchOn = false;
      emit();
      return {
        ok: false,
        torchOn: false,
        message: 'Flashlight control is not supported by this camera or browser.',
      };
    }
  }

  async function flipCamera() {
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    if (state.phase === 'streaming') {
      await startCamera();
    } else {
      emit();
    }
  }

  /**
   * Processes a gallery/camera photo upload with an animated scan-line overlay:
   * tries barcode decoding first (full image + center band), then falls back to OCR extraction
   * so uploaded photos succeed even if the user accidentally left the mode tab on Barcode vs OCR!
   *
   * @param {File} file
   */
  async function scanUploadedFile(file) {
    await initSupport();
    stopCamera();

    state.phase = 'analyzing-upload';
    state.errorMessage = '';
    state.ignoredHint = '';
    state.lock = null;
    state.statusMessage = 'Scanning uploaded photo…';
    emit();

    try {
      const loaded = await loadUploadedImage(file);
      uploadedPreviewUrl = loaded.objectUrl;
      state.uploadedPreviewUrl = loaded.objectUrl;
      emit();

      // Allow at least 420ms so the animated scan-line sweep renders visibly over the uploaded photo
      const minSweepDelay = new Promise((r) => setTimeout(r, 420));

      const fullCrop = computeModeCropBox({
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
        mode: state.mode,
        fullImage: true,
      });
      const guideCrop = computeModeCropBox({
        sourceWidth: loaded.width,
        sourceHeight: loaded.height,
        mode: state.mode,
      });

      // Step 1: Attempt fast 1D barcode decode on full image & cropped guide region
      if (state.mode === 'barcode' || state.mode === 'cover') {
        const fullFrame = renderCroppedCanvas({
          source: loaded.image,
          crop: fullCrop,
          enhanceOcr: false,
        });
        const fullDecode = await barcodeDecoder.decodeFrame(fullFrame);
        if (fullDecode.matched) {
          await minSweepDelay;
          triggerDetectionLock({
            kind: 'isbn',
            isbn13: fullDecode.isbn13,
            isbn10: fullDecode.isbn10,
            sourceLabel:
              fullDecode.engine === 'native-barcode-detector'
                ? 'Uploaded Photo · Barcode (Native)'
                : 'Uploaded Photo · Barcode (ZXing)',
            lockedAt: new Date().toISOString(),
          });
          return;
        }

        const croppedFrame = renderCroppedCanvas({
          source: loaded.image,
          crop: guideCrop,
          enhanceOcr: false,
        });
        const croppedDecode = await barcodeDecoder.decodeFrame(croppedFrame);
        if (croppedDecode.matched) {
          await minSweepDelay;
          triggerDetectionLock({
            kind: 'isbn',
            isbn13: croppedDecode.isbn13,
            isbn10: croppedDecode.isbn10,
            sourceLabel: 'Uploaded Photo · Cropped Barcode',
            lockedAt: new Date().toISOString(),
          });
          return;
        }
      }

      // Step 2: Run contrast-enhanced OCR (handles `isbn-ocr`, `cover`, AND photos of printed ISBNs uploaded in `barcode` mode)
      state.statusMessage = 'Running optical character recognition on photo…';
      emit();

      const ocrCanvas = renderCroppedCanvas({
        source: loaded.image,
        crop: fullCrop,
        enhanceOcr: true,
      });

      const ocrMode = state.mode === 'isbn-ocr' ? 'isbn-ocr' : 'cover';
      const ocrResult = await ocrEngine.recognizeFrame(ocrCanvas.canvas, {
        mode: ocrMode,
        onStatus: (msg) => {
          if (state.phase === 'analyzing-upload') {
            state.statusMessage = `Analyzing photo text · ${msg}`;
            emit();
          }
        },
      });

      await minSweepDelay;

      if (ocrResult.matchedIsbn) {
        triggerDetectionLock({
          kind: 'isbn',
          isbn13: ocrResult.isbn13,
          isbn10: ocrResult.isbn10,
          sourceLabel:
            ocrResult.confidence === 'ocr-repaired'
              ? 'Uploaded Photo · ISBN OCR (Repaired)'
              : 'Uploaded Photo · ISBN OCR',
          lockedAt: new Date().toISOString(),
        });
        return;
      }

      if (state.mode === 'cover' && ocrResult.suggestedTitleQuery) {
        triggerDetectionLock({
          kind: 'cover-title',
          isbn13: '',
          titleQuery: ocrResult.suggestedTitleQuery,
          sourceLabel: 'Uploaded Cover · Title OCR',
          lockedAt: new Date().toISOString(),
        });
        return;
      }

      state.phase = 'error';
      state.errorMessage =
        state.mode === 'barcode'
          ? 'No valid 978/979 ISBN barcode or printed ISBN text was found in that photo. Crop closer to the barcode or enter the digits in ISBN Lookup.'
          : state.mode === 'isbn-ocr'
            ? 'Could not verify a 10- or 13-digit ISBN checksum in that image. Try clearer lighting or enter the ISBN manually.'
            : 'No readable ISBN or cover title text found in that photo. Try Title Search or a closer cover photo.';
      state.statusMessage = 'Upload scan finished with no verified match.';
      emit();
    } catch (err) {
      state.phase = 'error';
      state.errorMessage =
        err instanceof Error ? err.message : 'Could not analyze the uploaded image.';
      emit();
    }
  }

  function resetLock() {
    state.lock = null;
    state.errorMessage = '';
    state.ignoredHint = '';
    revokeUploadPreview();
    state.phase = 'idle';
    state.statusMessage = 'Ready to scan via live camera or uploaded photo.';
    emit();
  }

  async function destroy() {
    stopCamera();
    await ocrEngine.terminate();
  }

  return {
    getState: () => state,
    initSupport,
    setMode,
    startCamera,
    stopCamera,
    flipCamera,
    toggleTorch,
    attachVideoElement,
    captureCurrentFrame: () => inspectLiveVideoFrame(true),
    scanUploadedFile,
    resetLock,
    destroy,
  };
}
