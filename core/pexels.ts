import { getApiKey } from './api-keys';

const PEXELS_API = 'https://api.pexels.com/v1/search';

interface PexelsPhoto {
  id: number;
  src: { medium: string; original: string };
  alt: string;
}

export async function searchCoverImage(query: string): Promise<string | null> {
  try {
    const apiKey = await getApiKey('pexels');
    if (!apiKey) {
      console.warn('[LF:pexels] No API key configured (set via Side Panel → ⚙ → API Keys → pexels)');
      return null;
    }
    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
    const resp = await fetch(url, {
      headers: { Authorization: apiKey },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.photos?.length) return null;
    // Prefer medium size for faster upload
    return (data.photos[0] as PexelsPhoto).src.medium;
  } catch {
    return null;
  }
}
