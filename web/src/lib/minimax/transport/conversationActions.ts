import type { DispatcherContext } from './serverEventDispatcher';

export function createTruncatePayload(
  itemId: string,
  audioEndMs: number,
  contentIndex: number = 0,
): Record<string, unknown> {
  return {
    type: 'conversation.item.truncate',
    item_id: itemId,
    content_index: contentIndex,
    audio_end_ms: Math.round(Math.max(0, audioEndMs)),
  };
}

export function createToolOutputPayloads(
  callId: string,
  output: Record<string, unknown>,
): Record<string, unknown>[] {
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    },
    {
      type: 'response.create',
    },
  ];
}

export function executeInterrupt(
  ctx: DispatcherContext,
  sendFn: (payload: Record<string, unknown>) => void,
  options?: { itemId?: string; audioEndMs?: number },
): void {
  ctx.playbackEpoch++;
  if (ctx.currentToolCallItemId) {
    sendFn({
      type: 'conversation.item.delete',
      item_id: ctx.currentToolCallItemId,
    });
    ctx.currentToolCallItemId = null;
  }
  sendFn({
    type: 'response.cancel',
  });
  const targetItemId = options?.itemId || ctx.currentResponseItemId;
  if (targetItemId) {
    ctx.canceledResponseItemIds.add(targetItemId);
    if (ctx.canceledResponseItemIds.size > 20) {
      const oldest = ctx.canceledResponseItemIds.values().next().value;
      if (oldest) ctx.canceledResponseItemIds.delete(oldest);
    }
    if (typeof options?.audioEndMs === 'number') {
      sendFn(createTruncatePayload(targetItemId, options.audioEndMs));
    }
  }
  ctx.currentResponseItemId = null;
}
