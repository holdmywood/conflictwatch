import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEIGHTS_PATH = join(__dirname, 'model-weights.json')

export const MODEL_VERSION_FALLBACK = 'v0-logistic'

export interface ModelWeights {
  version: string
  intercept: number
  coefs: {
    eventTempo: number
    severitySlope: number
    spreadLocations: number
    sourceBreadth: number
    actorCount: number
  }
  trainedOn: number  // number of episodes used for training
  trainedAt: string  // ISO timestamp
  brierScore?: number
}

// v0 fallback: the original hardcoded logistic priors expressed as a weight vector
const FALLBACK_WEIGHTS: ModelWeights = {
  version: 'v0-logistic',
  intercept: -3.5,
  coefs: {
    eventTempo: 0.14,      // 0.8 over threshold 5 ≈ 0.14/unit
    severitySlope: 0.70,
    spreadLocations: 0.13, // 0.5 over threshold 3 ≈ 0.13/unit
    sourceBreadth: 0.0,
    actorCount: 0.10,      // 0.4 over threshold 3 ≈ 0.10/unit
  },
  trainedOn: 0,
  trainedAt: '2026-01-01T00:00:00Z',
}

function loadWeights(): ModelWeights {
  try {
    const raw = readFileSync(WEIGHTS_PATH, 'utf-8')
    return JSON.parse(raw) as ModelWeights
  } catch {
    return FALLBACK_WEIGHTS
  }
}

// Cache weights for process lifetime (weights only change when train-model.ts runs)
let _weights: ModelWeights | null = null
function getWeights(): ModelWeights {
  if (!_weights) _weights = loadWeights()
  return _weights
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

export function computePEscalation(features: {
  eventTempo: number
  severitySlope: number
  spreadLocations: number
  sourceBreadth: number
  actorCount: number
}): { p: number; ciLow: number; ciHigh: number; modelVersion: string } {
  const w = getWeights()
  const logit =
    w.intercept +
    w.coefs.eventTempo * features.eventTempo +
    w.coefs.severitySlope * features.severitySlope +
    w.coefs.spreadLocations * features.spreadLocations +
    w.coefs.sourceBreadth * features.sourceBreadth +
    w.coefs.actorCount * features.actorCount

  const p = Math.round(sigmoid(logit) * 100) / 100
  // CI width shrinks as training data grows: 0.15 at n=0, ~0.05 at n=200+
  const n = w.trainedOn
  const halfWidth = Math.round(Math.max(0.05, 0.15 - n * 0.0005) * 100) / 100
  return {
    p,
    ciLow: Math.max(0, Math.round((p - halfWidth) * 100) / 100),
    ciHigh: Math.min(1, Math.round((p + halfWidth) * 100) / 100),
    modelVersion: w.version,
  }
}

// For use in provenance trail
export function getModelVersion(): string {
  return getWeights().version
}
