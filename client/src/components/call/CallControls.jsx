import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiPhone, FiShare2, FiRefreshCw } from 'react-icons/fi';
import './CallControls.css';

const CallControls = ({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing,
  isCallActive,
  onToggleMic,
  onToggleCamera,
  onStartScreenShare,
  onStopScreenShare,
  onSwitchCamera,
  onEndCall,
  className,
}) => {
  return (
    <div className={`call-controls ${className || ''}`}>
      <button
        className={`control-btn ${!isMicEnabled ? 'active' : ''}`}
        onClick={onToggleMic}
        title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isMicEnabled ? <FiMic size={24} /> : <FiMicOff size={24} />}
        <span className="control-label">{isMicEnabled ? 'Mic' : 'Unmute'}</span>
      </button>

      <button
        className={`control-btn ${!isCameraEnabled ? 'active' : ''}`}
        onClick={onToggleCamera}
        title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {isCameraEnabled ? <FiVideo size={24} /> : <FiVideoOff size={24} />}
        <span className="control-label">{isCameraEnabled ? 'Cam' : 'Cam Off'}</span>
      </button>

      {isScreenSharing ? (
        <button
          className="control-btn active"
          onClick={onStopScreenShare}
          title="Stop screen sharing"
        >
          <FiShare2 size={24} />
          <span className="control-label">Stop Share</span>
        </button>
      ) : (
        <button
          className="control-btn"
          onClick={onStartScreenShare}
          title="Share screen"
        >
          <FiShare2 size={24} />
          <span className="control-label">Share</span>
        </button>
      )}

      {onSwitchCamera && (
        <button className="control-btn" onClick={onSwitchCamera} disabled={isScreenSharing} title="Switch camera">
          <FiRefreshCw size={24} />
          <span className="control-label">Switch</span>
        </button>
      )}

      <button
        className="control-btn end-call"
        onClick={onEndCall}
        title="End call"
      >
        <FiPhone size={24} />
        <span className="control-label">End Call</span>
      </button>
    </div>
  );
};

export default CallControls;
