/**
 * EchoTranslate - Frontend Application
 * Copyright (c) 2025 EchoTranslate. All Rights Reserved.
 * 
 * PROPRIETARY AND CONFIDENTIAL
 */

import React, { useState, useEffect } from 'react'
import TranslationInterface from './components/TranslationInterface'
import DemoPage from './components/DemoPage'
import Header from './components/Header'

function App() {
  const [currentPage, setCurrentPage] = useState('translation')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <main className="container mx-auto px-4 py-8">
        {currentPage === 'translation' ? (
          <TranslationInterface />
        ) : (
          <DemoPage />
        )}
      </main>
    </div>
  )
}

export default App
