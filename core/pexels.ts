const PEXELS_API = 'https://api.pexels.com/v1/search';
const PEXELS_KEY = '***REDACTED_PEXELS_KEY***';

interface PexelsPhoto {
  id: number;
  src: { medium: string; original: string };
  alt: string;
}

export async function searchCoverImage(query: string): Promise<string | null> {
  try {
    const url = `${PEXELS_API}?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape`;
    const resp = await fetch(url, {
      headers: { Authorization: PEXELS_KEY },
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
