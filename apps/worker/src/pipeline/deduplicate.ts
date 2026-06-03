import { createHash } from 'crypto'
import { redis } from '../lib/redis.js'

const TTL_SECONDS = 604800 // 7 days

function dedupeKey(globalEventId: string, mentionIdentifier: string): string {
  return createHash('sha256')
    .update(`${globalEventId}:${mentionIdentifier}`)
    .digest('hex')
}

export async function isDuplicate(
  globalEventId: string,
  mentionIdentifier: string
): Promise<boolean> {
  const key = dedupeKey(globalEventId, mentionIdentifier)
  const existing = await redis.get(key)
  return existing !== null
}

export async function markSeen(
  globalEventId: string,
  mentionIdentifier: string
): Promise<void> {
  const key = dedupeKey(globalEventId, mentionIdentifier)
  await redis.set(key, '1', 'EX', TTL_SECONDS)
}
