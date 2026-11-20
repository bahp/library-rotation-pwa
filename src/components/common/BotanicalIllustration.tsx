import React, { useId } from 'react';

export type BotanicalIllustrationVariant =
  | 'hero-library'
  | 'empty-library'
  | 'empty-shelf'
  | 'reading-achievement'
  | 'feature-botanical'
  | 'sidebar-divider';

export type SidebarDividerOrnamentVariant = 'laurel' | 'japanese' | 'folio' | 'minimal';

interface BotanicalIllustrationProps {
  variant: BotanicalIllustrationVariant;
  dividerStyle?: SidebarDividerOrnamentVariant;
  className?: string;
}

/**
 * Vintage botanical & literary engraved line-art illustrations with true transparent backgrounds.
 * Styled exclusively via semantic theme CSS variables (`--text-primary`, `--primary`, `--secondary`,
 * `--accent`, `--surface`, `--surface-elevated`, `--border`) so every motif blends seamlessly onto
 * both Antique Paper (light) and Forest Library (dark) canvases.
 */
export const BotanicalIllustration: React.FC<BotanicalIllustrationProps> = ({
  variant,
  dividerStyle = 'laurel',
  className = '',
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (variant === 'hero-library') {
    return (
      <svg
        viewBox="0 0 360 190"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        {/* Subtle engraved arch & celestial rule */}
        <path
          d="M66 156C66 86 116 32 180 32C244 32 294 86 294 156"
          stroke="var(--accent)"
          strokeWidth="0.9"
          strokeOpacity="0.48"
          strokeDasharray="3 4"
        />
        <path
          d="M36 164H324"
          stroke="var(--border)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M90 171H270"
          stroke="var(--accent)"
          strokeWidth="0.85"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />

        {/* Left olive & fern botanical sprig */}
        <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M98 158C76 130 62 96 58 58" strokeWidth="1.35" />
          <path d="M84 138C64 134 50 122 44 108C58 110 72 119 84 138Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.15" />
          <path d="M74 114C56 106 45 92 42 78C56 83 68 95 74 114Z" fill="var(--secondary)" fillOpacity="0.2" strokeWidth="1.15" />
          <path d="M65 89C52 78 46 65 47 52C58 59 64 72 65 89Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1.15" />
          <path d="M76 122C90 112 99 98 100 84C87 91 79 105 76 122Z" fill="var(--secondary)" fillOpacity="0.14" strokeWidth="1.1" />
          <path d="M64 95C76 83 84 68 83 54C71 63 65 78 64 95Z" fill="var(--secondary)" fillOpacity="0.14" strokeWidth="1.1" />
          <circle cx="88" cy="100" r="2.2" fill="var(--accent)" fillOpacity="0.7" stroke="var(--accent)" strokeWidth="0.9" />
          <circle cx="52" cy="128" r="2" fill="var(--accent)" fillOpacity="0.65" stroke="var(--accent)" strokeWidth="0.9" />
        </g>

        {/* Right botanical laurel branch */}
        <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M262 158C284 128 296 94 301 52" strokeWidth="1.35" />
          <path d="M276 136C296 131 308 119 314 105C300 107 287 117 276 136Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.15" />
          <path d="M286 111C304 102 315 88 317 73C303 78 292 92 286 111Z" fill="var(--secondary)" fillOpacity="0.2" strokeWidth="1.15" />
          <path d="M295 85C308 74 313 61 312 48C301 56 296 69 295 85Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1.15" />
          <path d="M283 120C270 109 262 96 261 82C274 89 281 103 283 120Z" fill="var(--secondary)" fillOpacity="0.14" strokeWidth="1.1" />
          <circle cx="271" cy="98" r="2.2" fill="var(--accent)" fillOpacity="0.7" stroke="var(--accent)" strokeWidth="0.9" />
        </g>

        {/* Antique brass desk lamp behind the stack */}
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M174 120L174 58C174 48 182 42 192 42H206" stroke="var(--accent)" strokeWidth="2.1" />
          <path d="M196 42L218 52L204 66L190 54L196 42Z" fill="var(--accent)" fillOpacity="0.22" stroke="var(--accent)" strokeWidth="1.4" />
          <path d="M201 66C188 80 176 92 162 102" stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.45" strokeDasharray="2 3" />
          <path d="M209 65C204 81 198 94 191 104" stroke="var(--accent)" strokeWidth="0.8" strokeOpacity="0.4" strokeDasharray="2 3" />
          <ellipse cx="174" cy="122" rx="16" ry="3.5" fill="var(--surface-elevated)" stroke="var(--accent)" strokeWidth="1.25" />
        </g>

        {/* Stacked vintage linen books (right-center) */}
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Bottom volume */}
          <rect x="192" y="140" width="90" height="19" rx="2.5" fill="var(--primary)" fillOpacity="0.88" stroke="var(--text-primary)" strokeWidth="1.2" />
          <path d="M203 140V159M210 140V159M268 144H279M268 155H279" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.8" />
          {/* Middle volume */}
          <rect x="198" y="122" width="80" height="17" rx="2.5" fill="var(--surface-elevated)" stroke="var(--text-primary)" strokeWidth="1.2" />
          <path d="M207 122V139M220 130.5H264" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.7" />
          {/* Top volume */}
          <rect x="206" y="106" width="66" height="15" rx="2" fill="var(--secondary)" fillOpacity="0.34" stroke="var(--text-primary)" strokeWidth="1.2" />
          <path d="M215 106V121M226 113.5H258" stroke="var(--text-primary)" strokeWidth="0.95" strokeOpacity="0.65" />
        </g>

        {/* Open illuminated folio (left-center foreground) */}
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Outer leather board */}
          <path
            d="M84 157C110 154 134 156 151 163C168 156 192 154 218 157L213 116C189 112 167 115 151 124C135 115 113 112 89 116L84 157Z"
            fill="var(--surface)"
            stroke="var(--text-primary)"
            strokeWidth="1.35"
          />
          {/* Inner paper sheets */}
          <path
            d="M90 152C113 149 135 151 151 159V124C135 115 114 113 92 117L90 152Z"
            fill="var(--surface)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <path
            d="M212 152C189 149 167 151 151 159V124C167 115 188 113 210 117L212 152Z"
            fill="var(--surface-subtle)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          {/* Center gutter & ribbon bookmark */}
          <path d="M151 124V161" stroke="var(--text-primary)" strokeWidth="1.25" />
          <path d="M151 159L147 171L151 168L155 171L151 159Z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="0.9" />
          {/* Typography engraved lines */}
          <path d="M101 125H138M100 131H136M99 137H134M98 143H125" stroke="var(--text-muted)" strokeWidth="1" />
          <path d="M164 125H198M165 131H200M166 137H195M167 143H186" stroke="var(--text-muted)" strokeWidth="1" />
          {/* Miniature botanical vignette on left page */}
          <circle cx="134" cy="143" r="3" stroke="var(--accent)" strokeWidth="0.9" />
        </g>

        {/* Small engraved stars */}
        <path d="M142 46L143.5 50L147.5 51.5L143.5 53L142 57L140.5 53L136.5 51.5L140.5 50L142 46Z" fill="var(--accent)" fillOpacity="0.7" />
        <circle cx="242" cy="54" r="1.4" fill="var(--accent)" fillOpacity="0.6" />
      </svg>
    );
  }

  if (variant === 'empty-library') {
    return (
      <svg
        viewBox="0 0 220 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        {/* Engraved arched bookplate frame */}
        <path
          d="M46 116V66C46 36 75 18 110 18C145 18 174 36 174 66V116"
          stroke="var(--border)"
          strokeWidth="1.15"
          strokeDasharray="3 3"
        />
        <path d="M28 116H192" stroke="var(--border)" strokeWidth="1.2" strokeLinecap="round" />

        {/* Botanical stems */}
        <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M58 115C44 96 42 72 48 48" strokeWidth="1.2" />
          <path d="M47 92C35 86 29 75 30 64C40 69 45 80 47 92Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.05" />
          <path d="M46 70C56 64 62 54 62 43C52 48 47 59 46 70Z" fill="var(--secondary)" fillOpacity="0.14" strokeWidth="1.05" />
          <path d="M162 115C176 96 178 72 172 48" strokeWidth="1.2" />
          <path d="M173 92C185 86 191 75 190 64C180 69 175 80 173 92Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.05" />
        </g>

        {/* Resting trio of upright archival volumes */}
        <rect x="74" y="54" width="18" height="62" rx="2" fill="var(--surface-elevated)" stroke="var(--text-primary)" strokeWidth="1.2" />
        <path d="M78 65H88M78 104H88" stroke="var(--accent)" strokeWidth="1" />
        <rect x="95" y="44" width="21" height="72" rx="2" fill="var(--primary)" fillOpacity="0.22" stroke="var(--text-primary)" strokeWidth="1.2" />
        <path d="M100 57H111M100 102H111" stroke="var(--accent)" strokeWidth="1" />
        {/* Leaning volume */}
        <g transform="rotate(-12 132 82)">
          <rect x="122" y="50" width="18" height="64" rx="2" fill="var(--surface)" stroke="var(--text-primary)" strokeWidth="1.2" />
          <path d="M126 62H136" stroke="var(--secondary)" strokeWidth="1" />
        </g>

        {/* Subtle botanical medallion */}
        <circle cx="110" cy="30" r="3" stroke="var(--accent)" strokeWidth="1" />
      </svg>
    );
  }

  if (variant === 'empty-shelf') {
    return (
      <svg
        viewBox="0 0 220 126"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        {/* Library ledge line & brackets */}
        <path d="M24 94H196" stroke="var(--text-primary)" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M44 94V106M176 94V106" stroke="var(--border)" strokeWidth="1.35" strokeLinecap="round" />
        <path d="M44 94C44 102 52 106 58 106" stroke="var(--border)" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M176 94C176 102 168 106 162 106" stroke="var(--border)" strokeWidth="1.1" strokeLinecap="round" />

        {/* Resting open notebook with ribbon bookmark */}
        <path
          d="M72 93C88 89 101 90 110 94C119 90 132 89 148 93L144 65C130 62 119 64 110 70C101 64 90 62 76 65L72 93Z"
          fill="var(--surface)"
          stroke="var(--text-primary)"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path d="M110 70V94" stroke="var(--text-primary)" strokeWidth="1.1" />
        <path d="M110 94L107 104L110 101.5L113 104L110 94Z" fill="var(--accent)" />
        <path d="M84 74H101M83 80H99M119 74H136M120 80H134" stroke="var(--text-muted)" strokeWidth="0.95" strokeLinecap="round" />

        {/* Delicate olive branch arching from right */}
        <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M168 93C165 72 154 50 136 33" strokeWidth="1.2" />
          <path d="M160 66C172 62 179 52 180 42C169 46 162 55 160 66Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1.05" />
          <path d="M148 48C156 38 158 27 154 18C146 25 144 37 148 48Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.05" />
          <path d="M150 56C138 52 129 45 125 35C136 38 145 45 150 56Z" fill="var(--secondary)" fillOpacity="0.14" strokeWidth="1.05" />
        </g>
        <circle cx="88" cy="40" r="2.2" fill="var(--accent)" fillOpacity="0.7" />
      </svg>
    );
  }

  if (variant === 'reading-achievement') {
    return (
      <svg
        viewBox="0 0 180 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        {/* Outer ex-libris crest */}
        <circle cx="90" cy="60" r="44" stroke="var(--accent)" strokeWidth="1" strokeOpacity="0.55" strokeDasharray="3 3" />
        <circle cx="90" cy="60" r="35" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.2" />

        {/* Left & Right Laurel Wreath */}
        <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
          <path d="M58 92C40 76 38 50 54 29" strokeWidth="1.2" />
          <path d="M46 72C36 67 32 58 34 49C42 53 46 62 46 72Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1" />
          <path d="M46 50C38 43 37 33 41 25C47 31 48 41 46 50Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1" />
          <path d="M122 92C140 76 142 50 126 29" strokeWidth="1.2" />
          <path d="M134 72C144 67 148 58 146 49C138 53 134 62 134 72Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1" />
          <path d="M134 50C142 43 143 33 139 25C133 31 132 41 134 50Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1" />
        </g>

        {/* Center open book emblem */}
        <path
          d="M90 50C83 46 74 46 67 49V72C74 70 83 70 90 74C97 70 106 70 113 72V49C106 46 97 46 90 50Z"
          fill="var(--surface-elevated)"
          stroke="var(--text-primary)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M90 50V74" stroke="var(--text-primary)" strokeWidth="1.1" />
        <path d="M73 56H83M73 62H83M97 56H107M97 62H107" stroke="var(--accent)" strokeWidth="1.05" strokeLinecap="round" />
        <path d="M90 32L91.8 36.6L96.5 38.2L91.8 39.8L90 44.5L88.2 39.8L83.5 38.2L88.2 36.6L90 32Z" fill="var(--accent)" />
      </svg>
    );
  }

  if (variant === 'sidebar-divider') {
    const stemGradId = `lr-div-stem-${uid}`;

    if (dividerStyle === 'japanese') {
      return (
        <svg
          viewBox="0 0 240 26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={stemGradId} x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="18%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.82" />
              <stop offset="82%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Tapered sumi-gold horizon line */}
          <path
            d="M8 13H96M144 13H232"
            stroke={`url(#${stemGradId})`}
            strokeWidth="0.9"
            strokeLinecap="round"
          />
          {/* Subtle Seigaiha / mist arcs flanking the sakura crest */}
          <path
            d="M82 13C87 9.8 93 9.8 98 13M142 13C147 9.8 153 9.8 158 13"
            stroke="var(--accent)"
            strokeOpacity="0.48"
            strokeWidth="0.85"
            strokeLinecap="round"
          />
          {/* Tiny side sakura buds */}
          <circle cx="102" cy="13" r="1.4" fill="var(--accent)" fillOpacity="0.6" />
          <circle cx="138" cy="13" r="1.4" fill="var(--accent)" fillOpacity="0.6" />
          {/* Delicate 5-petal Japanese Sakura blossom centered on the rule */}
          <g transform="translate(120 13)" stroke="var(--accent)" strokeWidth="0.95" strokeLinejoin="round">
            {[0, 72, 144, 216, 288].map((deg) => (
              <path
                key={deg}
                transform={`rotate(${deg})`}
                d="M0 -1.8C-1.9 -4.8 -2.1 -8 -0.6 -9L0 -7.6L0.6 -9C2.1 -8 1.9 -4.8 0 -1.8Z"
                fill="var(--accent)"
                fillOpacity="0.14"
              />
            ))}
            <circle cx="0" cy="0" r="1.3" fill="var(--accent)" fillOpacity="0.85" stroke="none" />
          </g>
        </svg>
      );
    }

    if (dividerStyle === 'minimal') {
      return (
        <svg
          viewBox="0 0 240 26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={stemGradId} x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="20%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.88" />
              <stop offset="80%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M10 13H106M134 13H230" stroke={`url(#${stemGradId})`} strokeWidth="0.95" strokeLinecap="round" />
          <circle cx="101" cy="13" r="1.15" fill="var(--accent)" fillOpacity="0.68" />
          <circle cx="139" cy="13" r="1.15" fill="var(--accent)" fillOpacity="0.68" />
          <path
            d="M120 7.2L125.8 13L120 18.8L114.2 13L120 7.2Z"
            fill="var(--accent)"
            fillOpacity="0.14"
            stroke="var(--accent)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle cx="120" cy="13" r="1.2" fill="var(--accent)" fillOpacity="0.85" />
        </svg>
      );
    }

    if (dividerStyle === 'folio') {
      return (
        <svg
          viewBox="0 0 240 26"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={stemGradId} x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="18%" stopColor="var(--border)" stopOpacity="0.7" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.75" />
              <stop offset="82%" stopColor="var(--border)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M8 13H86M154 13H232"
            stroke={`url(#${stemGradId})`}
            strokeWidth="0.95"
            strokeLinecap="round"
          />
          {/* Symmetrical botanical laurel leaves flanking the center emblem */}
          <g stroke="var(--accent)" strokeLinecap="round" strokeLinejoin="round">
            <path
              d="M104 13C98 9.2 91 9.4 87 13C91 16.6 98 16.8 104 13Z"
              fill="var(--accent)"
              fillOpacity="0.14"
              strokeWidth="0.95"
            />
            <path
              d="M136 13C142 9.2 149 9.4 153 13C149 16.6 142 16.8 136 13Z"
              fill="var(--accent)"
              fillOpacity="0.14"
              strokeWidth="0.95"
            />
            <circle cx="82" cy="13" r="1.15" fill="var(--accent)" fillOpacity="0.65" stroke="none" />
            <circle cx="158" cy="13" r="1.15" fill="var(--accent)" fillOpacity="0.65" stroke="none" />
          </g>
          {/* Miniature open folio centered on the rule */}
          <path
            d="M120 8.5C116.5 7 112.5 7.2 109.5 8.6V17.6C112.5 16.4 116.5 16.4 120 18.2C123.5 16.4 127.5 16.4 130.5 17.6V8.6C127.5 7.2 123.5 7 120 8.5Z"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path d="M120 8.8V18" stroke="var(--accent)" strokeWidth="0.95" strokeOpacity="0.85" />
          <path
            d="M120 3.2L120.7 4.9L122.4 5.6L120.7 6.3L120 7.9L119.3 6.3L117.6 5.6L119.3 4.9L120 3.2Z"
            fill="var(--accent)"
            fillOpacity="0.78"
          />
        </svg>
      );
    }

    // Default 'laurel': symmetrical graceful tapering olive/laurel branch inspired by classic gilt endpaper rules
    const leftLeaves = [
      { d: 'M113 13C109 8.6 103 7.4 98 8.3C101 11.4 107 13 113 13Z', op: 0.9 },
      { d: 'M105 13C101 17.4 95 18.6 90 17.7C93 14.6 99 13 105 13Z', op: 0.88 },
      { d: 'M97 13C93 8.8 87.2 7.8 82.4 8.7C85.4 11.6 91.2 13 97 13Z', op: 0.85 },
      { d: 'M89 13C85 17.2 79.4 18.2 74.6 17.3C77.6 14.4 83.2 13 89 13Z', op: 0.82 },
      { d: 'M81 13C77 9 71.5 8.2 67 9.1C70 11.7 75.4 13 81 13Z', op: 0.78 },
      { d: 'M73 13C69.2 16.9 63.8 17.7 59.5 16.9C62.3 14.3 67.6 13 73 13Z', op: 0.74 },
      { d: 'M65 13C61.5 9.4 56.4 8.7 52.4 9.5C55.1 11.8 59.9 13 65 13Z', op: 0.68 },
      { d: 'M57 13C53.7 16.4 48.8 17.1 45 16.4C47.5 14.1 52.2 13 57 13Z', op: 0.62 },
      { d: 'M49 13C46.2 10 41.8 9.5 38.4 10.2C40.7 12.1 44.8 13 49 13Z', op: 0.54 },
      { d: 'M41 13C38.6 15.6 34.8 16.1 31.8 15.5C33.9 13.7 37.5 13 41 13Z', op: 0.45 },
    ];

    return (
      <svg
        viewBox="0 0 240 26"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className={className}
      >
        <defs>
          <linearGradient id={stemGradId} x1="0" y1="0" x2="240" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
            <stop offset="12%" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.88" />
            <stop offset="88%" stopColor="var(--accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fine continuous tapered branch stem */}
        <path
          d="M6 13H234"
          stroke={`url(#${stemGradId})`}
          strokeWidth="0.95"
          strokeLinecap="round"
        />
        {/* Left & mirrored right delicate alternating laurel leaves */}
        <g stroke="var(--accent)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round">
          {leftLeaves.map((leaf, idx) => (
            <path
              key={`l-${idx}`}
              d={leaf.d}
              strokeOpacity={leaf.op}
              fill="var(--accent)"
              fillOpacity={leaf.op * 0.14}
            />
          ))}
          <g transform="translate(240 0) scale(-1 1)">
            {leftLeaves.map((leaf, idx) => (
              <path
                key={`r-${idx}`}
                d={leaf.d}
                strokeOpacity={leaf.op}
                fill="var(--accent)"
                fillOpacity={leaf.op * 0.14}
              />
            ))}
          </g>
        </g>
        {/* Subtle central stem knot */}
        <circle cx="120" cy="13" r="1.2" fill="var(--accent)" fillOpacity="0.85" />
      </svg>
    );
  }

  // 'feature-botanical' compact ornamental sprig
  return (
    <svg
      viewBox="0 0 120 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 22H42M78 22H112" stroke="var(--border)" strokeWidth="1" strokeLinecap="round" />
      <g stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 32C56 22 57 12 60 6C63 12 64 22 60 32Z" fill="var(--secondary)" fillOpacity="0.18" strokeWidth="1.1" />
        <path d="M58 24C49 23 44 17 44 11C51 12 56 17 58 24Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.05" />
        <path d="M62 24C71 23 76 17 76 11C69 12 64 17 62 24Z" fill="var(--secondary)" fillOpacity="0.16" strokeWidth="1.05" />
      </g>
      <circle cx="60" cy="35" r="2" fill="var(--accent)" />
    </svg>
  );
};
