import { useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Validation rules matching DB constraints
// ---------------------------------------------------------------------------

export const VALIDATORS = {
  required: (val: string, label = 'Field') =>
    val.trim() ? null : `${label} is required`,

  state: (val: string) => {
    if (!val.trim()) return 'State is required';
    if (!/^[A-Za-z]{2}$/.test(val.trim())) return 'State must be exactly 2 letters (e.g. CA)';
    return null;
  },

  zip: (val: string) => {
    if (!val.trim()) return 'ZIP code is required';
    if (!/^\d{5}(-\d{4})?$/.test(val.trim())) return 'ZIP must be 5 digits (or 5+4 format: 12345-6789)';
    return null;
  },

  phone: (val: string) => {
    if (!val.trim()) return null; // phone is optional
    const cleaned = val.replace(/[\s\-().+]/g, '');
    if (!/^\+?\d{7,15}$/.test(cleaned)) return 'Invalid phone number format';
    return null;
  },

  email: (val: string) => {
    if (!val.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) return 'Invalid email format';
    return null;
  },

  slug: (val: string) => {
    if (!val.trim()) return 'Slug is required';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val.trim()))
      return 'Slug must be lowercase letters, numbers, and hyphens only';
    return null;
  },

  unitNumber: (val: string) => {
    if (!val.trim()) return 'Unit number is required';
    return null;
  },

  positiveInt: (val: string, label = 'Value') => {
    if (!val.trim()) return null; // optional
    const n = parseInt(val);
    if (isNaN(n) || n < 0) return `${label} must be a positive number`;
    return null;
  },

  positiveDecimal: (val: string, label = 'Value') => {
    if (!val.trim()) return null; // optional
    const n = parseFloat(val);
    if (isNaN(n) || n < 0) return `${label} must be a positive number`;
    return null;
  },
} as const;

// ---------------------------------------------------------------------------
// useFormValidation hook
// ---------------------------------------------------------------------------

type FieldValidator = (value: string) => string | null;

interface FieldConfig {
  initial: string;
  validators?: FieldValidator[];
}

type FormConfig<T extends string> = Record<T, FieldConfig>;

interface FieldState {
  value: string;
  error: string | null;
  touched: boolean;
}

export function useFormValidation<T extends string>(config: FormConfig<T>) {
  const fieldNames = Object.keys(config) as T[];

  const [fields, setFields] = useState<Record<T, FieldState>>(() => {
    const initial = {} as Record<T, FieldState>;
    for (const name of fieldNames) {
      initial[name] = { value: config[name].initial, error: null, touched: false };
    }
    return initial;
  });

  const setValue = useCallback((name: T, value: string) => {
    setFields((prev) => {
      const validators = config[name].validators ?? [];
      let error: string | null = null;
      for (const v of validators) {
        error = v(value);
        if (error) break;
      }
      return {
        ...prev,
        [name]: { value, error: prev[name].touched ? error : null, touched: prev[name].touched },
      };
    });
  }, [config]);

  const setTouched = useCallback((name: T) => {
    setFields((prev) => {
      const validators = config[name].validators ?? [];
      let error: string | null = null;
      for (const v of validators) {
        error = v(prev[name].value);
        if (error) break;
      }
      return { ...prev, [name]: { ...prev[name], touched: true, error } };
    });
  }, [config]);

  const setAllTouched = useCallback(() => {
    setFields((prev) => {
      const next = { ...prev };
      for (const name of fieldNames) {
        const validators = config[name].validators ?? [];
        let error: string | null = null;
        for (const v of validators) {
          error = v(prev[name].value);
          if (error) break;
        }
        next[name] = { ...prev[name], touched: true, error };
      }
      return next;
    });
  }, [config, fieldNames]);

  const resetForm = useCallback((values?: Partial<Record<T, string>>) => {
    setFields((prev) => {
      const next = { ...prev };
      for (const name of fieldNames) {
        next[name] = {
          value: values?.[name] ?? config[name].initial,
          error: null,
          touched: false,
        };
      }
      return next;
    });
  }, [config, fieldNames]);

  const isValid = useMemo(() => {
    for (const name of fieldNames) {
      const validators = config[name].validators ?? [];
      for (const v of validators) {
        if (v(fields[name].value)) return false;
      }
    }
    return true;
  }, [fields, config, fieldNames]);

  const values = useMemo(() => {
    const v = {} as Record<T, string>;
    for (const name of fieldNames) {
      v[name] = fields[name].value;
    }
    return v;
  }, [fields, fieldNames]);

  return { fields, setValue, setTouched, setAllTouched, resetForm, isValid, values };
}
