'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import GlobeGL from 'react-globe.gl'
import { sevColor } from '../lib/tokens'

export interface ConflictPoint {
  id: string
  name: string
  lat: number
  lng: number
  threatLevel: number
}

interface GlobeProps {
  conflicts: ConflictPoint[]
  onSelect: (conflict: ConflictPoint) => void
  containerWidth?: number
  containerHeight?: number
}

function makeLabel(c: ConflictPoint): string {
  return `<div style="background:#1c1a15;border:1px solid #3d3930;padding:4px 8px;font-family:var(--font-mono),monospace;font-size:11px;color:#e8e5dc">
    ${c.name}<br/><span style="color:#a39e91">S${c.threatLevel} · ${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}</span>
  </div>`
}

function pointColorFn(d: object) { return sevColor((d as ConflictPoint).threatLevel) }
function pointRadiusFn(d: object) { return 0.35 + (d as ConflictPoint).threatLevel * 0.12 }

export default function Globe({ conflicts, onSelect, containerWidth, containerHeight }: GlobeProps) {
  const globeRef = useRef<any>(null)
  const [winDims, setWinDims] = useState({ width: 1920, height: 1080 })

  useEffect(() => {
    if (containerWidth !== undefined) return
    const update = () => setWinDims({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [containerWidth])

  const dimensions = {
    width: containerWidth ?? winDims.width,
    height: containerHeight ?? winDims.height,
  }

  useEffect(() => {
    if (globeRef.current) {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, reduceMotion ? 0 : 1000)
      globeRef.current.controls().autoRotate = !reduceMotion
      globeRef.current.controls().autoRotateSpeed = 0.3
    }
  }, [])

  const handleClick = useCallback(
    (point: object) => {
      const conflict = point as ConflictPoint
      if (globeRef.current) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        globeRef.current.controls().autoRotate = false
        globeRef.current.pointOfView(
          { lat: conflict.lat, lng: conflict.lng, altitude: 1.5 },
          reduceMotion ? 0 : 800
        )
      }
      onSelect(conflict)
    },
    [onSelect]
  )

  return (
    <GlobeGL
      ref={globeRef}
      globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
      backgroundColor="#100f0d"
      pointsData={conflicts}
      pointLat="lat"
      pointLng="lng"
      pointColor={pointColorFn}
      pointRadius={pointRadiusFn}
      pointAltitude={0.02}
      pointLabel={(d: object) => makeLabel(d as ConflictPoint)}
      onPointClick={handleClick}
      width={dimensions.width}
      height={dimensions.height}
      showAtmosphere={false}
    />
  )
}
