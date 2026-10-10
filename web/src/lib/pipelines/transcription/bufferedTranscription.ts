import type { ITranscriptionPipeline, TranscriptSegment, TranscriptSubscriber } from './types';
import { safeRandomId } from '../../utils';

export class BufferedTranscriptionPipeline implements ITranscriptionPipeline {
  public readonly name = 'BufferedTranscriptionPipeline';

  private subscribers: Set<TranscriptSubscriber> = new Set();
  private history: TranscriptSegment[] = [];

  private userBuffer: string = '';
  private assistantBuffer: string = '';
  private currentTurnId: { user?: string; assistant?: string } = {};
  private turnStartTime: { user?: number; assistant?: number } = {};

  private readonly fillerWordRegex =
    /^(?:[呃啊嗯哦喔哎呀]|那个|就是说|然后呢|然后|这个|就是|要是你想说啥|[.,!?，。！？、…~～:：;；\s—\-_])+/u;

  public feedDelta(speaker: 'user' | 'assistant', delta: string): void {
    if (!delta) return;

    if (speaker === 'user') {
      if (!this.currentTurnId.user) {
        this.currentTurnId.user = safeRandomId('user');
        this.turnStartTime.user = Date.now();
      }
      if (
        this.userBuffer &&
        (delta === this.userBuffer ||
          (delta.startsWith(this.userBuffer) && delta.length > this.userBuffer.length))
      ) {
        this.userBuffer = delta;
      } else {
        this.userBuffer += delta;
      }
      this.notifySubscribers({
        id: this.currentTurnId.user,
        speaker: 'user',
        text: this.cleanBuffer(this.userBuffer),
        isFinal: false,
        timestamp: this.turnStartTime.user || Date.now(),
      });
    } else {
      if (!this.currentTurnId.assistant) {
        this.currentTurnId.assistant = safeRandomId('assistant');
        this.turnStartTime.assistant = Date.now();
      }
      if (
        this.assistantBuffer &&
        (delta === this.assistantBuffer ||
          (delta.startsWith(this.assistantBuffer) && delta.length > this.assistantBuffer.length))
      ) {
        this.assistantBuffer = delta;
      } else {
        this.assistantBuffer += delta;
      }
      this.notifySubscribers({
        id: this.currentTurnId.assistant,
        speaker: 'assistant',
        text: this.cleanBuffer(this.assistantBuffer),
        isFinal: false,
        timestamp: this.turnStartTime.assistant || Date.now(),
      });
    }
  }

  public setCompletedTranscript(speaker: 'user' | 'assistant', fullText: string): void {
    if (!fullText) return;
    const isUser = speaker === 'user';
    if (isUser) {
      if (!this.currentTurnId.user) {
        this.currentTurnId.user = safeRandomId('user');
        this.turnStartTime.user = Date.now();
      }
      this.userBuffer = fullText;
      this.notifySubscribers({
        id: this.currentTurnId.user,
        speaker: 'user',
        text: this.cleanBuffer(this.userBuffer),
        isFinal: false,
        timestamp: this.turnStartTime.user || Date.now(),
      });
    } else {
      if (!this.currentTurnId.assistant) {
        this.currentTurnId.assistant = safeRandomId('assistant');
        this.turnStartTime.assistant = Date.now();
      }
      this.assistantBuffer = fullText;
      this.notifySubscribers({
        id: this.currentTurnId.assistant,
        speaker: 'assistant',
        text: this.cleanBuffer(this.assistantBuffer),
        isFinal: false,
        timestamp: this.turnStartTime.assistant || Date.now(),
      });
    }
  }

  public finalizeCurrentTurn(
    speaker: 'user' | 'assistant',
    customTimestamp?: number,
  ): TranscriptSegment | null {
    const isUser = speaker === 'user';
    const rawText = isUser ? this.userBuffer : this.assistantBuffer;
    const turnId = isUser ? this.currentTurnId.user : this.currentTurnId.assistant;
    const startTime =
      customTimestamp ||
      (isUser ? this.turnStartTime.user : this.turnStartTime.assistant) ||
      Date.now();

    if (!rawText.trim() || !turnId) {
      if (isUser) {
        this.userBuffer = '';
        this.currentTurnId.user = undefined;
        this.turnStartTime.user = undefined;
      } else {
        this.assistantBuffer = '';
        this.currentTurnId.assistant = undefined;
        this.turnStartTime.assistant = undefined;
      }
      return null;
    }

    const cleanedText = this.cleanBuffer(rawText);
    if (!cleanedText) {
      if (isUser) {
        this.userBuffer = '';
        this.currentTurnId.user = undefined;
        this.turnStartTime.user = undefined;
      } else {
        this.assistantBuffer = '';
        this.currentTurnId.assistant = undefined;
        this.turnStartTime.assistant = undefined;
      }
      return null;
    }

    const finalSegment: TranscriptSegment = {
      id: turnId,
      speaker,
      text: cleanedText,
      isFinal: true,
      timestamp: startTime,
    };

    this.history.push(finalSegment);
    this.history.sort((a, b) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp;
      }
      if (a.speaker === 'user' && b.speaker !== 'user') return -1;
      if (a.speaker !== 'user' && b.speaker === 'user') return 1;
      return 0;
    });
    this.notifySubscribers(finalSegment);

    if (isUser) {
      this.userBuffer = '';
      this.currentTurnId.user = undefined;
      this.turnStartTime.user = undefined;
    } else {
      this.assistantBuffer = '';
      this.currentTurnId.assistant = undefined;
      this.turnStartTime.assistant = undefined;
    }

    return finalSegment;
  }

  public subscribe(listener: TranscriptSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public getHistory(): TranscriptSegment[] {
    return [...this.history];
  }

  public reset(): void {
    this.userBuffer = '';
    this.assistantBuffer = '';
    this.currentTurnId = {};
    this.turnStartTime = {};
    this.history = [];
  }

  private cleanBuffer(text: string): string {
    return text.replace(this.fillerWordRegex, '').trim();
  }

  private notifySubscribers(segment: TranscriptSegment): void {
    for (const sub of this.subscribers) {
      try {
        sub(segment);
      } catch (err) {
        console.error('[TranscriptionPipeline] 派发异常:', err);
      }
    }
  }
}
