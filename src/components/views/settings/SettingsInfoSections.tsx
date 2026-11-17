import React, { useState } from 'react';
import { Icon } from '../../common/Icon.js';
import { APP_VERSION } from '../../../version.js';

interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: string[];
  isCurrent?: boolean;
}

const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: APP_VERSION,
    date: 'November 2026',
    title: 'Refined Settings Hub & Notched Display Polish',
    summary:
      'A cleaner, calmer Settings experience organized into grouped sections with smooth sub-menu navigation, plus edge-to-edge safe-area support.',
    isCurrent: true,
    highlights: [
      'Reorganized Settings into grouped sections with uppercase headers, quick previews, and slide-in sub-menus with consistent Back buttons.',
      'Added tactile mobile-friendly toggle switches alongside compact desktop controls and a stacked vertical language picker with country flags.',
      'Added dedicated What’s New release notes, Legal disclosures (Privacy Policy, Terms of Use, Impressum), and feedback/support placements.',
      'Fixed top bar safe-area fill on notched iPhones (including iPhone 11) so the header and notch area stay visible and seamless.',
    ],
  },
  {
    version: '1.19.0',
    date: 'October 2026',
    title: 'Smart AI Curator, Tag Review & Gap Discovery',
    summary:
      'Optional free LLM integrations with server Gemini, Cloudflare Worker proxy, BYOK Gemini, and OpenAI-compatible providers.',
    highlights: [
      'Categorized AI tagging modal with format, tone, and topic review before applying.',
      'AI Curator for objective-driven shelf rotation plans and Library Gap Recommendations with 1-tap wishlist saving.',
    ],
  },
  {
    version: '1.18.0',
    date: 'September 2026',
    title: 'Shelf Freshness, Cover Adornos & Stale Spotlight',
    summary:
      'Surfaces long-unseen books automatically and nudges when active shelf picks rest unread.',
    highlights: [
      'Rotation history & cooldown tracker badges across Library, Book Details, and Swap modals.',
      '1:1 square and 3:4 portrait book cover ratios with dynamic cover-art card tinting.',
      'Preset tradition reminders with customizable advance and follow-up day windows.',
    ],
  },
  {
    version: '1.15.0',
    date: 'August 2026',
    title: '3-Mode Optical Scanner & Cover Studio',
    summary:
      'Camera and photo gallery book intake with hardware/ZXing barcode scanning, OCR ISBN extraction, and cover search.',
    highlights: [
      'Barcode, single-line ISBN OCR, and 3:4 Cover Frame scan guides with live lock feedback.',
      'Cover Studio modal for searching alternate editions or uploading personal jacket photos.',
    ],
  },
  {
    version: '1.10.0',
    date: 'July 2026',
    title: 'Multi-Reader Profiles, Presets & Play Activities',
    summary:
      'Tailored shelves per child with automatic date-of-birth age calculation and bedtime storytime games.',
    highlights: [
      'Multi-child profiles with independent active shelves, favorites, and per-reader 5-star ratings.',
      'Storytime & Topic Picker plus Book Hunt shelf treasure hunt in the Play tab.',
    ],
  },
];

