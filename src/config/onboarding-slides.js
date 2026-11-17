/**
 * @fileoverview Centralized configuration for the Onboarding Intro Slideshow.
 *
 * Edit or reorder slides here to customize capability highlights, badges,
 * and preview cards without touching component JSX.
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
 * @property {'rotations' | 'passport' | 'scan' | 'privacy' | 'free'} visualKind
 */

/** @type {readonly OnboardingSlideConfig[]} */
export const ONBOARDING_INTRO_SLIDES = Object.freeze([
  Object.freeze({
    id: 'smart-rotations',
    eyebrow: 'Curated Weekly Shelves',
    title: 'Keep every story feeling brand new',
    description:
      'Rotate a calm, face-out selection matched to each child’s reading stage while resting the rest so forgotten favorites delight again.',
    icon: 'rotations',
    highlightMetric: '14-day rhythm',
    highlightCaption: 'Balanced themes, authors & cooldown rest',
    visualKind: 'rotations',
  }),
  Object.freeze({
    id: 'passports-play',
    eyebrow: 'Passports & Play',
    title: 'Turn reading time into cherished rituals',
    description:
      'Print keepsake Reading Passports, spark curiosity with Book Hunt clues, and pick tonight’s bedtime read without negotiation.',
    icon: 'award',
    highlightMetric: '3 Play Tools',
    highlightCaption: 'Book Hunt · Storytime Picker · Printable Passport',
    visualKind: 'passport',
  }),
  Object.freeze({
    id: 'instant-scan',
    eyebrow: 'Instant Cataloging',
    title: 'Catalog your home shelves in seconds',
    description:
      'Scan ISBN barcodes with your camera, snap a cover photo, or search Open Library and Google Books automatically.',
    icon: 'scan',
    highlightMetric: 'Barcode & Photo',
    highlightCaption: 'Smart age ranges & topic tags included',
    visualKind: 'scan',
  }),
  Object.freeze({
    id: 'private-local',
    eyebrow: '100% Private',
    title: 'Your family library stays strictly yours',
    description:
      'No accounts, no cloud tracking, and no third-party analytics. Everything lives privately on your device and works offline anytime.',
    icon: 'shield',
    highlightMetric: 'On-Device Storage',
    highlightCaption: 'Full JSON backup & portable restore anytime',
    visualKind: 'privacy',
  }),
  Object.freeze({
    id: 'free-forever',
    eyebrow: 'Always Free',
    title: 'Zero subscriptions, ads, or paywalls',
    description:
      'Every feature — unlimited books, multiple reader profiles, shelf presets, and printable passports — is completely free for families.',
    icon: 'heart',
    highlightMetric: 'Zero Paywalls',
    highlightCaption: 'Unlimited profiles, shelves & offline access',
    visualKind: 'free',
  }),
]);
