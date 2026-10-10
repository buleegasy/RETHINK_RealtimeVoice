import { useAuthStore } from '../../store/authStore';
import { useModeStore } from '../../store/modeStore';
import { apiFetch } from '../../lib/api';

export async function ensureKioskAuthToken(): Promise<{ token: string | null; user: any }> {
  let currentToken = useAuthStore.getState().token;
  let currentUser = useAuthStore.getState().user;
  if (!currentToken) {
    try {
      const deviceId =
        useModeStore.getState().runMode === 'test' ? 'telemetry-test-bench' : 'kiosk-booth-01';
      const res = await apiFetch('/api/auth/kiosk-login', {
        method: 'POST',
        body: JSON.stringify({ deviceId }),
      });
      const data = await res.json();
      if (data.success && data.user && data.token) {
        useAuthStore.getState().login(data.user, data.token);
        currentToken = data.token;
        currentUser = data.user;
      }
    } catch (authErr) {
      console.warn('[VoiceSession] 自动获取访客 Token 失败:', authErr);
    }
  }
  return { token: currentToken, user: currentUser };
}
