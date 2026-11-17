import { useEffect, useState } from 'react';

const CallDuration = ({ startedAt }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return <span>{hours ? `${hours}:` : ''}{String(minutes).padStart(2, '0')}:{String(remainder).padStart(2, '0')}</span>;
};

export default CallDuration;
