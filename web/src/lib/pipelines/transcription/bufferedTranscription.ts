import type { ITranscriptionPipeline, TranscriptSegment, TranscriptSubscriber } from './types';
import { safeRandomId } from '../../utils';

export class BufferedTranscriptionPipeline implements ITranscriptionPipeline {
  public readonly name = 'BufferedTranscriptionPipeline';

  private subscribers: Set<TranscriptSubscriber> = new Set();
  private history: TranscriptSegment[] = [];

  private userBuffer: string = '';
  private assistantBuffer: string = '';
  private currentTurnId: { user?: string; assistant?: string } = {};

  private readonly fillerWordRegex =
    /^(?:[呃啊嗯哦喔哎呀]|那个|就是说|然后呢|这个|就是|[.\s…，。、])+/g;

  public feedDelta(speaker: 'user' | 'assistant', delta: string): void {
    if (!delta) return;

    if (speaker === 'user') {
      if (!this.currentTurnId.user) {
        this.currentTurnId.user = safeRandomId('user');
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
        timestamp: Date.now(),
      });
    } else {
      if (!this.currentTurnId.assistant) {
        this.currentTurnId.assistant = safeRandomId('assistant');
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
        timestamp: Date.now(),
      });
    }
  }

  public finalizeCurrentTurn(speaker: 'user' | 'assistant'): TranscriptSegment | null {
    const isUser = speaker === 'user';
    const rawText = isUser ? this.userBuffer : this.assistantBuffer;
    const turnId = isUser ? this.currentTurnId.user : this.currentTurnId.assistant;

    if (!rawText.trim() || !turnId) {
      if (isUser) {
        this.userBuffer = '';
        this.currentTurnId.user = undefined;
      } else {
        this.assistantBuffer = '';
        this.currentTurnId.assistant = undefined;
      }
      return null;
    }

    const cleanedText = this.cleanBuffer(rawText);
    const finalSegment: TranscriptSegment = {
      id: turnId,
      speaker,
      text: cleanedText,
      isFinal: true,
      timestamp: Date.now(),
    };

    this.history.push(finalSegment);
    this.notifySubscribers(finalSegment);

    if (isUser) {
      this.userBuffer = '';
      this.currentTurnId.user = undefined;
    } else {
      this.assistantBuffer = '';
      this.currentTurnId.assistant = undefined;
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
