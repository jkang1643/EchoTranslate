import React from 'react'
import { Wifi, WifiOff, Clock, AlertCircle } from 'lucide-react'

function ConnectionStatus({ state, isConnected: isConnectedProp, latency }) {
  // Support both old (isConnected boolean) and new (state string) prop formats
  let connectionState = state;
  if (state === undefined && isConnectedProp !== undefined) {
    // Backward compatibility: convert boolean to state string
    connectionState = isConnectedProp ? 'open' : 'disconnected';
  }
  
  const isConnected = connectionState === 'open';
  const isError = connectionState === 'error';
  
  const getIcon = () => {
    if (isConnected) return <Wifi className="w-4 h-4 text-green-500" />;
    if (isError) return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <WifiOff className="w-4 h-4 text-gray-500" />;
  };
  
  const getLabel = () => {
    if (connectionState === 'open') return 'Connected';
    if (connectionState === 'connecting') return 'Connecting...';
    if (connectionState === 'error') return 'Error';
    if (connectionState === 'closed') return 'Disconnected';
    return 'Disconnected';
  };
  
  const getColor = () => {
    if (isConnected) return 'text-green-600';
    if (isError) return 'text-red-600';
    return 'text-gray-600';
  };
  
  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-1">
        {getIcon()}
        <span className={`text-sm font-medium ${getColor()}`}>
          {getLabel()}
        </span>
      </div>
      
      {isConnected && latency && latency > 0 && (
        <div className="flex items-center space-x-1 text-gray-500">
          <Clock className="w-3 h-3" />
          <span className="text-xs">{latency}ms</span>
        </div>
      )}
    </div>
  )
}

export { ConnectionStatus }
