import { getConfig } from "../config.js";

const running = new Set<string>();
const finishedAt = new Map<string, number>();

/**
 * Checks the slow mode for a user's new /chat or /generate request and, when
 * it may go ahead, marks the user as having a request running.
 * @returns 0 when the request may go ahead, Infinity while the user's previous
 * request is still running, or the milliseconds left of the cooldown.
 */
export function tryStartSlowmode(userId: string, now = Date.now()): number {
  const delay = getConfig().slowmodeDelay;
  if (delay <= 0) return 0;
  if (running.has(userId)) return Infinity;

  const finished = finishedAt.get(userId);
  if (finished !== undefined) {
    const left = finished + delay - now;
    if (left > 0) return left;
    finishedAt.delete(userId);
  }

  running.add(userId);
  return 0;
}

/**
 * Ends a request started with {@link tryStartSlowmode} and starts the user's
 * cooldown.
 */
export function finishSlowmode(userId: string, now = Date.now()): void {
  if (!running.delete(userId)) return;
  finishedAt.set(userId, now);
}

/**
 * The reply shown to a user whose request slow mode turned down.
 */
export function slowmodeMessage(left: number, now = Date.now()): string {
  if (left === Infinity) {
    return "Slow mode: wait until your current answer finishes.";
  }
  return `Slow mode: you can ask again <t:${Math.ceil((now + left) / 1000)}:R>.`;
}

export function resetSlowmode(): void {
  running.clear();
  finishedAt.clear();
}
