import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(url) {
  const [connectionState, setConnectionState] = useState('connecting')
  const wsRef = useRef(null)
  const messageHandlersRef = useRef(new Set())

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    try {
      wsRef.current = new WebSocket(url)
      
      wsRef.current.onopen = () => {
        setConnectionState('open')
        console.log('WebSocket connected')
      }
      
      wsRef.current.onclose = () => {
        setConnectionState('closed')
        console.log('WebSocket disconnected')
      }
      
      wsRef.current.onerror = (error) => {
        setConnectionState('error')
        console.error('WebSocket error:', error)
      }
      
      wsRef.current.onmessage = (event) => {
        // Check if data is a string (JSON) or Blob
        if (typeof event.data === 'string') {
          try {
            const message = JSON.parse(event.data)
            messageHandlersRef.current.forEach(handler => {
              try {
                handler(message)
              } catch (error) {
                console.error('Message handler error:', error)
              }
            })
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
            console.error('Received data:', event.data.substring(0, 100))
          }
        } else {
          // Skip Blob or other non-string messages
          console.warn('Received non-string WebSocket message (Blob/Binary), skipping...')
        }
      }
    } catch (error) {
      setConnectionState('error')
      console.error('Failed to create WebSocket:', error)
    }
  }, [url])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setConnectionState('closed')
  }, [])

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }, [])

  const addMessageHandler = useCallback((handler) => {
    messageHandlersRef.current.add(handler)
    return () => messageHandlersRef.current.delete(handler)
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connectionState,
    connect,
    disconnect,
    sendMessage,
    addMessageHandler
  }
}
