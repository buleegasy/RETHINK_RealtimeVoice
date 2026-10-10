/**
 * @rethink/shared
 * 跨端共享核心模型与 CBT 有限状态机 (CbtStateMachine)
 */

export type CBTStage =
  | 'Pre_Info_Collection'
  | 'Active_Listening'
  | 'CBT_Stripping'
  | 'Socratic_Questioning'
  | 'Crisis_Escalation';

export interface CbtTransitionRecord {
  from: CBTStage;
  to: CBTStage;
  turn: number;
  timestamp: number;
  reason?: string;
}

export interface CbtTransitionResult {
  success: boolean;
  stage: CBTStage;
  previousStage: CBTStage;
  reason?: string;
  isOscillationBlocked?: boolean;
}

export interface CbtTurnInput {
  role: 'user' | 'assistant';
  emotionalValence?: number;
  cognitiveExposure?: number;
}

export interface CbtFsmConfig {
  initialStage?: CBTStage;
  minDwellTurns?: number;
  oscillationWindowSize?: number;
  oscillationThreshold?: number;
  oscillationCooldownTurns?: number;
  activeListeningMaxTurns?: number;
  strippingMaxTurns?: number;
  negativeValenceThreshold?: number;
  minCognitiveExposureForStripping?: number;
  minCognitiveExposureForSocratic?: number;
  exposureIncrementPerTurn?: number;
}

const DEFAULT_CONFIG: Required<CbtFsmConfig> = {
  initialStage: 'Active_Listening',
  minDwellTurns: 2,
  oscillationWindowSize: 6,
  oscillationThreshold: 2,
  oscillationCooldownTurns: 3,
  activeListeningMaxTurns: 6,
  strippingMaxTurns: 7,
  negativeValenceThreshold: -0.3,
  minCognitiveExposureForStripping: 0.4,
  minCognitiveExposureForSocratic: 0.7,
  exposureIncrementPerTurn: 0.1,
};

export class CbtStateMachine {
  private currentStage: CBTStage;
  private turnsInCurrentStage: number = 0;
  private totalTurns: number = 0;
  private fallbackCooldown: number = 0;
  private currentEmotionalValence: number = 0.0;
  private cognitiveExposure: number = 0.0;
  private readonly config: Required<CbtFsmConfig>;
  private readonly history: CbtTransitionRecord[] = [];

  constructor(config?: CbtFsmConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentStage = this.config.initialStage;
  }

  public getStage(): CBTStage {
    return this.currentStage;
  }

  public getTurnsInCurrentStage(): number {
    return this.turnsInCurrentStage;
  }

  public getTotalTurns(): number {
    return this.totalTurns;
  }

  public isCrisis(): boolean {
    return this.currentStage === 'Crisis_Escalation';
  }

  public getHistory(): readonly CbtTransitionRecord[] {
    return this.history;
  }

  public getEmotionalValence(): number {
    return this.currentEmotionalValence;
  }

  public setEmotionalValence(val: number): void {
    this.currentEmotionalValence = Math.max(-1.0, Math.min(1.0, val));
  }

  public getCognitiveExposure(): number {
    return this.cognitiveExposure;
  }

  public setCognitiveExposure(val: number): void {
    this.cognitiveExposure = Math.max(0.0, Math.min(1.0, val));
  }

  public isEmotionallyLocked(): boolean {
    return (
      this.currentStage === 'Active_Listening' &&
      this.currentEmotionalValence < this.config.negativeValenceThreshold
    );
  }

