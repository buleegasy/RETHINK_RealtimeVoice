export class SpeechTurnManager {
  private readonly dialogueHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private userSpeechBuffer: string = '';
  private assistantSpeechBuffer: string = '';

  public get history(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return this.dialogueHistory;
  }

  public get userBuffer(): string {
    return this.userSpeechBuffer;
  }

  public set userBuffer(val: string) {
    this.userSpeechBuffer = val;
  }

  public appendUserBuffer(delta: string): void {
    this.userSpeechBuffer += delta;
  }

  public get assistantBuffer(): string {
    return this.assistantSpeechBuffer;
  }

  public set assistantBuffer(val: string) {
    this.assistantSpeechBuffer = val;
  }

  public appendAssistantBuffer(delta: string): void {
    this.assistantSpeechBuffer += delta;
  }

  public recordAssistantTurn(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.assistantSpeechBuffer = '';
    this.dialogueHistory.push({ role: 'assistant', content: trimmed });
    return true;
  }

  public recordUserTurn(trimmed: string): boolean {
    const lastTurn = this.dialogueHistory.at(-1);
    if (lastTurn?.role === 'user') {
      if (lastTurn.content === trimmed || lastTurn.content.includes(trimmed)) {
        return false;
      }
      if (trimmed.startsWith(lastTurn.content)) {
        lastTurn.content = trimmed;
        return false;
      }
      if (!this.assistantSpeechBuffer.trim()) {
        const separator =
          trimmed.startsWith('，') || trimmed.startsWith('。') || trimmed.startsWith(',')
            ? ''
            : '，';
        lastTurn.content = `${lastTurn.content}${separator}${trimmed}`;
        return false;
      }
    }

    this.dialogueHistory.push({ role: 'user', content: trimmed });
    return true;
  }
}
