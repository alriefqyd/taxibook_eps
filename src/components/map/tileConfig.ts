export const TILE_LAYERS = {
  satellite: {
    url:         'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // Label overlay stacked on top so streets/cities/villages show on satellite
    labelUrl:    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label:       'Satellite',
  },
  street: {
    url:         'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    labelUrl:    null,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    label:       'Street',
  },
} as const

export type TileLayerKey = keyof typeof TILE_LAYERS

// Legacy exports — kept so existing imports don't break
export const DEFAULT_TILE_URL         = TILE_LAYERS.satellite.url
export const DEFAULT_TILE_ATTRIBUTION = TILE_LAYERS.satellite.attribution
export const DEFAULT_TILE_SUBDOMAINS  = ['a', 'b', 'c', 'd']
