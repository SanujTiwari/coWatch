import { useEffect, useRef, useState } from 'react';
import { extractYouTubeId } from '../../lib/mediaProviders';

let apiPromise;
const loadYouTubeApi = () => {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previous) previous();
        resolve(window.YT);
      };
      let script = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(script);
      }
      script.addEventListener('error', () => reject(new Error('YouTube player could not be loaded.')), { once: true });
    });
  }
  return apiPromise;
};

const YouTubePlayer = ({ media, currentTime, isPlaying, canControl, onPlaybackChange, className }) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const latest = useRef({ currentTime, isPlaying, canControl, onPlaybackChange });
  const suppressUntil = useRef(0);
  const expectedState = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  latest.current = { currentTime, isPlaying, canControl, onPlaybackChange };

  useEffect(() => {
    let active = true;
    let instance;
    let previousTime;
    let previousAt;
    setReady(false);
    setError('');
    loadYouTubeApi().then((YT) => {
      if (!active) return;
      const id = extractYouTubeId(media.url);
      if (!id) throw new Error('Invalid YouTube video URL.');
      const mount = document.createElement('div');
      containerRef.current.replaceChildren(mount);
      instance = new YT.Player(mount, {
        width: '100%', height: '100%', videoId: id,
        playerVars: { enablejsapi: 1, origin: window.location.origin, controls: canControl ? 1 : 0, rel: 0 },
        events: {
          onReady: ({ target }) => {
            if (!active) return;
            playerRef.current = target;
            setReady(true);
          },
          onStateChange: ({ target, data }) => {
            if (expectedState.current?.state === data && Date.now() <= expectedState.current.until) {
              expectedState.current = null;
              return;
            }
            if (!latest.current.canControl) return;
            if (data === YT.PlayerState.PLAYING) latest.current.onPlaybackChange?.('play', target.getCurrentTime());
            if (data === YT.PlayerState.PAUSED || data === YT.PlayerState.ENDED) {
              latest.current.onPlaybackChange?.('pause', target.getCurrentTime());
            }
          },
          onAutoplayBlocked: () => setError('Autoplay was blocked. Select "Start playback" to continue.'),
          onError: () => setError('YouTube could not play this video; embedding may be restricted.'),
        },
      });
    }).catch((failure) => { if (active) setError(failure.message); });
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player?.getCurrentTime || !latest.current.canControl) return;
      const now = Date.now();
      const time = player.getCurrentTime();
      if (previousTime !== undefined && now > suppressUntil.current) {
        const playing = player.getPlayerState() === window.YT.PlayerState.PLAYING;
        const expected = previousTime + (playing ? (now - previousAt) / 1000 : 0);
        if (Math.abs(time - expected) > 2) latest.current.onPlaybackChange?.('seek', time);
      }
      previousTime = time;
      previousAt = now;
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
      playerRef.current = null;
      if (instance?.destroy) instance.destroy();
    };
  }, [media.url, canControl]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    if (Number.isFinite(currentTime) && Math.abs(player.getCurrentTime() - currentTime) > 0.75) {
      suppressUntil.current = Date.now() + 1200;
      player.seekTo(currentTime, true);
    }
    const state = player.getPlayerState();
    if (isPlaying && state !== window.YT.PlayerState.PLAYING) {
      expectedState.current = { state: window.YT.PlayerState.PLAYING, until: Date.now() + 2000 };
      player.playVideo();
    } else if (!isPlaying && state === window.YT.PlayerState.PLAYING) {
      expectedState.current = { state: window.YT.PlayerState.PAUSED, until: Date.now() + 2000 };
      player.pauseVideo();
    }
  }, [ready, currentTime, isPlaying]);

  return (
    <>
      <div ref={containerRef} className={className || 'yt-player'} style={{ width: '100%', height: '100%' }} />
      {error && (
        <div className="media-platform-notice" role="alert">
          {error}
          <button type="button" onClick={() => { playerRef.current?.playVideo(); setError(''); }}>Start playback</button>
        </div>
      )}
    </>
  );
};

export default YouTubePlayer;
