/**
 * EchoTranslate - Header Component
 * Copyright (c) 2025 EchoTranslate. All Rights Reserved.
 */

import React from 'react'
import { Mic, Type } from 'lucide-react'

function Header({ currentPage, setCurrentPage }) {
  return (
    <header className="bg-white shadow-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">EchoTranslate</h1>
          </div>
          
          <nav className="flex space-x-1">
            <button
              onClick={() => setCurrentPage('translation')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                currentPage === 'translation'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voice Translation</span>
            </button>
            <button
              onClick={() => setCurrentPage('demo')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                currentPage === 'demo'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Type className="w-4 h-4" />
              <span>Text Demo</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}

export { Header }
