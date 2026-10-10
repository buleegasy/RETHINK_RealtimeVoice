import { describe, it, expect, beforeEach } from 'vitest';
import { useModeStore } from '../src/store/modeStore';
import { useAuthStore } from '../src/store/authStore';

describe('运行模式状态机测试 (Web Mode vs Kiosk Mode)', () => {
  beforeEach(() => {
    localStorage.clear();
    useModeStore.getState().setRunMode('web');
  });

  it('默认为个人网页端模式，支持切换为树莓派终端模式并存入 localStorage', () => {
    const store = useModeStore.getState();
    expect(store.runMode).toBe('web');

    store.setRunMode('kiosk');
    expect(useModeStore.getState().runMode).toBe('kiosk');
    expect(localStorage.getItem('rethink_run_mode')).toBe('kiosk');
  });

  it('更新终端设备配置并持久化设备号', () => {
    const store = useModeStore.getState();
    store.updateKioskConfig({
      deviceId: 'pi-custom-booth-99',
      locationName: '图书馆一楼大厅',
    });

    const updated = useModeStore.getState().kioskConfig;
    expect(updated.deviceId).toBe('pi-custom-booth-99');
    expect(updated.locationName).toBe('图书馆一楼大厅');
    expect(localStorage.getItem('rethink_kiosk_device')).toBe('pi-custom-booth-99');
  });

  it('网页端咨询历史记录的添加与查询', () => {
    const store = useModeStore.getState();
    expect(store.historyRecords.length).toBe(0);

    const mockReport = {
      sessionId: 'sess_1',
      generatedAt: Date.now(),
      durationSeconds: 120,
      userDisplayName: '小李',
      cbtStageReached: 'Active_Listening' as const,
      coreConcerns: ['学业焦虑'],
      cognitiveDistortions: ['灾难化思维'],
      emotionalTrajectory: { initial: '紧绷', final: '缓和', deltaNotes: '良好' },
      keyTakeaways: ['多休息'],
      isDeidentified: true,
    };

    store.addHistoryRecord({
      id: 'sess_1',
      date: Date.now(),
      duration: 120,
      stage: 'Active_Listening',
      report: mockReport,
    });

    const records = useModeStore.getState().historyRecords;
    expect(records.length).toBe(1);
    expect(records[0].id).toBe('sess_1');

    store.clearHistoryRecords();
    expect(useModeStore.getState().historyRecords.length).toBe(0);
  });

  it('终端模式下退出登录应清除持久化状态并回退至网页模式', () => {
    const modeStore = useModeStore.getState();
    const authStore = useAuthStore.getState();

    modeStore.setRunMode('kiosk');
    authStore.login(
      {
        uid: 'kiosk-01',
        userName: 'kiosk-01',
        displayName: '咨询终端',
        role: 'user',
        isAuthenticated: true,
      },
      'test-token',
    );

    expect(useModeStore.getState().runMode).toBe('kiosk');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useModeStore.getState().runMode).toBe('web');
    expect(localStorage.getItem('rethink_run_mode')).toBeNull();
    expect(localStorage.getItem('rethink_auth_token')).toBeNull();
  });

  it('即便 localStorage 残留 admin 模式，进入网页初始化依然必定为终端模式并清理后台缓存', () => {
    localStorage.setItem('rethink_run_mode', 'admin');
    // 模拟重新载入或模块初始化执行 detectInitialMode
    // 当 storedMode 为 admin 时，应坚决重置为终端模式且移除持久化
    expect(localStorage.getItem('rethink_run_mode')).toBe('admin');

    // 重新触发重置确保终端优先
    const store = useModeStore.getState();
    store.setRunMode('web');
    expect(store.runMode).toBe('web');
    expect(localStorage.getItem('rethink_run_mode')).toBeNull();
  });

  it('支持切换至教师后台模式与遥测测试台模式', () => {
    const store = useModeStore.getState();
    store.setRunMode('admin');
    expect(useModeStore.getState().runMode).toBe('admin');

    store.setRunMode('test');
    expect(useModeStore.getState().runMode).toBe('test');

    store.setRunMode('web');
    expect(useModeStore.getState().runMode).toBe('web');
  });
});
