import { create } from 'zustand';
import type {
  BoothHookState,
  VoiceSessionStatus,
  DuplexPhase,
  CBTStage,
  DialogueTurn,
  SanitizedCbtReport,
} from '../types';

export type HookState = BoothHookState;
export type SessionStatus = VoiceSessionStatus;
export type { DuplexPhase, CBTStage, BoothHookState, VoiceSessionStatus };

export interface BoothState {
  hookState: BoothHookState;
  sessionStatus: VoiceSessionStatus;
  duplexPhase: DuplexPhase;
  cbtStage: CBTStage;
  dialDigits: string;
  isMuted: boolean;
  callDuration: number;
  audioLevel: number;
  activeTranscript: { user: string; assistant: string };
  dialogueHistory: DialogueTurn[];
  latestReport: SanitizedCbtReport | null;
  isReportModalOpen: boolean;
  isCrisisOverlayOpen: boolean;
  errorMessage: string | null;

  setHookState: (state: BoothHookState) => void;
  setSessionStatus: (status: VoiceSessionStatus) => void;
  setDuplexPhase: (phase: DuplexPhase) => void;
  setCBTStage: (stage: CBTStage) => void;
  appendDialDigit: (digit: string) => void;
  clearDialDigits: () => void;
  setIsMuted: (isMuted: boolean) => void;
  setAudioLevel: (level: number) => void;
  setActiveTranscript: (
    transcript:
      | { user?: string; assistant?: string }
      | ((prev: { user: string; assistant: string }) => { user: string; assistant: string }),
  ) => void;
  addDialogueTurn: (turn: DialogueTurn) => void;
  setLatestReport: (report: SanitizedCbtReport | null) => void;
  setReportModalOpen: (open: boolean) => void;
  setCrisisOverlayOpen: (open: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setCallDuration: (duration: number | ((prev: number) => number)) => void;
  resetBooth: () => void;
}

const initialState = {
  hookState: 'on_hook' as BoothHookState,
  sessionStatus: 'idle' as VoiceSessionStatus,
  duplexPhase: 'idle' as DuplexPhase,
  cbtStage: 'Active_Listening' as CBTStage,
  dialDigits: '',
  isMuted: false,
  callDuration: 0,
  audioLevel: 0,
  activeTranscript: { user: '', assistant: '' },
  dialogueHistory: [] as DialogueTurn[],
  latestReport: null as SanitizedCbtReport | null,
  isReportModalOpen: false,
  isCrisisOverlayOpen: false,
  errorMessage: null as string | null,
};

export const useBoothStore = create<BoothState>((set) => ({
  ...initialState,

  setHookState: (hookState) => set({ hookState }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setDuplexPhase: (duplexPhase) => set({ duplexPhase }),
  setCBTStage: (cbtStage) => set({ cbtStage }),
  appendDialDigit: (digit) =>
    set((state) => ({ dialDigits: (state.dialDigits + digit).slice(-12) })),
  clearDialDigits: () => set({ dialDigits: '' }),
  setIsMuted: (isMuted) => set({ isMuted }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  setActiveTranscript: (transcript) =>
    set((state) => ({
      activeTranscript:
        typeof transcript === 'function'
          ? transcript(state.activeTranscript)
          : { ...state.activeTranscript, ...transcript },
    })),
  addDialogueTurn: (turn) =>
    set((state) => {
      const existingIdx = state.dialogueHistory.findIndex((t) => t.id === turn.id);
      let list: DialogueTurn[];
      if (existingIdx >= 0) {
        list = [...state.dialogueHistory];
        list[existingIdx] = turn;
      } else {
        list = [...state.dialogueHistory, turn];
      }
      const updated = list.sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        if (a.role === 'user' && b.role !== 'user') return -1;
        if (a.role !== 'user' && b.role === 'user') return 1;
        return 0;
      });
      return { dialogueHistory: updated };
    }),
  setLatestReport: (latestReport) => set({ latestReport }),
  setReportModalOpen: (isReportModalOpen) => set({ isReportModalOpen }),
  setCrisisOverlayOpen: (isCrisisOverlayOpen) => set({ isCrisisOverlayOpen }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setCallDuration: (duration) =>
    set((state) => ({
      callDuration: typeof duration === 'function' ? duration(state.callDuration) : duration,
    })),
  resetBooth: () => set(initialState),
}));
