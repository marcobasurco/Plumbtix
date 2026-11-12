// =============================================================================
// Pro Roto App — Brand logo
// =============================================================================
// The registered Pro Roto mark (public/pro-roto-logo.svg). It is drawn in the
// brand's own blue and red, so it always sits on a white plate — that keeps it
// legible on the dark sidebar and in dark mode. Never recolor or crop the mark.
// =============================================================================

import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** sm = sidebar / compact headers (32 px tall) · md = sign-in pages (48 px tall) */
  size?: 'sm' | 'md';
  className?: string;
}

export function BrandLogo({ size = 'sm', className }: BrandLogoProps) {
  return (
    <span className={cn('brand-logo', size === 'md' ? 'brand-logo-md' : 'brand-logo-sm', className)}>
      <img src="/pro-roto-logo.svg" alt="Pro Roto" width={524} height={300} decoding="async" />
    </span>
  );
}
