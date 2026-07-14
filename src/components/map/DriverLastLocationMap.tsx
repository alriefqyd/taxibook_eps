'use client'
import { MapContainer, Marker } from 'react-leaflet'
import TileLayerSwitcher from './TileLayerSwitcher'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { carSvg, sphereGradient, SPHERE_SHADOW } from './carIcon'

function carIcon(color: string) {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:${sphereGradient(color)};border:3px solid #fff;border-radius:50%;box-shadow:${SPHERE_SHADOW};display:flex;align-items:center;justify-content:center">${carSvg(15)}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

interface Props {
  lat: number
  lng: number
  color?: string
}

export default function DriverLastLocationMap({ lat, lng, color = '#006064' }: Props) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
    >
      <TileLayerSwitcher showToggle={false} />
      <Marker position={[lat, lng]} icon={carIcon(color)} />
    </MapContainer>
  )
}
