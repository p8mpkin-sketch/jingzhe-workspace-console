import { useEffect } from 'react';
import { listDevices } from '@/services/pentestService';
import { usePentest } from '@/stores/pentest';

/**
 * The single 8 s device poll of the app. It writes the shared `usePentest.devices` value that the rail entry,
 * the device flyout and the workbench read; nothing else polls the device list for the shell.
 * (Until V3 this lived in the top bar next to a device pill; the pill is gone, the poll is unchanged.)
 */
export function useDevicePoll(): void {
  useEffect(() => {
    let dead = false;
    const poll = async () => {
      try {
        const ds = await listDevices(true);
        if (!dead) usePentest.getState().setDevices(Array.isArray(ds) ? ds : []);
      } catch { /* silent: the rail keeps the last known list */ }
    };
    poll();
    const t = setInterval(poll, 8000);
    return () => { dead = true; clearInterval(t); };
  }, []);
}
