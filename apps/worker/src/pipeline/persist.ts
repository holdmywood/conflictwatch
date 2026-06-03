import { prisma } from '@conflictwatch/db'
import { scoreThreat, toEventType, scoreConfidence } from './score.js'
import { buildTitle } from './normalize.js'
import type { NormalizedEvent } from '../types.js'

function conflictId(countryCode: string): string {
  return `conflict-${countryCode.toLowerCase()}`
}

export async function persistEvent(
  event: NormalizedEvent,
  allSourceNamesForCluster: string[]
): Promise<void> {
  const threatLevel = scoreThreat(event.quadClass)
  const eventType = toEventType(event.eventRootCode)
  const confidence = scoreConfidence(allSourceNamesForCluster)
  const title = buildTitle(event.actor1Name, event.actor2Name, eventType, event.region)
  const cId = conflictId(event.countryCode)

  await prisma.conflict.upsert({
    where: { id: cId },
    create: {
      id: cId,
      name: event.region.split(',').pop()?.trim() ?? event.countryCode,
      region: event.countryCode,
      status: 'active',
      threatLevel,
      lat: event.lat,
      lng: event.lng,
    },
    update: {
      threatLevel,
      lat: event.lat,
      lng: event.lng,
      status: 'active',
    },
  })

  const eventRecord = await prisma.event.upsert({
    where: { clusterId: event.globalEventId },
    create: {
      clusterId: event.globalEventId,
      title,
      eventType,
      lat: event.lat,
      lng: event.lng,
      region: event.region,
      confidence,
      publishedAt: event.publishedAt,
      conflictId: cId,
    },
    update: { confidence },
  })

  await prisma.eventSource.create({
    data: {
      eventId: eventRecord.id,
      name: event.sourceName,
      url: event.url,
      publishedAt: event.publishedAt,
    },
  })
}

export async function updateHeartbeat(
  sourcesOk: number,
  sourcesFailed: number
): Promise<void> {
  await prisma.heartbeat.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
    },
    update: {
      lastIngestedAt: new Date(),
      sourcesOk,
      sourcesFailed,
    },
  })
}
