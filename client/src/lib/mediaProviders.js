export const PROVIDER_YOUTUBE = 'youtube';
export const PROVIDER_VIDEO = 'video';
export const PROVIDER_REEL = 'reel';
export const PROVIDER_DIRECT = 'direct';

export const extractYouTubeId = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    let id = null;
    if (host === 'youtu.be') id = parsed.pathname.split('/')[1];
    else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const parts = parsed.pathname.split('/').filter(Boolean);
      id = ['embed', 'shorts', 'v'].includes(parts[0]) ? parts[1] : parsed.searchParams.get('v');
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(id || '') ? id : null;
  } catch { return null; }
};

export const isYouTubeUrl = (url) => !!extractYouTubeId(url);

export const isReelUrl = (url) => {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (host === 'instagram.com' || host.endsWith('.instagram.com')) && /^\/reels?\/[^/]+/.test(u.pathname);
  } catch { return false; }
};

export const isDirectMediaUrl = (url) => {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    return /\.(mp4|webm|ogg)($|\?)/i.test(path) || u.hostname.includes('youtube.com') === false;
  } catch { return false; }
};

export const detectProvider = (url) => {
  if (!url) return PROVIDER_VIDEO;
  if (isYouTubeUrl(url)) return PROVIDER_YOUTUBE;
  if (isReelUrl(url)) return PROVIDER_REEL;
  return PROVIDER_VIDEO;
};

export const youtubeEmbedUrl = (videoId, { autoplay = 1, start = 0 } = {}) => {
  const params = new URLSearchParams({
    enablejsapi: 1,
    autoplay: String(autoplay ? 1 : 0),
    start: String(Math.max(0, start)),
    rel: 0,
    modestbranding: 1,
    origin: window.location.origin,
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

export const instagramEmbedUrl = (reelUrl) => {
  try {
    const u = new URL(reelUrl);
    const parts = u.pathname.split('/').filter(Boolean);
    const shortcode = parts[parts.length - 1] || parts[parts.length - 2];
    return `https://www.instagram.com/reel/${shortcode}/embed/`;
  } catch { return null; }
};

export const DEFAULT_EMOJIS = ['❤️','😂','🔥','😍','👏','😮','💯','🎉','😢','🤩','🍿','🥰'];
