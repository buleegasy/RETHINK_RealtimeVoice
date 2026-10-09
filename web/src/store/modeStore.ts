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

  if (modeParam === 'admin' || modeParam === 'teacher') {
    return { mode: 'admin', deviceId: 'kiosk-booth-01' };
  }

  if (modeParam === 'kiosk' || deviceParam) {
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

  // 严禁将 admin 作为进入网页的持久化恢复模式，确保每次进入网页都是终端而不是后台面板
  if (storedMode === 'admin') {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem('rethink_run_mode');
      }
    } catch {}
  }

  let effectiveMode: AppRunMode = 'web';
  if (storedMode === 'kiosk' && hasAuthToken) {
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
      } catch {}
    } else {
      safeSetItem('rethink_run_mode', mode);
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
