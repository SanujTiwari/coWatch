import { useEffect, useRef, useState } from 'react';

const Html5Player = ({ media, currentTime, isPlaying, canControl, onPlaybackChange, className }) => {
  const videoRef = useRef(null);
  const expectedState = useRef(null);
  const expectedSeek = useRef(null);
  const [error, setError] = useState('');
  const sync = () => {
    const video = videoRef.current;
    if (!video || video.readyState === 0) return;
    if (Number.isFinite(currentTime) && Math.abs(video.currentTime - currentTime) > 0.75) {
      expectedSeek.current = { time: currentTime, until: Date.now() + 2000 };
      video.currentTime = currentTime;
    }
    if (isPlaying && video.paused) {
      expectedState.current = { type: 'play', until: Date.now() + 2000 };
      video.play().catch(() => setError('Playback was blocked. Use the player controls to start playback.'));
    } else if (!isPlaying && !video.paused) {
      expectedState.current = { type: 'pause', until: Date.now() + 2000 };
      video.pause();
    }
  };
  useEffect(sync, [currentTime, isPlaying, media.url]);
  const changed = (type) => {
    const time = videoRef.current.currentTime;
    if (type === 'seek' && expectedSeek.current && Date.now() <= expectedSeek.current.until &&
        Math.abs(time - expectedSeek.current.time) < 0.75) {
      expectedSeek.current = null;
      return;
    }
    if (expectedState.current?.type === type && Date.now() <= expectedState.current.until) {
      expectedState.current = null;
      return;
    }
    if (canControl) onPlaybackChange?.(type, time);
  };
  return (
    <>
      <video ref={videoRef} className={className || 'html5-player'} src={media.url}
        controls={canControl} playsInline onLoadedMetadata={sync}
        onPlay={() => changed('play')} onPause={() => changed('pause')}
        onSeeked={() => changed('seek')}
        onError={() => setError('This video could not be loaded or is not supported by your browser.')}
        style={{ width: '100%', height: '100%', background: '#000' }} />
      {error && (
        <div className="media-platform-notice" role="alert">
          {error}
          <button type="button" onClick={() => {
            videoRef.current?.play().then(() => setError('')).catch(() => setError('Playback could not be started.'));
          }}>Try playback</button>
        </div>
      )}
    </>
  );
};

export default Html5Player;
