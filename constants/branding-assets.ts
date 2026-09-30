/**
 * Shared module references keep the branding images on Expo's static-asset
 * path. Native builds embed these files and the root layout preloads them
 * before rendering the JavaScript splash screen.
 */
export const BRAND_LOGO = require('../assets/images/logo-icon.png');
export const BRAND_WORDMARK = require('../assets/images/wordmark-cropped.png');

export const BRAND_ASSETS = [BRAND_LOGO, BRAND_WORDMARK];
