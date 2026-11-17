import { useEffect, useRef, useState } from 'react';
import { instagramEmbedUrl } from '../../lib/mediaProviders';

const InstagramPlayer = ({ media, className }) => {
  const containerRef = useRef(null);
  const [embedUrl, setEmbedUrl] = useState(null);

  useEffect(() => {
    const url = instagramEmbedUrl(media.url);
    setEmbedUrl(url);
  }, [media.url]);

  if (!media.url) return null;

  if (!embedUrl) {
    return (
      <div className={className || 'ig-player'} style={{ width: '100%', height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
        Preparing Instagram embed...
      </div>
    );
  }

  return (
    <div className={className || 'ig-player'} style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
      <iframe
        src={embedUrl}
        title="Instagram Reel"
        style={{ width: '100%', height: '100%', border: 0 }}
        sandbox="allow-same-origin allow-scripts"
      />
      <a href={media.url} target="_blank" rel="noopener noreferrer" style={{ position:'absolute', bottom:12, left:12, right:12, textAlign:'center', color:'#fff', background:'rgba(0,0,0,0.6)', padding:'6px 10px', borderRadius:6, fontSize:'0.85rem', textDecoration:'none', zIndex:10 }}>
        Open Instagram Reel in new tab
      </a>
    </div>
  );
};

export default InstagramPlayer;
