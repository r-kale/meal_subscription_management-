import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DataAdapter, Session } from '../data/adapter'
import type { AppSettings, Location } from '../data/types'
import { DEFAULT_DUES_TEMPLATE, DEFAULT_RENEWAL_TEMPLATE } from '../lib/whatsapp'

const LOCATION_FILTER_KEY = 'tiffin-location-filter'

export interface AppState {
  adapter: DataAdapter
  session: Session
  signOut: () => Promise<void>
  settings: AppSettings
  reloadSettings: () => Promise<void>
  locations: Location[]
  reloadLocations: () => Promise<void>
  /** '' = all locations */
  locationFilter: string
  setLocationFilter: (id: string) => void
}

const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

export function AppProvider(props: {
  adapter: DataAdapter
  session: Session
  onSignOut: () => void
  children: ReactNode
}) {
  const { adapter, session } = props
  const [settings, setSettings] = useState<AppSettings>({
    renewalTemplate: DEFAULT_RENEWAL_TEMPLATE,
    duesTemplate: DEFAULT_DUES_TEMPLATE,
    upiId: '',
    expiryWindowDays: 5,
  })
  const [locations, setLocations] = useState<Location[]>([])
  const [locationFilter, setLocationFilterState] = useState<string>(
    () => localStorage.getItem(LOCATION_FILTER_KEY) ?? '',
  )

  const reloadSettings = useCallback(async () => {
    setSettings(await adapter.getSettings())
  }, [adapter])

  const reloadLocations = useCallback(async () => {
    setLocations(await adapter.listLocations())
  }, [adapter])

  useEffect(() => {
    reloadSettings().catch(() => {})
    reloadLocations().catch(() => {})
  }, [reloadSettings, reloadLocations])

  const setLocationFilter = (id: string) => {
    setLocationFilterState(id)
    localStorage.setItem(LOCATION_FILTER_KEY, id)
  }

  const signOut = async () => {
    await adapter.signOut()
    props.onSignOut()
  }

  return (
    <AppContext.Provider
      value={{ adapter, session, signOut, settings, reloadSettings, locations, reloadLocations, locationFilter, setLocationFilter }}
    >
      {props.children}
    </AppContext.Provider>
  )
}
