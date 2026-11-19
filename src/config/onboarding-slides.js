/**
 * @fileoverview Centralized configuration for the Onboarding Intro Slideshow.
 *
 * Edit or reorder slides here to customize capability highlights, illustrations,
 * and messaging without touching component JSX.
 */

/** @type {'slideshow' | 'compact'} */
export const ONBOARDING_LANDING_DEFAULT_MODE = 'slideshow';

/**
 * @typedef {Object} OnboardingSlideConfig
 * @property {string} id
 * @property {string} eyebrow
 * @property {string} title
 * @property {string} description
 * @property {string} icon
 * @property {string} highlightMetric
 * @property {string} highlightCaption
 * @property {'scan' | 'rotations' | 'passport' | 'privacy'} visualKind
 * @property {string} illustrationPath
 * @property {string} [eyebrowKey]
 * @property {string} [titleKey]
 * @property {string} [descriptionKey]
 * @property {string} [highlightMetricKey]
 * @property {string} [highlightCaptionKey]
 */

/** @type {readonly OnboardingSlideConfig[]} */
export const ONBOARDING_INTRO_SLIDES = Object.freeze([
  Object.freeze({
    id: 'instant-scan',
    eyebrow: 'Step 1 · Instant Cataloging',
    title: 'Scan codes & add books in seconds',
    description:
      'Point your camera at any ISBN barcode, snap a cover photo, or search Open Library and Google Books with automatic age and topic tags.',
    icon: 'scan',
    highlightMetric: 'Barcode & Cover Scan',
    highlightCaption: 'Automatic metadata, reading stage & topic tags',
    visualKind: 'scan',
    illustrationPath: 'assets/illustrations/onboarding/scan-books.jpg',
    eyebrowKey: 'onboarding.slide1Eyebrow',
    titleKey: 'onboarding.slide1Title',
    descriptionKey: 'onboarding.slide1Desc',
    highlightMetricKey: 'onboarding.slide1Metric',
    highlightCaptionKey: 'onboarding.slide1Caption',
  }),
  Object.freeze({
    id: 'smart-rotations',
    eyebrow: 'Step 2 · Curated Rotations',
    title: 'Keep every story feeling brand new',
    description:
      'Rotate a calm, face-out shelf tailored to each child’s reading stage while resting the rest so forgotten favorites delight all over again.',
    icon: 'rotations',
    highlightMetric: 'Smart Weekly Shelves',
    highlightCaption: 'Balanced themes, seasonal presets & cooldown rest',
    visualKind: 'rotations',
    illustrationPath: 'assets/illustrations/onboarding/rotation-shelf.jpg',
    eyebrowKey: 'onboarding.slide2Eyebrow',
    titleKey: 'onboarding.slide2Title',
    descriptionKey: 'onboarding.slide2Desc',
    highlightMetricKey: 'onboarding.slide2Metric',
    highlightCaptionKey: 'onboarding.slide2Caption',
  }),
  Object.freeze({
    id: 'voices-notes-passports',
    eyebrow: 'Step 3 · Shared Memories & Play',
    title: 'Voice read-alouds, quotes & passports',
    description:
      'Save cozy voice recordings and favorite quotes for each child, spark curiosity with Book Hunts, and print keepsake Reading Passports.',
    icon: 'award',
    highlightMetric: 'Memories & Play Studio',
    highlightCaption: 'Voice Notes · Family Quotes · Printable Passports',
    visualKind: 'passport',
    illustrationPath: 'assets/illustrations/onboarding/voice-passport.jpg',
    eyebrowKey: 'onboarding.slide3Eyebrow',
    titleKey: 'onboarding.slide3Title',
    descriptionKey: 'onboarding.slide3Desc',
    highlightMetricKey: 'onboarding.slide3Metric',
    highlightCaptionKey: 'onboarding.slide3Caption',
  }),
  Object.freeze({
    id: 'private-free',
    eyebrow: 'Step 4 · Private & Always Free',
    title: 'Offline-first with zero subscriptions',
    description:
      'No accounts, no cloud tracking, and zero paywalls. Unlimited books, reader profiles, and printable kits live privately on your device.',
    icon: 'shield',
    highlightMetric: '100% On-Device & Free',
    highlightCaption: 'Works offline anywhere with full JSON backup',
    visualKind: 'privacy',
    illustrationPath: 'assets/illustrations/onboarding/private-offline.jpg',
    eyebrowKey: 'onboarding.slide4Eyebrow',
    titleKey: 'onboarding.slide4Title',
    descriptionKey: 'onboarding.slide4Desc',
    highlightMetricKey: 'onboarding.slide4Metric',
    highlightCaptionKey: 'onboarding.slide4Caption',
  }),
]);
