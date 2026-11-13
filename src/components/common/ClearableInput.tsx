import React, { useRef } from 'react';
import { Icon } from './Icon.js';

interface ClearableInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onValueChange: (val: string) => void;
  containerClassName?: string;
}

export const ClearableInput: React.FC<ClearableInputProps> = ({
  value,
  onValueChange,
  containerClassName = '',
  className = '',
  id,
  type = 'text',
  placeholder,
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onValueChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={`relative flex items-center ${containerClassName}`}>
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pr-8 ${className}`}
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
          className="absolute right-2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 focus:outline-none transition-colors"
        >
          <Icon name="x" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
