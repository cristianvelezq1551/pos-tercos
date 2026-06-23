import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // El checkout y el tracking son por cliente (token en URL) — no indexar.
      disallow: ['/checkout', '/checkout/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
