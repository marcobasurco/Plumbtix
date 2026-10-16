import * as React from 'react';
import { cn } from '@/lib/utils';
import { formatPhoneAsYouType, isValidPhone, PHONE_ERROR } from '@shared/phone';

export interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** The text as typed/shown — keep this in state; normalize with normalizePhone() when saving. */
  value: string;
  onChange: (value: string) => void;
  /** Show the standard error under the field when the text can't be a phone number. */
  showError?: boolean;
  /** Visual style: the Tailwind/shadcn Input look (default) or the legacy .form-input class. */
  variant?: 'input' | 'form';
}

/**
 * The one phone field for the whole product. Formats US numbers as you type
 * ("(650) 555-1234"), leaves "+…" international numbers alone, opens the
 * phone keypad on mobile, and offers the browser's saved number.
 *
 * It only shapes the text; saving code calls normalizePhone() to get E.164.
 */
export const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, showError = false, variant = 'input', className, placeholder, ...props }, ref) => {
    const invalid = showError && !isValidPhone(value);
    const base = variant === 'form'
      ? 'form-input'
      : 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
    return (
      <>
        <input
          ref={ref}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={placeholder ?? '(650) 555-1234'}
          value={value}
          onChange={(e) => onChange(formatPhoneAsYouType(e.target.value))}
          aria-invalid={invalid || undefined}
          className={cn(base, invalid && 'border-destructive focus-visible:ring-destructive', className)}
          {...props}
        />
        {invalid && <p className="mt-1 text-xs text-destructive" role="alert">{PHONE_ERROR}</p>}
      </>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
