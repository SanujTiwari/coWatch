import { describe, expect, it } from 'vitest';
import { detectProvider, extractYouTubeId } from '../lib/mediaProviders';

describe('media providers', () => {
  it('recognizes supported YouTube links without trusting lookalike domains', () => {
    expect(extractYouTubeId('https://youtu.be/XtF6YJw0s5o')).toBe('XtF6YJw0s5o');
    expect(extractYouTubeId('https://www.youtube.com/watch?v=XtF6YJw0s5o')).toBe('XtF6YJw0s5o');
    expect(extractYouTubeId('https://youtube.com.example.org/watch?v=XtF6YJw0s5o')).toBeNull();
  });

  it('distinguishes Instagram embeds from direct videos', () => {
    expect(detectProvider('https://www.instagram.com/reel/abc/')).toBe('reel');
    expect(detectProvider('https://instagram.com.example.org/reel/abc/')).toBe('video');
    expect(detectProvider('https://example.org/movie.mp4')).toBe('video');
  });
});
