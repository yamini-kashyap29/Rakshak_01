import { useEffect, useRef } from 'react'

export function useRescueSocket(onMessage: (msg: any) => void) {
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${proto}://${window.location.host}/api/simulation/ws`
    let ws: WebSocket
    let retryTimer: ReturnType<typeof setTimeout>

    function connect() {
      ws = new WebSocket(url)
      ws.onmessage = (evt) => {
        try {
          cbRef.current(JSON.parse(evt.data))
        } catch { /* ignore malformed */ }
      }
      ws.onclose = () => {
        retryTimer = setTimeout(connect, 2000)
      }
    }
    connect()

    return () => {
      clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
