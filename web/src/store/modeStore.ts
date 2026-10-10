import { create } from 'zustand';
import type { AppRunMode, KioskConfig, ConsultationHistoryRecord } from '../types';

interface ModeState {
  runMode: AppRunMode;
  kioskConfig: KioskConfig;
  historyRecords: ConsultationHistoryRecord[];
  isHistoryDrawerOpen: boolean;

  setRunMode: (mode: AppRunMode) => void;
  updateKioskConfig: (config: Partial<KioskConfig>) => void;
  toggleEInkMode: () => void;
  addHistoryRecord: (record: ConsultationHistoryRecord) => void;
  clearHistoryRecords: () => void;
  setHistoryDrawerOpen: (open: boolean) => void;
}

const safeGetItem = (key: string): string | null => {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
};

const safeSetItem = (key: string, value: string): void => {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      localStorage.setItem(key, value);
    }
  } catch {}
};

const detectInitialMode = (): { mode: AppRunMode; deviceId: string } => {
  if (typeof window === 'undefined') {
    return { mode: 'web', deviceId: 'kiosk-booth-01' };
  }

  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  const deviceParam = params.get('device');
  const pathname = (window.location.pathname || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();

  // 1. 优先通过显式 URL 参数、路径名或 Hash 锚点判定
  if (
    modeParam === 'admin' ||
    modeParam === 'teacher' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/teacher') ||
    hash.startsWith('#admin') ||
    hash.startsWith('#/admin') ||
    hash.startsWith('#teacher') ||
    hash.startsWith('#/teacher')
  ) {
    return { mode: 'admin', deviceId: 'kiosk-booth-01' };
  }

  if (
    modeParam === 'test' ||
    modeParam === 'debug' ||
    modeParam === 'telemetry' ||
    pathname.startsWith('/test') ||
    pathname.startsWith('/telemetry') ||
    hash.startsWith('#test') ||
    hash.startsWith('#/test')
  ) {
    return { mode: 'test', deviceId: 'telemetry-test-bench' };
  }

  if (
    modeParam === 'kiosk' ||
    deviceParam ||
    pathname.startsWith('/kiosk') ||
    hash.startsWith('#kiosk') ||
    hash.startsWith('#/kiosk')
  ) {
    return {
      mode: 'kiosk',
      deviceId: deviceParam || 'kiosk-booth-01',
    };
  }

  if (modeParam === 'web') {
    return { mode: 'web', deviceId: 'kiosk-booth-01' };
  }

  const storedMode = safeGetItem('rethink_run_mode') as AppRunMode | null;
  const storedDevice = safeGetItem('rethink_kiosk_device') || 'kiosk-booth-01';
  const hasAuthToken = !!safeGetItem('rethink_auth_token');

  let effectiveMode: AppRunMode = 'web';
  if (storedMode === 'admin') {
    effectiveMode = 'admin';
  } else if (storedMode === 'test') {
    effectiveMode = 'test';
  } else if (storedMode === 'kiosk' && hasAuthToken) {
    effectiveMode = 'kiosk';
  }

  return {
    mode: effectiveMode,
    deviceId: storedDevice,
  };
};

const getStoredHistory = (): ConsultationHistoryRecord[] => {
  const raw = safeGetItem('rethink_user_history');
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const initialInfo = detectInitialMode();

export const useModeStore = create<ModeState>((set) => ({
  runMode: initialInfo.mode,
  kioskConfig: {
    deviceId: initialInfo.deviceId,
    locationName: '校园心理驿站 #01',
    autoResetSeconds: 30,
    silenceTimeoutSeconds: 120,
    eInkHighContrast: false,
    hardwareKeyboardEnabled: true,
  },
  historyRecords: getStoredHistory(),
  isHistoryDrawerOpen: false,

  setRunMode: (mode) => {
    if (mode === 'web') {
      try {
        if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
          localStorage.removeItem('rethink_run_mode');
        }
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.delete('mode');
          window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }
      } catch {}
    } else {
      safeSetItem('rethink_run_mode', mode);
      try {
        if (typeof window !== 'undefined' && window.history?.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.set('mode', mode);
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      } catch {}
    }
    set({ runMode: mode });
  },

  updateKioskConfig: (patch) =>
    set((state) => {
      const updated = { ...state.kioskConfig, ...patch };
      if (patch.deviceId) {
        safeSetItem('rethink_kiosk_device', patch.deviceId);
      }
      return { kioskConfig: updated };
    }),

  toggleEInkMode: () =>
    set((state) => ({
      kioskConfig: {
        ...state.kioskConfig,
        eInkHighContrast: !state.kioskConfig.eInkHighContrast,
      },
    })),

  addHistoryRecord: (record) =>
    set((state) => {
      const updated = [record, ...state.historyRecords].slice(0, 20);
      safeSetItem('rethink_user_history', JSON.stringify(updated));
      return { historyRecords: updated };
    }),

  clearHistoryRecords: () => {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem('rethink_user_history');
      }
    } catch {}
    set({ historyRecords: [] });
  },

  setHistoryDrawerOpen: (open) => set({ isHistoryDrawerOpen: open }),
}));
