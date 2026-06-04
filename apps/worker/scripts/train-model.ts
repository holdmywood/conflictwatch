import 'dotenv/config'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { prisma } from '@conflictwatch/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEIGHTS_OUT = join(__dirname, '../src/ai/model-weights.json')

const LEARNING_RATE = 0.01
const LAMBDA = 0.01  // L2 regularization
const MAX_ITERS = 2000
const MIN_TRAINING_SAMPLES = 20  // abort if not enough data

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)) }

function trainLogistic(
  X: number[][],  // [n_samples, n_features]
  y: number[],    // [n_samples] 0 or 1
): { intercept: number; weights: number[]; finalLoss: number } {
  const n = X.length
  const d = X[0].length
  let intercept = 0
  const weights = new Array(d).fill(0)

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    // Compute predictions
    const preds = X.map((xi) => {
      const logit = intercept + xi.reduce((s, xij, j) => s + xij * weights[j], 0)
      return sigmoid(logit)
    })

    // Gradients
    const errors = preds.map((p, i) => p - y[i])
    const dIntercept = errors.reduce((s, e) => s + e, 0) / n
    const dWeights = weights.map((_, j) =>
      errors.reduce((s, e, i) => s + e * X[i][j], 0) / n + LAMBDA * weights[j]
    )

    intercept -= LEARNING_RATE * dIntercept
    for (let j = 0; j < d; j++) weights[j] -= LEARNING_RATE * dWeights[j]
  }

  // Final log-loss
  const preds = X.map((xi) => sigmoid(intercept + xi.reduce((s, xij, j) => s + xij * weights[j], 0)))
  const loss = -preds.reduce((s, p, i) => s + y[i] * Math.log(p + 1e-9) + (1 - y[i]) * Math.log(1 - p + 1e-9), 0) / n

  return { intercept, weights, finalLoss: loss }
}

async function main() {
  const episodes = await prisma.episodeStore.findMany({
    where: { escalatedToNational: { not: null } },
    select: {
      eventTempo: true,
      severitySlope: true,
      spreadLocations: true,
      sourceBreadth: true,
      actorCount: true,
      escalatedToNational: true,
    },
  })

  console.log(`[train-model] Found ${episodes.length} episodes with outcomes`)
  if (episodes.length < MIN_TRAINING_SAMPLES) {
    console.log(`[train-model] Need at least ${MIN_TRAINING_SAMPLES} samples; aborting (not enough history yet)`)
    await prisma.$disconnect()
    return
  }

  // Feature matrix: [eventTempo, severitySlope, spreadLocations, sourceBreadth, actorCount]
  const X = episodes.map(e => [e.eventTempo, e.severitySlope, e.spreadLocations, e.sourceBreadth, e.actorCount])
  const y = episodes.map(e => e.escalatedToNational ? 1 : 0)

  const { intercept, weights, finalLoss } = trainLogistic(X, y)

  // Brier score on training data (overfitted, but useful for tracking)
  const preds = X.map(xi => sigmoid(intercept + xi.reduce((s, xij, j) => s + xij * weights[j], 0)))
  const brierScore = preds.reduce((s, p, i) => s + Math.pow(p - y[i], 2), 0) / y.length

  const featureNames = ['eventTempo', 'severitySlope', 'spreadLocations', 'sourceBreadth', 'actorCount']
  const result = {
    version: `v1-logistic-n${episodes.length}`,
    intercept: Math.round(intercept * 10000) / 10000,
    coefs: Object.fromEntries(featureNames.map((name, j) => [name, Math.round(weights[j] * 10000) / 10000])),
    trainedOn: episodes.length,
    trainedAt: new Date().toISOString(),
    brierScore: Math.round(brierScore * 10000) / 10000,
    finalLoss: Math.round(finalLoss * 10000) / 10000,
  }

  writeFileSync(WEIGHTS_OUT, JSON.stringify(result, null, 2))
  console.log(`[train-model] Wrote weights to ${WEIGHTS_OUT}`)
  console.log(`[train-model] Brier score (training): ${result.brierScore}`)
  console.log(`[train-model] Model version: ${result.version}`)

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
