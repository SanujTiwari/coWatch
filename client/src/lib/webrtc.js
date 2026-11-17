export const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const createPeerConnection = (iceServers = DEFAULT_ICE_SERVERS) => {
  return new RTCPeerConnection({ iceServers });
};

export const getUserMedia = async (constraints = { video: true, audio: true }) => {
  return await navigator.mediaDevices.getUserMedia(constraints);
};

export const getDisplayMedia = async () => {
  return await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
};

/**
 * Fetch TURN credentials from the backend.
 * TURN credentials are short-lived and never exposed in frontend source code.
 */
export const fetchIceServers = async (apiBaseUrl = 'http://localhost:5000', token) => {
  const res = await fetch(`${apiBaseUrl}/api/turn/credentials`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Unable to obtain call server configuration.');
  const data = await res.json();
  if (!Array.isArray(data.iceServers)) throw new Error('Invalid call server configuration.');
  return data.iceServers;
};
