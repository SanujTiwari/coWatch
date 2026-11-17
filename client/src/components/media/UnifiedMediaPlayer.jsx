import YouTubePlayer from './YouTubePlayer';
import Html5Player from './Html5Player';
import InstagramPlayer from './InstagramPlayer';
import { detectProvider } from '../../lib/mediaProviders';

const UnifiedMediaPlayer = ({ media, isPlaying, currentTime, canControl = false, onPlaybackChange }) => {
  if (!media?.url) {
    return <div className="media-empty"><p>No media loaded</p></div>;
  }
  const provider = detectProvider(media.url);
  const props = { media, currentTime, isPlaying, canControl, onPlaybackChange, className: 'media-player-frame' };
  return (
    <div className="unified-player" style={{ width: '100%', height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}>
      {provider === 'youtube' ? <YouTubePlayer {...props} /> :
        provider === 'reel' ? <InstagramPlayer {...props} /> : <Html5Player {...props} />}
      {provider === 'reel' && (
        <p className="media-platform-notice">Instagram playback is controlled independently by each viewer.</p>
      )}
    </div>
  );
};

export default UnifiedMediaPlayer;