  public canTransition(targetStage: CBTStage): { allowed: boolean; reason?: string } {
    if (this.currentStage === 'Crisis_Escalation') {
      return {
        allowed: false,
        reason: '当前已进入 Crisis_Escalation 单向危机吸收终态，普通指令禁止降级',
      };
    }

    if (targetStage === this.currentStage) {
      return { allowed: true, reason: '维持当前阶段' };
    }

    if (targetStage === 'Crisis_Escalation') {
      return { allowed: true, reason: '安全危机熔断触发升级' };
    }

    // 强负向情绪锁定保护：emotionalValence < -0.3 时锁定在 Active_Listening，禁止推进至 ABC 剥离或认知重构
    if (
      (targetStage === 'CBT_Stripping' || targetStage === 'Socratic_Questioning') &&
      this.currentEmotionalValence < this.config.negativeValenceThreshold
    ) {
      return {
        allowed: false,
        reason: `情绪锁定保护：当前情绪效价极度负向 (${this.currentEmotionalValence.toFixed(2)} < ${this.config.negativeValenceThreshold})，强制锁定积极倾听阶段，禁止过早推进 ABC 剥离或认知重构`,
      };
    }

    const isLegalForward = this.checkLegalForward(this.currentStage, targetStage);
    if (isLegalForward) {
      return { allowed: true };
    }

    const isLegalFallback = this.checkLegalFallback(this.currentStage, targetStage);
    if (isLegalFallback) {
      if (this.turnsInCurrentStage < this.config.minDwellTurns) {
        return {
          allowed: false,
          reason: `阶段滞后保护：当前阶段至少停留 ${this.config.minDwellTurns} 轮方可回退（已停留 ${this.turnsInCurrentStage} 轮）`,
        };
      }
      if (this.fallbackCooldown > 0) {
        return {
          allowed: false,
          reason: `防振荡冷却中：尚需经历 ${this.fallbackCooldown} 轮对话方可再次回退`,
        };
      }
      if (this.detectOscillation(targetStage)) {
        return {
          allowed: false,
          reason: '检测到状态往返循环震荡，已触发防活锁抑制锁定',
        };
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `非法状态跃迁：禁止从 ${this.currentStage} 直接跳转至 ${targetStage}`,
    };
  }

  public transition(targetStage: CBTStage, reason?: string): CbtTransitionResult {
    const prev = this.currentStage;

    if (targetStage === 'Crisis_Escalation') {
      this.currentStage = 'Crisis_Escalation';
      this.turnsInCurrentStage = 0;
      this.recordHistory(prev, 'Crisis_Escalation', reason || '危机升级熔断');
      return {
        success: true,
        stage: 'Crisis_Escalation',
        previousStage: prev,
        reason: '危机升级熔断',
      };
    }

    const check = this.canTransition(targetStage);
    if (!check.allowed) {
      const isOscillation = check.reason?.includes('震荡');
      if (isOscillation) {
        this.fallbackCooldown = this.config.oscillationCooldownTurns;
      }

      // 仅在非情绪阻断的普通非法跃迁场景下尝试越级平滑自愈
      if (
        prev === 'Active_Listening' &&
        targetStage === 'Socratic_Questioning' &&
        !check.reason?.includes('情绪锁定保护')
      ) {
        const autoCorrected: CBTStage = 'CBT_Stripping';
        this.currentStage = autoCorrected;
        this.turnsInCurrentStage = 0;
        this.recordHistory(prev, autoCorrected, '越级跃迁自愈校正');
        return {
          success: true,
          stage: autoCorrected,
          previousStage: prev,
          reason: '拦截越级跳转，自动平滑修正为 ABC 事实剥离阶段',
        };
      }

      return {
        success: false,
        stage: prev,
        previousStage: prev,
        reason: check.reason,
        isOscillationBlocked: isOscillation,
      };
    }

    if (targetStage === prev) {
      return {
        success: true,
        stage: prev,
        previousStage: prev,
        reason: '维持当前阶段',
      };
    }

    const isFallback = this.checkLegalFallback(prev, targetStage);
    this.currentStage = targetStage;
    this.turnsInCurrentStage = 0;

    if (isFallback) {
      this.fallbackCooldown = this.config.oscillationCooldownTurns;
    }

    this.recordHistory(prev, targetStage, reason);
    return {
      success: true,
      stage: targetStage,
      previousStage: prev,
      reason,
    };
  }

  public escalateCrisis(reason: string = '紧急安全熔断'): CBTStage {
    const prev = this.currentStage;
    this.currentStage = 'Crisis_Escalation';
    this.turnsInCurrentStage = 0;
    this.recordHistory(prev, 'Crisis_Escalation', reason);
    return 'Crisis_Escalation';
  }

  public recordTurn(
    turnInput: 'user' | 'assistant' | CbtTurnInput,
    maybeValence?: number,
    maybeExposure?: number,
  ): { autoPromotedStage: CBTStage | null } {
    let role: 'user' | 'assistant';
    let valence: number | undefined;
    let exposure: number | undefined;

    if (typeof turnInput === 'string') {
      role = turnInput;
      valence = maybeValence;
      exposure = maybeExposure;
    } else {
      role = turnInput.role;
      valence = turnInput.emotionalValence;
      exposure = turnInput.cognitiveExposure;
    }

    this.totalTurns++;
    this.turnsInCurrentStage++;

    if (typeof valence === 'number' && !Number.isNaN(valence)) {
      this.currentEmotionalValence = Math.max(-1.0, Math.min(1.0, valence));
    }

    if (typeof exposure === 'number' && !Number.isNaN(exposure)) {
      this.cognitiveExposure = Math.max(0.0, Math.min(1.0, exposure));
    } else {
      this.cognitiveExposure = Math.min(
        1.0,
        this.cognitiveExposure + this.config.exposureIncrementPerTurn,
      );
    }

    if (role === 'user' && this.fallbackCooldown > 0) {
      this.fallbackCooldown--;
    }

    const autoPromotion = this.checkAutoPacing();
    if (autoPromotion) {
      this.transition(autoPromotion, '自适应情绪与认知暴露看门狗推进');
      return { autoPromotedStage: autoPromotion };
    }

    return { autoPromotedStage: null };
  }

  public checkAutoPacing(): CBTStage | null {
    if (this.currentStage === 'Crisis_Escalation') return null;

    if (
      this.currentStage === 'Pre_Info_Collection' &&
      this.turnsInCurrentStage >= this.config.minDwellTurns
    ) {
      return 'Active_Listening';
    }

    // 情绪效价强烈负向时锁定在 Active_Listening，禁止推进
    if (this.currentEmotionalValence < this.config.negativeValenceThreshold) {
      return null;
    }

    // 情绪平稳且认知暴露度满足要求时方可推进
    if (
      this.currentStage === 'Active_Listening' &&
      this.turnsInCurrentStage >= this.config.activeListeningMaxTurns &&
      this.cognitiveExposure >= this.config.minCognitiveExposureForStripping
    ) {
      return 'CBT_Stripping';
    }

    if (
      this.currentStage === 'CBT_Stripping' &&
      this.turnsInCurrentStage >= this.config.strippingMaxTurns &&
      this.cognitiveExposure >= this.config.minCognitiveExposureForSocratic
    ) {
      return 'Socratic_Questioning';
    }

    return null;
  }

  public detectOscillation(candidateTarget?: CBTStage): boolean {
    const records = [...this.history];
    if (candidateTarget) {
      records.push({
        from: this.currentStage,
        to: candidateTarget,
        turn: this.totalTurns,
        timestamp: Date.now(),
      });
    }

    if (records.length < 4) return false;

    const recent = records.slice(-this.config.oscillationWindowSize);
    let pingPongCount = 0;

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if (prev.from === curr.to && prev.to === curr.from) {
        pingPongCount++;
      }
    }

    return pingPongCount >= this.config.oscillationThreshold;
  }

