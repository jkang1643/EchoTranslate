/**
 * Home Page - Mode selection for the app
 */

import { useState } from 'react';
import { Header } from './Header';

export function HomePage({ onSelectMode }) {
  const [joinCode, setJoinCode] = useState('');

  const handleJoinWithCode = () => {
    if (joinCode.trim()) {
      onSelectMode('listener', joinCode.toUpperCase());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100">
      <Header />
      
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Welcome Section */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              Welcome to EchoTranslate
            </h1>
            <p className="text-xl text-gray-600">
              Real-time translation for everyone, everywhere
            </p>
          </div>

          {/* Mode Selection Cards */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Solo Mode */}
            <div className="bg-white rounded-lg shadow-xl p-8 hover:shadow-2xl transition-shadow">
              <div className="text-6xl mb-4 text-center">🎧</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">
                Solo Mode
              </h2>
              <p className="text-gray-600 mb-6 text-center">
                Use translation for yourself. Perfect for personal conversations, learning, or practicing languages.
              </p>
              <button
                onClick={() => onSelectMode('solo')}
                className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105"
              >
                Start Solo Session
              </button>
            </div>

            {/* Host Mode */}
            <div className="bg-white rounded-lg shadow-xl p-8 hover:shadow-2xl transition-shadow">
              <div className="text-6xl mb-4 text-center">🎙️</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">
                Host Mode
              </h2>
              <p className="text-gray-600 mb-6 text-center">
                Start a live session for preaching, conferences, or presentations. Share translations with many listeners.
              </p>
              <button
                onClick={() => onSelectMode('host')}
                className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105"
              >
                Start Broadcasting
              </button>
            </div>
          </div>

          {/* Join Session Section */}
          <div className="bg-white rounded-lg shadow-xl p-8">
            <div className="text-6xl mb-4 text-center">📱</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-3 text-center">
              Join a Session
            </h2>
            <p className="text-gray-600 mb-6 text-center">
              Enter a session code to receive live translations
            </p>
            
            <div className="max-w-md mx-auto">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter session code"
                  maxLength={6}
                  className="flex-1 px-4 py-3 text-xl font-bold text-center tracking-wider border-2 border-gray-300 rounded-lg focus:border-emerald-500 focus:outline-none uppercase"
                />
                <button
                  onClick={handleJoinWithCode}
                  disabled={!joinCode.trim()}
                  className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-semibold rounded-lg shadow-lg transition-all transform hover:scale-105 disabled:scale-100"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {/* Feature Highlights */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl mb-2">🌍</div>
              <h3 className="font-semibold text-gray-800 mb-1">50+ Languages</h3>
              <p className="text-sm text-gray-600">Support for major world languages</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-2">⚡</div>
              <h3 className="font-semibold text-gray-800 mb-1">Real-time</h3>
              <p className="text-sm text-gray-600">Instant translations as you speak</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-2">👥</div>
              <h3 className="font-semibold text-gray-800 mb-1">Multi-user</h3>
              <p className="text-sm text-gray-600">Broadcast to unlimited listeners</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

