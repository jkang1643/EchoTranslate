import React from 'react'
import { Wifi, WifiOff, Clock } from 'lucide-react'

function ConnectionStatus({ isConnected, latency }) {
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-1">
        {isConnected ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-sm font-medium ${
          isConnected ? 'text-green-600' : 'text-red-600'
        }`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      {isConnected && latency > 0 && (
        <div className="flex items-center space-x-1 text-gray-500">
          <Clock className="w-3 h-3" />
          <span className="text-xs">{latency}ms</span>
        </div>
      )}
    </div>
  )
}

export default ConnectionStatus
