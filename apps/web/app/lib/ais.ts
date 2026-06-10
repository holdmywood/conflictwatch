/**
 * AIS vessel provider — key-gated, honest when absent.
 *
 * AISStream (aisstream.io) free tier exposes a websocket: subscribe with a
 * bounding box, collect position reports for a few seconds, return a
 * snapshot. With no AISSTREAM_API_KEY configured the caller gets
 * { configured: false } and the UI renders a labeled placeholder — never
 * simulated vessels.
 *
 * Military highlighting uses the AIS ShipType field (35 = military ops).
 * Many naval vessels do not broadcast AIS or broadcast disguised types —
 * coverage is partial by nature and the UI says so.
 */

import WebSocket from 'ws'

export interface Vessel {
  mmsi: string
  name: string
  lat: number
  lng: number
  speedKnots: number | null
  heading: number | null
  shipType: number | null
  military: boolean
}

export interface AisSnapshot {
  configured: boolean
  vessels: Vessel[]
  collectedForMs: number
  error?: string
}

const COLLECT_MS = 6_000
const MAX_VESSELS = 200

interface AisStreamMessage {
  MessageType?: string
  MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number }
  Message?: {
    PositionReport?: { Sog?: number; TrueHeading?: number }
    ShipStaticData?: { Type?: number }
  }
}

export async function collectVessels(
  bbox: { latMin: number; lngMin: number; latMax: number; lngMax: number },
): Promise<AisSnapshot> {
  const apiKey = process.env.AISSTREAM_API_KEY
  if (!apiKey) {
    return { configured: false, vessels: [], collectedForMs: 0 }
  }

  return new Promise(resolve => {
    const vessels = new Map<string, Vessel>()
    const types = new Map<string, number>()
    let settled = false

    const finish = (error?: string) => {
      if (settled) return
      settled = true
      try { ws.close() } catch { /* already closed */ }
      for (const [mmsi, type] of types) {
        const v = vessels.get(mmsi)
        if (v) { v.shipType = type; v.military = type === 35 }
      }
      resolve({
        configured: true,
        vessels: [...vessels.values()].slice(0, MAX_VESSELS),
        collectedForMs: COLLECT_MS,
        ...(error ? { error } : {}),
      })
    }

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    const timer = setTimeout(() => finish(), COLLECT_MS)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: [[[bbox.latMin, bbox.lngMin], [bbox.latMax, bbox.lngMax]]],
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }))
    })

    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString()) as AisStreamMessage
        const meta = msg.MetaData
        if (!meta?.MMSI) return
        const mmsi = String(meta.MMSI)
        if (msg.MessageType === 'PositionReport' && meta.latitude != null && meta.longitude != null) {
          const pr = msg.Message?.PositionReport
          vessels.set(mmsi, {
            mmsi,
            name: meta.ShipName?.trim() ?? '',
            lat: meta.latitude,
            lng: meta.longitude,
            speedKnots: pr?.Sog ?? null,
            heading: pr?.TrueHeading != null && pr.TrueHeading !== 511 ? pr.TrueHeading : null,
            shipType: types.get(mmsi) ?? null,
            military: (types.get(mmsi) ?? 0) === 35,
          })
        } else if (msg.MessageType === 'ShipStaticData') {
          const t = msg.Message?.ShipStaticData?.Type
          if (t != null) types.set(mmsi, t)
        }
      } catch { /* malformed frame — skip */ }
    })

    ws.on('error', err => {
      clearTimeout(timer)
      finish(`AIS stream error: ${err.message}`)
    })
    ws.on('close', () => finish())
  })
}
