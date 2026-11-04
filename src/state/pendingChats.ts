const pendingChats = new Map<string, Set<AbortController>>();

function pendingKey(channelId: string, userId: string): string {
  return `${channelId}:${userId}`;
}

export function addPendingChat(
  channelId: string,
  userId: string,
): AbortController {
  const key = pendingKey(channelId, userId);
  const controller = new AbortController();
  const pending = pendingChats.get(key) ?? new Set<AbortController>();
  pending.add(controller);
  pendingChats.set(key, pending);
  return controller;
}

export function removePendingChat(
  channelId: string,
  userId: string,
  controller: AbortController,
): void {
  const key = pendingKey(channelId, userId);
  const pending = pendingChats.get(key);
  pending?.delete(controller);
  if (pending?.size === 0) pendingChats.delete(key);
}

export function cancelPendingChats(channelId: string, userId: string): number {
  const key = pendingKey(channelId, userId);
  const pending = pendingChats.get(key);
  pendingChats.delete(key);
  pending?.forEach((controller) => controller.abort());
  return pending?.size ?? 0;
}
