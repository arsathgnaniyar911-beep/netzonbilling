import { useEffect, useState } from 'react';
import type { BusinessSettings } from '../types';
import {
  DEFAULT_BRAND_LOGO_PATH,
  generateWhiteLogoFromUrl,
  loadLogoForPDF,
} from '../utils/logo';

export interface ResolvedBrandLogos {
  originalLogoSrc: string;
  whiteLogoSrc: string;
  isCustomLogo: boolean;
}

export function useBrandLogos(settings?: Pick<BusinessSettings, 'logoUrl' | 'logoWhiteUrl'> | null): ResolvedBrandLogos {
  const savedOriginal = settings?.logoUrl?.trim() || '';
  const savedWhite = settings?.logoWhiteUrl?.trim() || '';
  const sourceForFallback = savedOriginal || DEFAULT_BRAND_LOGO_PATH;

  const [resolvedOriginal, setResolvedOriginal] = useState<string>(
    savedOriginal || DEFAULT_BRAND_LOGO_PATH
  );
  const [resolvedWhite, setResolvedWhite] = useState<string>(savedWhite);

  useEffect(() => {
    let cancelled = false;

    if (savedOriginal) {
      setResolvedOriginal(savedOriginal);
    } else {
      loadLogoForPDF(DEFAULT_BRAND_LOGO_PATH)
        .then((asset) => {
          if (!cancelled) setResolvedOriginal(asset.dataUrl);
        })
        .catch(() => {
          if (!cancelled) setResolvedOriginal(DEFAULT_BRAND_LOGO_PATH);
        });
    }

    if (savedWhite) {
      setResolvedWhite(savedWhite);
    } else {
      generateWhiteLogoFromUrl(sourceForFallback)
        .then((whiteUrl) => {
          if (!cancelled) setResolvedWhite(whiteUrl);
        })
        .catch(() => {
          if (!cancelled) setResolvedWhite('');
        });
    }

    return () => {
      cancelled = true;
    };
  }, [savedOriginal, savedWhite, sourceForFallback]);

  return {
    originalLogoSrc: resolvedOriginal,
    whiteLogoSrc: resolvedWhite,
    isCustomLogo: Boolean(savedOriginal),
  };
}
