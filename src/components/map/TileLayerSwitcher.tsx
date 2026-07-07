'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { TileLayer, useMap } from 'react-leaflet'
import { TILE_LAYERS, type TileLayerKey } from './tileConfig'

const SatIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
  </svg>
)

const StreetIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
)

interface Props {
  defaultLayer?: TileLayerKey
  showToggle?:  boolean
}

export default function TileLayerSwitcher({ defaultLayer = 'satellite', showToggle = true }: Props) {
  const [layer, setLayer]         = useState<TileLayerKey>(defaultLayer)
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const map = useMap()

  useEffect(() => {
    if (!showToggle) return
    const root = map.getContainer()
    const div  = document.createElement('div')
    div.style.cssText =
      'position:absolute;top:10px;right:44px;z-index:1000;pointer-events:auto;'
    root.appendChild(div)
    setContainer(div)
    return () => { root.removeChild(div) }
  }, [map, showToggle])

  const next = layer === 'satellite' ? 'street' : 'satellite'
  const cfg  = TILE_LAYERS[layer]

  return (
    <>
      <TileLayer key={layer} url={cfg.url} attribution={cfg.attribution} />
      {cfg.labelUrl && (
        <TileLayer key={layer + '-labels'} url={cfg.labelUrl} attribution="" pane="shadowPane" />
      )}

      {showToggle && container && createPortal(
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); setLayer(next) }}
          title={`Switch to ${TILE_LAYERS[next].label} view`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            margin: 0,
            padding: '6px 10px',
            background: '#ffffff',
            border: 'none',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            cursor: 'pointer',
            fontSize: 11, fontWeight: 700,
            color: '#006064',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            whiteSpace: 'nowrap',
          }}
        >
          {next === 'satellite' ? <SatIcon /> : <StreetIcon />}
          {TILE_LAYERS[next].label}
        </button>,
        container,
      )}
    </>
  )
}
