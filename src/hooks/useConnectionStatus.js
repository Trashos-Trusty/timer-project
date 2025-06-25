import { useState, useEffect } from 'react';
import connectionManager from '../utils/ConnectionManager';

const useConnectionStatus = () => {
  const [status, setStatus] = useState(() => connectionManager.getStatus());

  useEffect(() => {
    const unsubscribe = connectionManager.addListener(() => {
      setStatus(connectionManager.getStatus());
    });

    return unsubscribe;
  }, []);

  const forceCheck = () => {
    connectionManager.forceCheck();
  };

  return {
    ...status,
    forceCheck
  };
};

export default useConnectionStatus; 