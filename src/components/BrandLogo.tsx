// =============================================================================
// Pro Roto App — Brand logo
// =============================================================================
// The registered Pro Roto mark (public/pro-roto-logo.svg) in the brand's own
// blue and red. Light mode: directly on the page. Dark mode: on a white plate
// (styles in index.css) so the blue lettering stays readable. Never recolor,
// crop or stretch the mark.
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
