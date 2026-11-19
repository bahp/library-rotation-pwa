import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  dataAction?: string;
  onLabel?: string;
  offLabel?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
  dataAction,
  onLabel = 'On',
  offLabel = 'Off',
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      disabled={disabled}
      data-action={dataAction}
      onClick={onChange}
      className="group inline-flex items-center justify-end gap-2.5 min-h-[44px] min-w-[52px] md:min-w-0 py-1 px-0.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 cursor-pointer shrink-0 select-none"
    >
      {/* Desktop-only quiet status label for mouse/keyboard clarity */}
      <span
        aria-hidden="true"
        className={`hidden md:inline-block text-[11px] font-semibold tabular-nums transition-colors ${
          checked ? 'text-primary' : 'text-ink-muted'
        }`}
      >
        {checked ? onLabel : offLabel}
      </span>

      {/* Track: tactile 52x32 on touch/mobile, crisp 40x22 on desktop computers */}
      <span
        data-checked={checked ? 'true' : 'false'}
        aria-hidden="true"
        className={`lr-switch-track relative inline-flex items-center rounded-full transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-95 md:active:scale-100 md:group-hover:ring-4 ${
          checked
            ? 'bg-primary ring-1 ring-primary/40 md:group-hover:ring-primary/20'
            : 'bg-edge/90 ring-1 ring-inset ring-ink-muted/35 md:group-hover:ring-edge/70'
        }`}
      >
        <span
          className={`lr-switch-thumb inline-block rounded-full transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            checked ? 'bg-primary-fg shadow-md' : 'bg-surface shadow-sm ring-1 ring-black/15'
          }`}
        />
      </span>
    </button>
  );
};