  public reset(initialStage?: CBTStage): void {
    this.currentStage = initialStage || this.config.initialStage;
    this.turnsInCurrentStage = 0;
    this.totalTurns = 0;
    this.fallbackCooldown = 0;
    this.currentEmotionalValence = 0.0;
    this.cognitiveExposure = 0.0;
    this.history.length = 0;
  }

  public getSnapshot() {
    return {
      stage: this.currentStage,
      turnsInStage: this.turnsInCurrentStage,
      totalTurns: this.totalTurns,
      fallbackCooldown: this.fallbackCooldown,
      isCrisis: this.isCrisis(),
      emotionalValence: this.currentEmotionalValence,
      cognitiveExposure: this.cognitiveExposure,
      isEmotionallyLocked: this.isEmotionallyLocked(),
    };
  }

  private checkLegalForward(from: CBTStage, to: CBTStage): boolean {
    if (from === 'Pre_Info_Collection' && to === 'Active_Listening') return true;
    if (from === 'Active_Listening' && to === 'CBT_Stripping') return true;
    if (from === 'CBT_Stripping' && to === 'Socratic_Questioning') return true;
    return false;
  }

  private checkLegalFallback(from: CBTStage, to: CBTStage): boolean {
    if (from === 'CBT_Stripping' && to === 'Active_Listening') return true;
    if (from === 'Socratic_Questioning' && to === 'CBT_Stripping') return true;
    return false;
  }

  private recordHistory(from: CBTStage, to: CBTStage, reason?: string): void {
    this.history.push({
      from,
      to,
      turn: this.totalTurns,
      timestamp: Date.now(),
      reason,
    });
    if (this.history.length > 50) {
      this.history.shift();
    }
  }
}

export * from './cbt-capsules';

