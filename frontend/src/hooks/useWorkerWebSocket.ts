'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useWorkerMonitoringStore } from '@/stores/workerMonitoringStore'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3334/monitoring'

export function useWorkerWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 10

  const { updateFromWebSocket, setConnected } = useWorkerMonitoringStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      const ws = new WebSocket(WS_URL)

      ws.onopen = () => {
        console.log('Worker monitoring WebSocket connected')
        setConnected(true)
        reconnectAttempts.current = 0
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          updateFromWebSocket(data)
        } catch (e) {
          console.error('Invalid WebSocket message:', e)
        }
      }

      ws.onclose = () => {
        console.log('Worker monitoring WebSocket closed')
        setConnected(false)

        // Reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          reconnectAttempts.current++
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      wsRef.current = ws
    } catch (e) {
      console.error('Failed to connect WebSocket:', e)
    }
  }, [updateFromWebSocket, setConnected])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    reconnect: connect,
  }
}
