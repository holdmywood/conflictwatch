export const SEV_COLORS = ['', '#64748b', '#ca8a04', '#ea580c', '#7c3aed', '#991b1b'] as const

export function sevColor(level: number): string {
  return SEV_COLORS[Math.min(Math.max(level, 1), 5)] ?? SEV_COLORS[1]
}
