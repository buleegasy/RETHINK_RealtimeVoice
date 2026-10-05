import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTelephoneBooth } from '../src/hooks/useTelephoneBooth';
import { useBoothStore } from '../src/store/boothStore';

describe('useTelephoneBooth 物理键盘事件监听与管理后台隔离测试', () => {
  beforeEach(() => {
    useBoothStore.setState({ hookState: 'on_hook' });
  });

  it('普通模式 (enabled: true): 敲击 Space 或 Enter 应触发 onPickUp 并切换摘机', () => {
    const onPickUp = vi.fn();
    const onHangUp = vi.fn();
    const onInterrupt = vi.fn();
    const onToggleMute = vi.fn();

    renderHook(() =>
      useTelephoneBooth({
        enabled: true,
        onPickUp,
        onHangUp,
        onInterrupt,
        onToggleMute,
      }),
    );

    act(() => {
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      window.dispatchEvent(event);
    });

    expect(onPickUp).toHaveBeenCalledTimes(1);
    expect(onHangUp).not.toHaveBeenCalled();
  });

  it('普通模式 (enabled: true): 聚焦在输入框 INPUT/TEXTAREA 时 Space/Enter 不触发摘机', () => {
    const onPickUp = vi.fn();
    const onHangUp = vi.fn();

    renderHook(() =>
      useTelephoneBooth({
        enabled: true,
        onPickUp,
        onHangUp,
        onInterrupt: vi.fn(),
        onToggleMute: vi.fn(),
      }),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      Object.defineProperty(event, 'target', { value: input });
      window.dispatchEvent(event);
    });

    expect(onPickUp).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('普通模式 (enabled: true): 聚焦在 BUTTON 或 A 链接时 Space/Enter 不触发摘机 (P3-13 修复验证)', () => {
    const onPickUp = vi.fn();

    renderHook(() =>
      useTelephoneBooth({
        enabled: true,
        onPickUp,
        onHangUp: vi.fn(),
        onInterrupt: vi.fn(),
        onToggleMute: vi.fn(),
      }),
    );

    const button = document.createElement('button');
    document.body.appendChild(button);

    act(() => {
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      Object.defineProperty(event, 'target', { value: button });
      window.dispatchEvent(event);
    });

    expect(onPickUp).not.toHaveBeenCalled();
    document.body.removeChild(button);
  });

  it('教师管理后台模式 (enabled: false): 按压 Space/Enter 严禁触发拨号摘机与麦克风占用', () => {
    const onPickUp = vi.fn();
    const onHangUp = vi.fn();
    const onInterrupt = vi.fn();
    const onToggleMute = vi.fn();

    renderHook(() =>
      useTelephoneBooth({
        enabled: false, // 模拟 runMode === 'admin'
        onPickUp,
        onHangUp,
        onInterrupt,
        onToggleMute,
      }),
    );

    // 1. 在非输入元素（如表格卡片或页面空白处）敲击空格
    act(() => {
      const spaceEvent = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      window.dispatchEvent(spaceEvent);
    });
    expect(onPickUp).not.toHaveBeenCalled();

    // 2. 敲击回车
    act(() => {
      const enterEvent = new KeyboardEvent('keydown', { code: 'Enter', bubbles: true });
      window.dispatchEvent(enterEvent);
    });
    expect(onPickUp).not.toHaveBeenCalled();

    // 3. 敲击 Esc 和 KeyM
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));
    });
    expect(onInterrupt).not.toHaveBeenCalled();
    expect(onToggleMute).not.toHaveBeenCalled();
  });

  it('动态模式切换: 当从 admin 切换至 kiosk/web 时，键盘事件监听自适应重新激活', () => {
    const onPickUp = vi.fn();
    let isEnabled = false;

    const { rerender } = renderHook(
      ({ enabled }) =>
        useTelephoneBooth({
          enabled,
          onPickUp,
          onHangUp: vi.fn(),
          onInterrupt: vi.fn(),
          onToggleMute: vi.fn(),
        }),
      {
        initialProps: { enabled: isEnabled },
      },
    );

    // 处于 admin 模式，按空格无反应
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });
    expect(onPickUp).not.toHaveBeenCalled();

    // 切换至非 admin 模式
    rerender({ enabled: true });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    });
    expect(onPickUp).toHaveBeenCalledTimes(1);
  });
});
