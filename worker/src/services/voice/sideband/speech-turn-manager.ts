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
    const lastTurn = this.dialogueHistory[this.dialogueHistory.length - 1];
    if (
      lastTurn &&
      lastTurn.role === 'user' &&
      (lastTurn.content === trimmed || lastTurn.content.includes(trimmed))
    ) {
      return false;
    }
    if (lastTurn && lastTurn.role === 'user' && trimmed.startsWith(lastTurn.content)) {
      lastTurn.content = trimmed;
      return false;
    }
    if (lastTurn && lastTurn.role === 'user' && !this.assistantSpeechBuffer.trim()) {
      lastTurn.content = `${lastTurn.content}${trimmed.startsWith('，') || trimmed.startsWith('。') || trimmed.startsWith(',') ? '' : '，'}${trimmed}`;
      return false;
    }

    this.dialogueHistory.push({ role: 'user', content: trimmed });
    return true;
  }
}
