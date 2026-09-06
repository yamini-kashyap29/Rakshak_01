import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { useRescueSocket } from '../services/websocket'
import type { Overview, EventT } from '../types'

interface Ctx {
  overview: Overview | null
  liveEvents: EventT[]
  lastSignal: any
  refresh: () => Promise<void>
}

const AppDataContext = createContext<Ctx | null>(null)

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [liveEvents, setLiveEvents] = useState<EventT[]>([])
  const [lastSignal, setLastSignal] = useState<any>(null)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const data = await api.overview()
      setOverview(data)
      setLiveEvents(data.events)
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 4000)
    return () => clearInterval(id)
  }, [refresh])

  useRescueSocket((msg) => {
    setLastSignal(msg)
    refresh()
  })

  return (
    <AppDataContext.Provider value={{ overview, liveEvents, lastSignal, refresh }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
