export function bindDeviceWatcher(onDeviceChange: () => void): (() => void) | null {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    try {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
      return onDeviceChange;
    } catch {}
  }
  return null;
}

export function unbindDeviceWatcher(listener: (() => void) | null): void {
  if (listener && typeof navigator !== 'undefined' && navigator.mediaDevices) {
    try {
      navigator.mediaDevices.removeEventListener('devicechange', listener);
    } catch {}
  }
}
