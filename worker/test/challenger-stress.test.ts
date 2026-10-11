import { describe, it, expect, beforeEach } from 'vitest';
import { CbtStateMachine } from '../src/lib/cbt-fsm';

/**
 * Challenger 1: CBT 状态机情绪锁定与推进控制测试
 */
describe('Challenger 1: CBT 状态机情绪极性锁定与推进控制测试', () => {
  let fsm: CbtStateMachine;

  beforeEach(() => {
    fsm = new CbtStateMachine();
  });

  it('[PASS] 负向情绪效价阈值精确判决: valence < -0.3 严格锁定，valence >= -0.3 不锁定', () => {
    // 边界测试：-0.301 必须锁定
    fsm.setEmotionalValence(-0.301);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    // 边界测试：-0.300 处于阈值边界（不小于 -0.3，不锁定）
    fsm.setEmotionalValence(-0.3);
    expect(fsm.isEmotionallyLocked()).toBe(false);

    // 负向情绪深层锁定
    fsm.setEmotionalValence(-0.8);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    // 正向情绪不锁定
    fsm.setEmotionalValence(0.5);
    expect(fsm.isEmotionallyLocked()).toBe(false);

    // recordTurn 传入 NaN 或 undefined 时应安全忽略，保持先前的效价
    fsm.setEmotionalValence(-0.5);
    fsm.recordTurn({ role: 'user', emotionalValence: NaN });
    expect(fsm.getEmotionalValence()).toBe(-0.5);
    expect(fsm.isEmotionallyLocked()).toBe(true);
  });

  it('[PASS] 情绪锁定下禁止手动推进至 CBT_Stripping', () => {
    fsm.setEmotionalValence(-0.5);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    const res = fsm.transition('CBT_Stripping');
    expect(res.success).toBe(false);
    expect(res.stage).toBe('Active_Listening');
    expect(res.reason).toContain('情绪锁定保护');
    expect(fsm.getStage()).toBe('Active_Listening');
  });

  it('[PASS] 情绪锁定下尝试越级跳至 Socratic_Questioning 严禁自愈校正推进至 CBT_Stripping', () => {
    fsm.setEmotionalValence(-0.6);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    const res = fsm.transition('Socratic_Questioning');
    expect(res.success).toBe(false);
    expect(res.stage).toBe('Active_Listening');
    expect(res.reason).toContain('情绪锁定保护');
    expect(fsm.getStage()).toBe('Active_Listening');
  });

  it('[PASS] 情绪锁定下停滞看门狗 (Auto-Pacing) 绝对禁止自动推进阶段', () => {
    // 模拟多轮对话，且认知暴露度拉满 (1.0)
    for (let i = 0; i < 20; i++) {
      const turnRes = fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.7,
        cognitiveExposure: 1.0,
      });
      expect(turnRes.autoPromotedStage).toBeNull();
      expect(fsm.getStage()).toBe('Active_Listening');
    }

    expect(fsm.getTurnsInCurrentStage()).toBe(20);
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.isEmotionallyLocked()).toBe(true);
  });

  it('[PASS] 情绪好转回升至 -0.3 以上且达到暴露门槛后，看门狗自适应平滑解锁并推进', () => {
    // 初始极度负向锁定
    fsm.recordTurn({
      role: 'user',
      emotionalValence: -0.6,
      cognitiveExposure: 0.1,
    });
    expect(fsm.isEmotionallyLocked()).toBe(true);

    // 对话 4 轮，情绪逐步缓解，暴露度上升，尚未达到 maxTurns (6)
    for (let i = 0; i < 4; i++) {
      const midTurn = fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.1, // 恢复到安全情绪
        cognitiveExposure: 0.5,
      });
      expect(midTurn.autoPromotedStage).toBeNull();
      expect(fsm.getStage()).toBe('Active_Listening');
    }

    // 第 6 轮达到 activeListeningMaxTurns (6) 且 cognitiveExposure >= 0.4
    const nextTurn = fsm.recordTurn({
      role: 'user',
      emotionalValence: 0.0,
      cognitiveExposure: 0.6,
    });

    expect(fsm.isEmotionallyLocked()).toBe(false);
    expect(nextTurn.autoPromotedStage).toBe('CBT_Stripping');
    expect(fsm.getStage()).toBe('CBT_Stripping');
  });

  it('[PASS] 情绪锁定期间依然保持安全危机熔断最高优先级 (Crisis Escalation is ALWAYS allowed)', () => {
    fsm.setEmotionalValence(-0.9);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    // 无论情绪多么负向，安全危机升级必须无条件立即成功
    const crisisRes = fsm.escalateCrisis('检测到用户准备自残');
    expect(crisisRes).toBe('Crisis_Escalation');
    expect(fsm.isCrisis()).toBe(true);
    expect(fsm.getStage()).toBe('Crisis_Escalation');
  });
});
