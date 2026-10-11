import type { IRagProvider } from '../pipelines/rag/types';
import type { CBTStage } from '../../types';
import { CbtStateMachine } from '../cbt/cbtStateMachine';
import { useTelemetryStore } from '../../store/telemetryStore';

export interface ToolDispatcherOptions {
  ragProvider: IRagProvider;
  fsm?: CbtStateMachine;
  onStageChange?: (stage: CBTStage, reason?: string) => void;
  onCrisisEscalate?: (severity: string, triggerText: string) => void;
  onSaveUserInfo?: (userName: string) => void;
}

export class RealtimeToolDispatcher {
  private readonly ragProvider: IRagProvider;
  private readonly fsm: CbtStateMachine;
  private readonly onStageChange?: (stage: CBTStage, reason?: string) => void;
  private readonly onCrisisEscalate?: (severity: string, triggerText: string) => void;
  private readonly onSaveUserInfo?: (userName: string) => void;

  constructor(options: ToolDispatcherOptions) {
    this.ragProvider = options.ragProvider;
    this.fsm = options.fsm || new CbtStateMachine();
    this.onStageChange = options.onStageChange;
    this.onCrisisEscalate = options.onCrisisEscalate;
    this.onSaveUserInfo = options.onSaveUserInfo;
  }

  public getFsm(): CbtStateMachine {
    return this.fsm;
  }

  public getRagProvider(): IRagProvider {
    return this.ragProvider;
  }

  public async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    console.log(`[ToolDispatcher] 触发工具调用: ${name}`, args);

    switch (name) {
      case 'search_knowledge_base': {
        const query = typeof args.query === 'string' ? args.query : '';
        const startTime = Date.now();
        const chunks = await this.ragProvider.retrieve(query, { topK: 2 });
        const durationMs = Date.now() - startTime;
        const topChunk = chunks[0];
        try {
          useTelemetryStore.getState().addRagRetrieval({
            query,
            status: chunks.length > 0 ? 'matched' : 'no_relevant_context',
            score: topChunk?.score || 0,
            topic: topChunk?.title,
            category: topChunk?.category,
            empathyLead: topChunk?.empathyLead,
            socraticPivot: topChunk?.socraticPivot,
            tabooPhrases: topChunk?.tabooPhrases,
            conciseDirective: this.ragProvider.formatContext(chunks),
            durationMs,
            timestamp: Date.now(),
            source: 'live_tool',
          });
        } catch {}
        return {
          status: 'success',
          reference_knowledge: this.ragProvider.formatContext(chunks),
        };
      }

      case 'report_state': {
        const stage = args.stage as CBTStage;
        const reason = typeof args.reason === 'string' ? args.reason : '';
        if (stage) {
          const res = this.fsm.transition(stage, reason);
          if (res.success) {
            this.onStageChange?.(res.stage, res.reason);
            try {
              useTelemetryStore.getState().updateCbtFsmState({
                ...this.fsm.getSnapshot(),
                history: [...this.fsm.getHistory()],
              });
            } catch {}
            return {
              status: 'success',
              current_stage: res.stage,
              previous_stage: res.previousStage,
            };
          } else {
            console.warn(`[ToolDispatcher] 状态机拦截转移: ${stage}, 原因: ${res.reason}`);
            return {
              status: 'rejected',
              current_stage: this.fsm.getStage(),
              reason: res.reason,
              is_oscillation_blocked: Boolean(res.isOscillationBlocked),
            };
          }
        }
        return { status: 'invalid_stage', current_stage: this.fsm.getStage() };
      }

      case 'escalate_crisis': {
        const severity = (args.severity as string) || 'high';
        const triggerText = (args.trigger_text as string) || '';
        this.fsm.escalateCrisis(triggerText || severity);
        this.onCrisisEscalate?.(severity, triggerText);
        try {
          useTelemetryStore.getState().updateCbtFsmState({
            ...this.fsm.getSnapshot(),
            history: [...this.fsm.getHistory()],
          });
        } catch {}
        return {
          status: 'acknowledged',
          action: 'crisis_intervention_triggered',
          current_stage: 'Crisis_Escalation',
        };
      }

      case 'save_user_info': {
        const userName = (args.user_name as string) || '';
        if (userName) {
          this.onSaveUserInfo?.(userName);
        }
        return { status: 'success', saved_name: userName };
      }

      default:
        console.warn(`[ToolDispatcher] 未知工具名称: ${name}`);
        return { status: 'ignored', message: `Tool ${name} not found` };
    }
  }

  public async dispatch(
    toolCall: { name: string; callId: string; args: Record<string, unknown> },
    client?: { sendToolOutput: (callId: string, output: Record<string, unknown>) => void } | null,
  ): Promise<Record<string, unknown>> {
    const output = await this.handleToolCall(toolCall.name, toolCall.args);
    if (client && toolCall.callId) {
      client.sendToolOutput(toolCall.callId, output);
    }
    return output;
  }
}
