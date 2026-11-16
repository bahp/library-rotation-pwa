export type CameraErrorKind =
  | 'insecure'
  | 'unavailable'
  | 'policy-blocked'
  | 'prompt-needed'
  | 'os-denied'
  | 'site-denied'
  | 'no-hardware'
  | 'in-use'
  | 'unknown';

export interface CameraErrorDiagnosis {
  kind: CameraErrorKind;
  title: string;
  message: string;
  canRetry: boolean;
  canOpenNewTab: boolean;
}

/**
 * Initiates `getUserMedia` synchronously inside a user tap handler so Safari, iOS WebKit,
 * and iframe-embedded contexts preserve transient user activation instead of rejecting
 * camera requests made later inside React `useEffect`.
 */
export function acquireCameraStream(
  facingMode: 'environment' | 'user' = 'environment'
): Promise<MediaStream> | null {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return null;
  }
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return null;
  }

  return navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    .catch((err: unknown) => {
      const name =
        err && typeof err === 'object' && 'name' in err
          ? String((err as { name?: unknown }).name)
          : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw err;
      }
      // Fallback to unconstrained video if ideal facingMode/resolution failed
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      });
    });
}

function isCameraAllowedByDocumentPolicy(): boolean | null {
  if (typeof document === 'undefined') return null;
  const docAny = document as unknown as {
    permissionsPolicy?: { allowsFeature?: (name: string) => boolean };
    featurePolicy?: { allowsFeature?: (name: string) => boolean };
  };
  try {
    if (typeof docAny.permissionsPolicy?.allowsFeature === 'function') {
      return docAny.permissionsPolicy.allowsFeature('camera');
    }
    if (typeof docAny.featurePolicy?.allowsFeature === 'function') {
      return docAny.featurePolicy.allowsFeature('camera');
    }
  } catch {
    // Ignore unsupported policy query
  }
  return null;
}

async function queryCameraPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown';
  }
  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
    });
    if (status?.state === 'granted' || status?.state === 'prompt' || status?.state === 'denied') {
      return status.state;
    }
  } catch {
    // Safari & older WebKit throw TypeError for 'camera' in permissions.query
  }
  return 'unknown';
}

function isRunningInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export async function diagnoseCameraAccessError(err: unknown): Promise<CameraErrorDiagnosis> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return {
      kind: 'insecure',
      title: 'HTTPS Required for Camera',
      message:
        'Live camera access requires a secure HTTPS connection (or localhost). Upload a photo or enter the ISBN below.',
      canRetry: false,
      canOpenNewTab: false,
    };
  }

  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: unknown }).name)
      : '';
  const rawMessage =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message?: unknown }).message)
      : '';
  const lowerMsg = rawMessage.toLowerCase();
  const inIframe = isRunningInIframe();

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'no-hardware',
      title: 'No Camera Detected',
      message:
        'No camera hardware was detected on this device. Upload a photo or type the ISBN below.',
      canRetry: true,
      canOpenNewTab: false,
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      kind: 'in-use',
      title: 'Camera Busy',
      message:
        'Your camera appears to be in use by another app or browser tab. Close it and tap Retry Camera, or upload a photo.',
      canRetry: true,
      canOpenNewTab: false,
    };
  }

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    const policyAllows = isCameraAllowedByDocumentPolicy();
    const permState = await queryCameraPermissionState();

    // 1. Explicitly blocked by iframe allow="camera" or Permissions-Policy header
    if (
      policyAllows === false ||
      lowerMsg.includes('policy') ||
      lowerMsg.includes('feature') ||
      lowerMsg.includes('not allowed in this document')
    ) {
      return {
        kind: 'policy-blocked',
        title: 'Camera Blocked by Preview Frame',
        message:
          'This embedded preview frame blocks direct camera access even though you did not deny permission. Open the app in a dedicated browser tab, or upload a photo / type the ISBN below.',
        canRetry: true,
        canOpenNewTab: inIframe,
      };
    }

    // 2. OS-level camera privacy toggle (e.g., Chrome "Permission denied by system")
    if (lowerMsg.includes('system')) {
      return {
        kind: 'os-denied',
        title: 'System Camera Privacy Off',
        message:
          'Your device operating system blocked browser camera access. Enable Camera for your browser in System Settings, then tap Retry Camera.',
        canRetry: true,
        canOpenNewTab: false,
      };
    }

    // 3. Permission state is still 'prompt' (never explicitly denied by user!)
    if (permState === 'prompt' || lowerMsg.includes('dismissed')) {
      return {
        kind: 'prompt-needed',
        title: 'Camera Permission Needed',
        message: inIframe
          ? 'The browser did not complete the camera prompt inside this embedded frame. Tap Retry Camera, open in a dedicated tab, or upload a photo below.'
          : 'The camera prompt was dismissed or needs a direct tap to start. Tap Retry Camera below to allow access, or upload a photo.',
        canRetry: true,
        canOpenNewTab: inIframe,
      };
    }

    // 4. Inside an iframe where permissions.query is unsupported (Safari) and NotAllowedError fired
    if (inIframe && permState === 'unknown') {
      return {
        kind: 'policy-blocked',
        title: 'Camera Unavailable in Embedded Frame',
        message:
          'Embedded preview frames often restrict live camera prompts. Tap Retry Camera, open in a new tab for full camera access, or upload a photo below.',
        canRetry: true,
        canOpenNewTab: true,
      };
    }

    // 5. Explicitly denied at site level
    return {
      kind: 'site-denied',
      title: 'Camera Permission Blocked',
      message:
        'Camera access is currently blocked for this site. Allow camera in your browser address bar or site settings and tap Retry Camera, or upload a photo below.',
      canRetry: true,
      canOpenNewTab: inIframe,
    };
  }

  return {
    kind: 'unknown',
    title: 'Camera Access Needed',
    message:
      'Unable to open the live camera right now. Tap Retry Camera, upload a photo, or enter the ISBN below.',
    canRetry: true,
    canOpenNewTab: inIframe,
  };
}
