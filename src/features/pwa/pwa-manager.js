/**
 * @fileoverview Browser entry for PWA service worker registration + Home Screen install manager.
 * Delegates state and banner rendering to `./pwa-install-banner.js` while wiring Vite's
 * `virtual:pwa-register` service worker helper.
 */

import { registerSW } from 'virtual:pwa-register';
import {
  PWA_BANNER_DISMISSED_STORAGE_KEY,
  createPwaInstallController,
  loadPwaBannerDismissed,
  renderPwaInstallBanner,
  savePwaBannerDismissed,
} from './pwa-install-banner.js';

export {
  PWA_BANNER_DISMISSED_STORAGE_KEY,
  loadPwaBannerDismissed,
  renderPwaInstallBanner,
  savePwaBannerDismissed,
};

export function createPwaManager() {
  return createPwaInstallController({ registerSWFn: registerSW });
}
