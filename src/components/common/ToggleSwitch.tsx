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
      className="group inline-flex items-center justify-end gap-2.5 min-h-[44px] min-w-[52px] md:min-w-0 py-1 px-0.5 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-700 disabled:opacity-50 cursor-pointer shrink-0 select-none"
    >
      {/* Desktop-only quiet status label for mouse/keyboard clarity */}
      <span
        aria-hidden="true"
        className={`hidden md:inline-block text-[11px] font-semibold tabular-nums transition-colors ${
          checked
            ? 'text-forest-700 dark:text-[#5ED3DA]'
            : 'text-stone-ink/75 dark:text-slate-400'
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
            ? 'bg-forest-700 dark:bg-[#5ED3DA] md:group-hover:ring-forest-700/15 dark:md:group-hover:ring-[#5ED3DA]/20'
            : 'bg-linen-200 dark:bg-night-700 md:group-hover:ring-linen-200/70 dark:md:group-hover:ring-night-700/70'
        }`}
      >
        <span
          className={`lr-switch-thumb inline-block rounded-full bg-white dark:bg-night-950 shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            checked ? 'dark:bg-night-950' : 'dark:bg-slate-200'
          }`}
        />
      </span>
    </button>
  );
};