export const WhatsNewSubView: React.FC = () => {
  return (
    <div className="space-y-4">
      {RELEASE_NOTES.map((release) => (
        <article
          key={release.version}
          className="rounded-xl bg-surface border border-edge p-4 sm:p-5 shadow-xs space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5 border-b border-edge-subtle">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono-tabular text-ink-secondary">
                <span className="font-semibold text-primary">
                  v{release.version}
                </span>
                <span aria-hidden="true">·</span>
                <span>{release.date}</span>
                {release.isCurrent && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-sans font-semibold text-secondary">
                      Current release
                    </span>
                  </>
                )}
              </div>
              <h2 className="font-display text-lg sm:text-xl font-semibold text-ink mt-1">
                {release.title}
              </h2>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
            {release.summary}
          </p>

          <ul className="space-y-2 pt-0.5">
            {release.highlights.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs sm:text-sm text-ink leading-relaxed"
              >
                <span
                  aria-hidden="true"
                  className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
};

interface LegalSubViewProps {
  docType: 'privacy' | 'terms' | 'impressum';
}

export const LegalSubView: React.FC<LegalSubViewProps> = ({ docType }) => {
  if (docType === 'privacy') {
    return (
      <div className="rounded-xl bg-surface border border-edge p-4 sm:p-6 shadow-xs space-y-5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
        <div>
          <p className="font-mono-tabular text-xs text-ink-muted">
            Effective Date: November 2026 · App Version {APP_VERSION}
          </p>
        </div>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            1. Local-First Family Data
          </h2>
          <p>
            Library Rotation stores your book catalog, reader profiles (names, dates of birth, reading
            progress), custom cover images, and shelf rotations directly inside your device’s browser
            storage (IndexedDB / localStorage). We do not operate tracking cookies, behavioral
            analytics, or third-party ad SDKs.
          </p>
        </section>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            2. Camera &amp; Photo Scanning
          </h2>
          <p>
            Barcode scanning, ISBN text recognition (OCR), and cover framing run locally in your browser.
            Camera video frames and uploaded photos are processed on-device and are never uploaded to an
            external server unless you explicitly initiate a book title/ISBN search or cover lookup.
          </p>
        </section>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            3. Catalog Metadata &amp; Optional AI Providers
          </h2>
          <p>
            When you search for a book or tap Update Library, queries (ISBN, title, or author) are sent
            to Google Books and/or Open Library via your configured endpoint or personal proxy URL. If
            you opt into AI Assistant or AI Enrichment features, only the selected book metadata or
            shelf prompt is sent to the LLM provider you select.
          </p>
        </section>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            4. Your Control &amp; Portability
          </h2>
          <p>
            You can export your complete family library as JSON at any time from Backup, Restore &amp;
            Reset, or clear cached cover thumbnails and reset local data directly on this device.
          </p>
        </section>
      </div>
    );
  }

  if (docType === 'terms') {
    return (
      <div className="rounded-xl bg-surface border border-edge p-4 sm:p-6 shadow-xs space-y-5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
        <p className="font-mono-tabular text-xs text-ink-muted">
          Last Updated: November 2026
        </p>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            1. Personal &amp; Household Use
          </h2>
          <p>
            Library Rotation is provided as an offline-capable personal and family library organizer. You
            are responsible for the content you catalog, upload, or back up on your devices.
          </p>
        </section>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            2. Third-Party Book Metadata &amp; AI Services
          </h2>
          <p>
            Book descriptions, ISBN records, and cover artwork retrieved through Google Books or Open
            Library remain subject to their respective provider terms and availability. When configuring
            a personal proxy URL or BYOK API key, you are responsible for complying with your chosen
            provider’s usage limits and terms.
          </p>
        </section>

        <section className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold text-ink">
            3. Backups &amp; Availability
          </h2>
          <p>
            Because all data lives locally on your device without a centralized cloud account, clearing
            browser site data removes your library unless you have saved a JSON backup export. The
            software is provided “as is” without warranty of uninterrupted availability.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface border border-edge p-4 sm:p-6 shadow-xs space-y-5 text-xs sm:text-sm text-ink-secondary leading-relaxed">
      <div className="rounded-lg bg-surface-subtle border border-edge p-3.5 text-xs">
        <p className="font-semibold text-ink">
          Impressum / Legal Notice Placement
        </p>
        <p className="mt-1 text-ink-secondary">
          Update the publisher details below with your legal entity, physical address, and contact email
          before public distribution.
        </p>
      </div>

      <dl className="divide-y divide-edge-subtle">
        <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
          <dt className="font-semibold text-ink">Application</dt>
          <dd>Library Rotation (Book Rotation PWA · v{APP_VERSION})</dd>
        </div>
        <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
          <dt className="font-semibold text-ink">Maintainer / Publisher</dt>
          <dd>[Your Name or Studio Name]</dd>
        </div>
        <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
          <dt className="font-semibold text-ink">Address</dt>
          <dd>[Street Address, Postal Code, City, Country]</dd>
        </div>
        <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
          <dt className="font-semibold text-ink">Contact Email</dt>
          <dd className="font-mono-tabular">contact@example.com</dd>
        </div>
        <div className="py-3 flex flex-col sm:flex-row sm:justify-between gap-1">
          <dt className="font-semibold text-ink">Metadata Attribution</dt>
          <dd>Google Books API · Open Library</dd>
        </div>
      </dl>
    </div>
  );
};

interface OtherSubViewProps {
  kind: 'rate' | 'feedback' | 'donate';
  onNotify: (msg: string, tone?: 'success' | 'error' | 'info') => void;
}

export const OtherSubView: React.FC<OtherSubViewProps> = ({ kind, onNotify }) => {
  const [rating, setRating] = useState<number>(5);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const [feedbackTopic, setFeedbackTopic] = useState<'idea' | 'bug' | 'translation' | 'general'>('idea');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const [selectedCoffeeTier, setSelectedCoffeeTier] = useState<'espresso' | 'latte' | 'patron'>('latte');
  const [coffeePledged, setCoffeePledged] = useState(false);

  if (kind === 'rate') {
    return (
      <div className="rounded-xl bg-surface border border-edge p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3.5">
          <span className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
            <Icon name="starFilled" className="w-5 h-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Enjoying Library Rotation?
            </h2>
            <p className="text-xs sm:text-sm text-ink-secondary mt-1 leading-relaxed">
              This placement connects to your app store or PWA directory listing once published. Tap a
              star rating below to preview the review flow.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 py-2" role="radiogroup" aria-label="App rating">
          {[1, 2, 3, 4, 5].map((star) => {
            const active = star <= rating;
            return (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                onClick={() => {
                  setRating(star);
                  setRatingSubmitted(false);
                }}
                className="min-h-[48px] min-w-[48px] rounded-lg flex items-center justify-center hover:bg-surface-subtle transition-transform active:scale-95 cursor-pointer"
              >
                <Icon
                  name={active ? 'starFilled' : 'star'}
                  className={`w-7 h-7 transition-colors ${
                    active ? 'text-accent' : 'text-edge'
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setRatingSubmitted(true);
            onNotify(`Thanks for your ${rating}-star rating preview!`, 'success');
          }}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold transition-colors shadow-xs cursor-pointer"
        >
          {ratingSubmitted ? 'Rating Preview Saved' : `Submit ${rating}-Star Rating (Placement)`}
        </button>

        {ratingSubmitted && (
          <p className="text-xs text-center text-secondary font-medium">
            Store review link placement ready — wire your App Store / Play Store URL here when live.
          </p>
        )}
      </div>
    );
  }

  if (kind === 'feedback') {
    const handleCopyDraft = () => {
      const summary = `[Library Rotation v${APP_VERSION}] [${feedbackTopic.toUpperCase()}]\n\n${
        feedbackMessage.trim() || '(No message entered yet)'
      }`;
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(summary).then(() => {
          onNotify('Feedback draft copied to clipboard.', 'success');
        });
      }
    };

    const handleSubmitPlacement = (e: React.FormEvent) => {
      e.preventDefault();
      if (!feedbackMessage.trim()) {
        onNotify('Please write a short note before sending.', 'info');
        return;
      }
      setFeedbackSent(true);
      onNotify('Feedback placement prepared! Connect your email or issue URL.', 'success');
    };

    return (
      <form
        onSubmit={handleSubmitPlacement}
        className="rounded-xl bg-surface border border-edge p-5 sm:p-6 shadow-xs space-y-4"
      >
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Send Feedback
          </h2>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Feedback placement for bug reports, translation fixes, or new rotation ideas.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'idea', label: 'Feature Idea' },
              { id: 'bug', label: 'Bug Report' },
              { id: 'translation', label: 'Translation' },
              { id: 'general', label: 'General' },
            ] as const
          ).map((topic) => {
            const active = feedbackTopic === topic.id;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => {
                  setFeedbackTopic(topic.id);
                  setFeedbackSent(false);
                }}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary text-primary-fg'
                    : 'bg-surface-subtle text-ink-secondary hover:text-ink border border-edge-subtle'
                }`}
              >
                {topic.label}
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="settings-feedback-message"
            className="block text-xs font-semibold text-ink mb-1.5"
          >
            Your message
          </label>
          <textarea
            id="settings-feedback-message"
            rows={4}
            value={feedbackMessage}
            onChange={(e) => {
              setFeedbackMessage(e.target.value);
              setFeedbackSent(false);
            }}
            placeholder="Share what worked well or what we can improve…"
            className="w-full p-3.5 rounded-lg bg-canvas border border-edge text-sm text-ink placeholder:text-ink-muted focus:outline-2 focus:outline-primary"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCopyDraft}
            className="min-h-[44px] px-4 py-2 rounded-lg bg-surface-subtle hover:bg-surface-elevated border border-edge text-xs font-semibold text-ink transition-colors cursor-pointer"
          >
            Copy Draft
          </button>

          <button
            type="submit"
            className="min-h-[44px] px-5 py-2 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors shadow-xs cursor-pointer"
          >
            <Icon name="mail" className="w-4 h-4" />
            <span>Send Feedback (Placement)</span>
          </button>
        </div>

        {feedbackSent && (
          <div
            role="status"
            className="rounded-lg bg-secondary/12 border border-secondary/35 px-3.5 py-2.5 text-xs text-ink"
          >
            Feedback placement ready. Wire your support email (`mailto:`) or issue tracker endpoint here.
          </div>
        )}
      </form>
    );
  }

  return (
    <div className="rounded-xl bg-surface border border-edge p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex items-start gap-3.5">
        <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon name="coffee" className="w-5 h-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Buy a Coffee / Support Library Rotation
          </h2>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1 leading-relaxed">
            Placement for voluntary tipping or donation links (e.g. Ko-fi, Buy Me a Coffee, or GitHub
            Sponsors). Zero features are locked behind payment.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {(
          [
            { id: 'espresso', amount: '$3', label: 'Espresso', note: 'Quick cheer' },
            { id: 'latte', amount: '$5', label: 'Flat White', note: 'Most popular' },
            { id: 'patron', amount: '$12', label: 'Shelf Patron', note: 'Big thank you' },
          ] as const
        ).map((tier) => {
          const active = selectedCoffeeTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => {
                setSelectedCoffeeTier(tier.id);
                setCoffeePledged(false);
              }}
              className={`rounded-lg p-3.5 border text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-surface-elevated border-primary'
                  : 'bg-surface-subtle border-edge hover:border-primary/50'
              }`}
            >
              <p className="font-mono-tabular text-lg font-bold text-ink">
                {tier.amount}
              </p>
              <p className="text-xs font-semibold text-ink mt-0.5">
                {tier.label}
              </p>
              <p className="text-[11px] text-ink-secondary mt-0.5">{tier.note}</p>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          setCoffeePledged(true);
          onNotify('Donation link placement triggered — attach Ko-fi / Sponsors URL when ready.', 'info');
        }}
        className="w-full min-h-[46px] px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
      >
        <Icon name="coffee" className="w-4 h-4" />
        <span>Continue to Support Link (Placement)</span>
      </button>

      {coffeePledged && (
        <p className="text-xs text-center text-ink-secondary">
          Placement ready — replace with your external donation URL (e.g. Ko-fi, GitHub Sponsors, or
          Stripe Payment Link).
        </p>
      )}
    </div>
  );
};
