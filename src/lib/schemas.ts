// =============================================================================
// PlumbTix — Frontend Validation Schemas (Zod)
// =============================================================================
// These mirror the edge function Zod schemas exactly, so client-side
// validation matches server-side validation 1:1.
//
// Usage with react-hook-form:
//   import { useForm } from 'react-hook-form';
//   import { zodResolver } from '@hookform/resolvers/zod';
//   import { BuildingSchema, type BuildingFormValues } from '@/lib/schemas';
//   const form = useForm<BuildingFormValues>({ resolver: zodResolver(BuildingSchema) });
//
// Usage standalone:
//   const result = BuildingSchema.safeParse(formData);
//   if (!result.success) { /* result.error.issues */ }
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export const BuildingSchema = z.object({
  name: z.string().max(255).optional().transform((v) => v?.trim() || ''),
  address_line1: z
    .string()
    .min(1, 'Address is required')
    .max(255)
    .transform((v) => v.trim()),
  address_line2: z.string().max(255).optional().transform((v) => v?.trim() || ''),
  city: z.string().min(1, 'City is required').max(100).transform((v) => v.trim()),
  state: z
    .string()
    .min(1, 'State is required')
    .regex(/^[A-Za-z]{2}$/, 'Must be 2 letters (e.g. CA)')
    .transform((v) => v.trim().toUpperCase()),
  zip: z
    .string()
    .min(1, 'ZIP is required')
    .max(10)
    .regex(/^\d{5}(-\d{4})?$/, 'Must be 5 digits (or 12345-6789)')
    .transform((v) => v.trim()),
  gate_code: z.string().max(50).optional().transform((v) => v?.trim() || ''),
  water_shutoff_location: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || ''),
  gas_shutoff_location: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || ''),
  onsite_contact_name: z
    .string()
    .max(255)
    .optional()
    .transform((v) => v?.trim() || ''),
  onsite_contact_phone: z
    .string()
    .max(20)
    .optional()
    .refine(
      (v) => {
        if (!v || !v.trim()) return true;
        const cleaned = v.replace(/[\s\-().+]/g, '');
        return /^\d{7,15}$/.test(cleaned);
      },
      { message: 'Invalid phone format' }
    )
    .transform((v) => v?.trim() || ''),
  access_notes: z.string().optional().transform((v) => v?.trim() || ''),
});

export type BuildingFormValues = z.infer<typeof BuildingSchema>;

// ---------------------------------------------------------------------------
// Space — flat object with conditional validation (RHF-friendly)
// ---------------------------------------------------------------------------

export const SpaceSchema = z
  .object({
    space_type: z.enum(['unit', 'common_area']),
    unit_number: z.string().max(20).default(''),
    common_area_type: z.string().default(''),
    floor: z.string().default(''),
    bedrooms: z.string().default(''),
    bathrooms: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.space_type === 'unit') {
      if (!data.unit_number.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Unit number is required',
          path: ['unit_number'],
        });
      }
    } else {
      const validTypes = [
        'boiler_room',
        'pool',
        'garage',
        'roof',
        'crawlspace',
        'laundry',
        'water_room',
        'other',
      ];
      if (!validTypes.includes(data.common_area_type)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select an area type',
          path: ['common_area_type'],
        });
      }
    }
  });

export type SpaceFormValues = z.infer<typeof SpaceSchema>;

// ---------------------------------------------------------------------------
// Company
// ---------------------------------------------------------------------------

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CompanySchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255).transform((v) => v.trim()),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100)
    .regex(SLUG_REGEX, 'Lowercase letters, numbers, and hyphens only')
    .transform((v) => v.trim()),
});

export type CompanyFormValues = z.infer<typeof CompanySchema>;
