// Inline SVG car glyph + "3D sphere" badge styling used inside Leaflet divIcon markers.

function clamp8(n: number) {
  return Math.max(0, Math.min(255, n))
}

// Lighten (positive percent) or darken (negative) a hex color.
function shade(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const num = parseInt(full, 16)
  const r = clamp8((num >> 16) + percent)
  const g = clamp8(((num >> 8) & 0xff) + percent)
  const b = clamp8((num & 0xff) + percent)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

// Radial gradient that gives a flat color a glossy, ball-like sense of depth.
export function sphereGradient(color: string): string {
  const light = shade(color, 65)
  const dark  = shade(color, -45)
  return `radial-gradient(circle at 33% 28%, ${light} 0%, ${color} 55%, ${dark} 100%)`
}

// Elevation + inner highlight/shade, layered on top of the gradient for a raised look.
export const SPHERE_SHADOW =
  '0 3px 8px rgba(0,0,0,0.45), inset 0 2px 3px rgba(255,255,255,0.55), inset 0 -3px 4px rgba(0,0,0,0.28)'

export function carSvg(size = 14, color = '#ffffff') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" style="display:block;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,0.4))">
    <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H8a2 2 0 0 1-4 0H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h1zm2.1 0h9.8l-1-3H8.1l-1 3z"/>
    <circle cx="7" cy="17" r="1.6"/>
    <circle cx="17" cy="17" r="1.6"/>
  </svg>`
}
