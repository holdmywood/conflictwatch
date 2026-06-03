'use client'

import { useEffect, useRef, useCallback } from 'react'
import GlobeGL from 'react-globe.gl'

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
}

function threatColor(level: number): string {
  if (level >= 5) return '#ef4444'
  if (level >= 4) return '#f97316'
  if (level >= 3) return '#f59e0b'
  if (level >= 2) return '#84cc16'
  return '#22c55e'
}

export default function Globe({ conflicts, onSelect }: GlobeProps) {
  const globeRef = useRef<any>(null)

  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 1000)
      globeRef.current.controls().autoRotate = true
      globeRef.current.controls().autoRotateSpeed = 0.3
    }
  }, [])

  const handleClick = useCallback(
    (point: object) => {
      const conflict = point as ConflictPoint
      if (globeRef.current) {
        globeRef.current.controls().autoRotate = false
        globeRef.current.pointOfView(
          { lat: conflict.lat, lng: conflict.lng, altitude: 1.5 },
          800
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
      backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
      pointsData={conflicts}
      pointLat="lat"
      pointLng="lng"
      pointColor={(d: object) => threatColor((d as ConflictPoint).threatLevel)}
      pointRadius={(d: object) => 0.4 + (d as ConflictPoint).threatLevel * 0.15}
      pointAltitude={0.02}
      pointLabel={(d: object) => {
        const c = d as ConflictPoint
        return `<div style="background:#111827;padding:6px 10px;border-radius:4px;font-size:12px;color:#e5e7eb">
          <strong>${c.name}</strong><br/>Threat: ${c.threatLevel}/5
        </div>`
      }}
      onPointClick={handleClick}
      width={typeof window !== 'undefined' ? window.innerWidth : 1920}
      height={typeof window !== 'undefined' ? window.innerHeight : 1080}
      atmosphereColor="#1e40af"
      atmosphereAltitude={0.15}
    />
  )
}
