import React, { useImperativeHandle, useRef } from 'react';
import { Icon } from './Icon.js';

interface ClearableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onValueChange: (val: string) => void;
  containerClassName?: string;
  leadingIcon?: React.ReactNode;
  trailingElement?: React.ReactNode;
  trailingWidth?: 'single' | 'double';
}

export const ClearableInput = React.forwardRef<HTMLInputElement, ClearableInputProps>(
  (
    {
      value,
      onValueChange,
      containerClassName = '',
      className = '',
      id,
      type = 'text',
      placeholder,
      leadingIcon,
      trailingElement,
      trailingWidth = 'single',
      ...rest
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

    const handleClear = () => {
      onValueChange('');
      inputRef.current?.focus();
    };

    const paddingRightClass = !trailingElement
      ? 'pr-10'
      : trailingWidth === 'double'
        ? value.length > 0
          ? 'pr-[116px]'
          : 'pr-[84px]'
        : 'pr-20';

    const clearRightClass = !trailingElement
      ? 'right-1.5'
      : trailingWidth === 'double'
        ? 'right-[82px]'
        : 'right-11';

    return (
      <div className={`relative flex items-center ${containerClassName}`}>
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3.5 flex items-center text-ink-muted">
            {leadingIcon}
          </span>
        )}
        <input
          ref={inputRef}
          id={id}
          type={type}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${leadingIcon ? 'pl-10' : ''} ${paddingRightClass} ${className}`}
          {...rest}
        />
        {value.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            onClick={handleClear}
            data-action="clear-input"
            data-target-input={id}
            aria-label="Clear input"
            className={`absolute ${clearRightClass} min-h-[36px] min-w-[36px] flex items-center justify-center text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-primary rounded-full transition-colors cursor-pointer`}
          >
            <Icon name="x" className="w-4 h-4" />
          </button>
        )}
        {trailingElement && (
          <div className="absolute right-1.5 flex items-center">
            {trailingElement}
          </div>
        )}
      </div>
    );
  }
);

ClearableInput.displayName = 'ClearableInput';

