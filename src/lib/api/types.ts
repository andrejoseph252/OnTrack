// Subset of the MOTIS 2 (Transitous) API we use. See https://github.com/motis-project/motis/blob/master/openapi.yaml

export type Mode =
  | 'WALK' | 'BIKE' | 'CAR' | 'TRANSIT' | 'TRAM' | 'SUBWAY' | 'FERRY' | 'AIRPLANE' | 'BUS' | 'COACH'
  | 'RAIL' | 'HIGHSPEED_RAIL' | 'LONG_DISTANCE' | 'NIGHT_RAIL' | 'REGIONAL_FAST_RAIL' | 'REGIONAL_RAIL'
  | 'SUBURBAN' | 'FUNICULAR' | 'AERIAL_LIFT' | 'METRO' | 'CABLE_CAR' | 'ODM' | 'FLEX' | 'OTHER'

export interface EncodedPolyline {
  points: string
  precision: number
  length: number
}

export interface Alert {
  headerText?: string
  descriptionText?: string
  cause?: string
  effect?: string
  url?: string
}

export interface Place {
  name: string
  stopId?: string
  lat: number
  lon: number
  level?: number
  arrival?: string
  departure?: string
  scheduledArrival?: string
  scheduledDeparture?: string
  track?: string
  scheduledTrack?: string
  description?: string
  vertexType?: 'NORMAL' | 'BIKESHARE' | 'TRANSIT'
  cancelled?: boolean
  alerts?: Alert[]
}

export interface StepInstruction {
  relativeDirection: string
  distance: number
  fromLevel: number
  toLevel: number
  streetName: string
  polyline: EncodedPolyline
  area?: boolean
}

export interface Leg {
  mode: Mode
  from: Place
  to: Place
  duration: number
  startTime: string
  endTime: string
  scheduledStartTime: string
  scheduledEndTime: string
  realTime: boolean
  scheduled: boolean
  cancelled?: boolean
  distance?: number
  headsign?: string
  routeShortName?: string
  routeLongName?: string
  displayName?: string
  tripShortName?: string
  routeColor?: string
  routeTextColor?: string
  agencyName?: string
  tripId?: string
  intermediateStops?: Place[]
  legGeometry: EncodedPolyline
  steps?: StepInstruction[]
  alerts?: Alert[]
  wheelchairAccessible?: string
}

export interface Itinerary {
  duration: number
  startTime: string
  endTime: string
  transfers: number
  legs: Leg[]
}

export interface PlanResponse {
  itineraries: Itinerary[]
  direct: Itinerary[]
  nextPageCursor?: string
  previousPageCursor?: string
}

export interface StopTime {
  place: Place
  mode: Mode
  realTime: boolean
  headsign: string
  routeShortName: string
  displayName?: string
  routeColor?: string
  routeTextColor?: string
  tripId: string
  cancelled?: boolean
  agencyName?: string
}

export interface StopTimesResponse {
  stopTimes: StopTime[]
  place: Place
  nextPageCursor?: string
}

export interface GeocodeMatch {
  type: 'STOP' | 'ADDRESS' | 'PLACE'
  name: string
  id: string
  lat: number
  lon: number
  street?: string
  houseNumber?: string
  zip?: string
  category?: string
  modes?: Mode[]
  areas: { name: string; adminLevel: number; default?: boolean; unique?: boolean }[]
}
