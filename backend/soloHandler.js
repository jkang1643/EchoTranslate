/**
 * Solo Mode Handler - Uses Gemini Pool
 */

import { GeminiPool } from './geminiPool.js';
import WebSocket from 'ws';

export async function handleSoloMode(clientWs) {
  console.log("[Solo] Using parallel Gemini pool");

  let pool = null;
  let sourceLang = 'en';
  let targetLang = 'es';

  clientWs.on("message", async (msg) => {
    try {
      const message = JSON.parse(msg.toString());

      switch (message.type) {
        case 'init':
          sourceLang = message.sourceLang || 'en';
          targetLang = message.targetLang || 'es';
          
          console.log(`[Solo] Init: ${sourceLang} → ${targetLang}`);
          
          // Destroy old pool if exists
          if (pool) {
            pool.destroy();
            pool = null;
          }
          
          // Create new pool
          try {
            pool = new GeminiPool(process.env.GEMINI_API_KEY, 2);
            await pool.init(sourceLang, targetLang);
            
            // Set result callback
            pool.onResult = (text) => {
              if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({
                  type: 'translation',
                  originalText: '',
                  translatedText: text,
                  timestamp: Date.now()
                }));
              }
            };
            
            // Send ready
            clientWs.send(JSON.stringify({
              type: 'session_ready',
              message: 'Pool ready'
            }));
          } catch (err) {
            console.error('[Solo] Pool init failed:', err);
            clientWs.send(JSON.stringify({
              type: 'error',
              message: err.message
            }));
          }
          break;

        case 'audio':
          if (pool) {
            pool.sendAudio(message.audioData);
            
            // Log stats every 10 messages
            if (Math.random() < 0.1) {
              const stats = pool.getStats();
              console.log(`[Solo] Stats: ${stats.busy}/${stats.total} busy, ${stats.queued} queued`);
            }
          }
          break;

        case 'audio_end':
          console.log('[Solo] Audio stream ended');
          break;
      }
    } catch (err) {
      console.error("[Solo] Error:", err);
    }
  });

  clientWs.on("close", () => {
    console.log("[Solo] Client disconnected");
    if (pool) {
      pool.destroy();
      pool = null;
    }
  });
}

