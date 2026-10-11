import { describe, it, expect } from 'vitest';
import { CbtStateMachine } from '../src/lib/cbt-fsm';

/**
 * Challenger 1 (Emotion Challenger)
 * 对抗性压力测试套件：深度验证 CBT 情绪自适应状态机
 */

describe('Challenger 1: CBT 有限状态机情绪驱动与抗压基准测试', () => {
  it('[FSM-ADV-01] 强负向情绪序列 (valence < -0.3) 持续 20 轮：强制锁定 Active_Listening，禁止任何盲推与跃迁', () => {
    const fsm = new CbtStateMachine();
    expect(fsm.getStage()).toBe('Active_Listening');

    // 注入 20 轮随机负向效价序列 ([-1.0, -0.31])
    const pseudoRandomValences = [
      -0.65, -0.42, -0.88, -0.35, -0.92, -0.55, -0.71, -0.39, -0.6, -0.82, -0.45, -0.77, -0.33,
      -0.99, -0.58, -0.63, -0.81, -0.48, -0.73, -0.37,
    ];

    for (let turn = 0; turn < 20; turn++) {
      const valence = pseudoRandomValences[turn];
      const turnRes = fsm.recordTurn({
        role: turn % 2 === 0 ? 'user' : 'assistant',
        emotionalValence: valence,
        cognitiveExposure: 0.99, // 即使认知暴露度达到极高值 0.99
      });

      // 验证状态机看门狗绝不自动推进
      expect(turnRes.autoPromotedStage).toBeNull();
      expect(fsm.getStage()).toBe('Active_Listening');
      expect(fsm.isEmotionallyLocked()).toBe(true);

      // 手动跃迁 CBT_Stripping 必遭拦截
      const manualStripping = fsm.transition('CBT_Stripping');
      expect(manualStripping.success).toBe(false);
      expect(manualStripping.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');

      // 越级跃迁 Socratic_Questioning 必遭拦截，且绝不发生自愈平滑错误推进
      const manualSocratic = fsm.transition('Socratic_Questioning');
      expect(manualSocratic.success).toBe(false);
      expect(manualSocratic.reason).toContain('情绪锁定保护');
      expect(fsm.getStage()).toBe('Active_Listening');
    }

    expect(fsm.getTurnsInCurrentStage()).toBe(20);
    expect(fsm.getTotalTurns()).toBe(20);
  });

  it('[FSM-ADV-02] 情绪恢复但认知暴露度不足 (< 0.4)：严格阻断自动推进', () => {
    const fsm = new CbtStateMachine();

    // 经历 6 轮低情绪对话
    for (let i = 0; i < 6; i++) {
      fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.7,
        cognitiveExposure: 0.1,
      });
    }
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.getTurnsInCurrentStage()).toBe(6);

    // 情绪效价回升至安全区间 (-0.15 > -0.3)，但暴露度仅为 0.35 (< 0.4)
    const turnRes = fsm.recordTurn({
      role: 'user',
      emotionalValence: -0.15,
      cognitiveExposure: 0.35,
    });

    // 认知暴露不达标，看门狗禁止推进
    expect(turnRes.autoPromotedStage).toBeNull();
    expect(fsm.getStage()).toBe('Active_Listening');
    expect(fsm.isEmotionallyLocked()).toBe(false);
  });

  it('[FSM-ADV-03] 情绪平稳 (valence >= -0.3) 且认知暴露度充分 (>= 0.4)：自适应推进至 CBT_Stripping', () => {
    const fsm = new CbtStateMachine();

    // 前置经历 5 轮对话
    for (let i = 0; i < 5; i++) {
      fsm.recordTurn({
        role: 'user',
        emotionalValence: -0.1,
        cognitiveExposure: 0.3,
      });
    }
    expect(fsm.getStage()).toBe('Active_Listening');

    // 第 6 轮达到 activeListeningMaxTurns (6) 且 exposure 达到 0.5 (>= 0.4)
    const turnRes = fsm.recordTurn({
      role: 'user',
      emotionalValence: -0.05,
      cognitiveExposure: 0.5,
    });

    expect(turnRes.autoPromotedStage).toBe('CBT_Stripping');
    expect(fsm.getStage()).toBe('CBT_Stripping');
    expect(fsm.getTurnsInCurrentStage()).toBe(0);
  });

  it('[FSM-ADV-04] 边界极值测试：valence = -0.30001 (锁定) vs -0.29999 (解脱)', () => {
    const fsmLocked = new CbtStateMachine();
    fsmLocked.setEmotionalValence(-0.30001);
    expect(fsmLocked.isEmotionallyLocked()).toBe(true);

    const fsmUnlocked = new CbtStateMachine();
    fsmUnlocked.setEmotionalValence(-0.29999);
    expect(fsmUnlocked.isEmotionallyLocked()).toBe(false);
  });

  it('[FSM-ADV-05] 危机熔断终态 (Sink State)：情绪锁定下 escalateCrisis 立即生效且永远不可逆', () => {
    const fsm = new CbtStateMachine();
    fsm.setEmotionalValence(-0.95);
    expect(fsm.isEmotionallyLocked()).toBe(true);

    const escalated = fsm.escalateCrisis('现场阻抗自杀');
    expect(escalated).toBe('Crisis_Escalation');
    expect(fsm.isCrisis()).toBe(true);
    expect(fsm.getStage()).toBe('Crisis_Escalation');

    // 任何常规降级指令必被拒绝
    expect(fsm.transition('Active_Listening').success).toBe(false);
    expect(fsm.transition('CBT_Stripping').success).toBe(false);
    expect(fsm.transition('Socratic_Questioning').success).toBe(false);
    expect(fsm.checkAutoPacing()).toBeNull();
    expect(fsm.getStage()).toBe('Crisis_Escalation');
  });
});
