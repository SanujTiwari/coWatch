import { useRef, useEffect, useState } from 'react';
import { FiUser, FiMicOff, FiVideoOff } from 'react-icons/fi';
import './CallParticipant.css';

const CallParticipant = ({ user, stream, isLocal, isMicEnabled, isCameraEnabled, status, className }) => {
  const videoRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <div className={`call-participant ${isLocal ? 'local' : 'remote'} ${className || ''}`}>
      <div className="video-container">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="participant-video"
          />
        ) : (
          <div className="video-placeholder">
            <FiUser size={48} />
          </div>
        )}
        {isCameraEnabled === false && (
          <div className="camera-off">
            <FiVideoOff size={32} />
          </div>
        )}
        {isMicEnabled === false && (
          <div className="mic-off">
            <FiMicOff size={20} />
          </div>
        )}
        {isLocal && <div className="local-badge">You</div>}
        {playbackBlocked && (
          <button className="participant-playback" onClick={() => {
            videoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
          }}>Enable media</button>
        )}
      </div>
      <div className="participant-name">
        {user?.name || 'Unknown User'}
        {status && <span> · {status}</span>}
      </div>
    </div>
  );
};

export default CallParticipant;
