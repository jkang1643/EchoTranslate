/**
 * Device Detection Utilities
 * Detect device capabilities for audio capture
 */

/**
 * Check if the device is mobile/tablet
 * @returns {boolean}
 */
export const isMobileDevice = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera

  // Check for mobile user agents
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
  
  // Also check for touch capabilities and small screen
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmallScreen = window.innerWidth <= 768

  return mobileRegex.test(userAgent.toLowerCase()) || (isTouchDevice && isSmallScreen)
}

/**
 * Check if system audio capture is available
 * System audio requires getDisplayMedia API and desktop environment
 * @returns {boolean}
 */
export const isSystemAudioAvailable = () => {
  // Check if getDisplayMedia is supported
  const hasDisplayMedia = navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function'
  
  // System audio is only available on desktop browsers
  const isDesktop = !isMobileDevice()
  
  return hasDisplayMedia && isDesktop
}

/**
 * Get device type
 * @returns {'desktop' | 'mobile' | 'tablet'}
 */
export const getDeviceType = () => {
  const userAgent = navigator.userAgent.toLowerCase()
  const isIpad = /ipad/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isTablet = /tablet|ipad|playbook|silk/.test(userAgent) || isIpad
  
  if (isTablet) return 'tablet'
  if (isMobileDevice()) return 'mobile'
  return 'desktop'
}

/**
 * Get available audio input modes based on device capabilities
 * @returns {Array<{value: string, label: string, icon: string}>}
 */
export const getAvailableAudioInputModes = () => {
  const modes = [
    { value: 'microphone', label: 'Microphone', icon: '🎤' }
  ]

  if (isSystemAudioAvailable()) {
    modes.push({ value: 'system', label: 'System Audio', icon: '🔊' })
  }

  return modes
}

/**
 * Get audio input mode recommendations based on device type
 * @returns {string}
 */
export const getRecommendedAudioMode = () => {
  // Mobile devices can only use microphone
  if (isMobileDevice()) {
    return 'microphone'
  }
  
  // Desktop can use either, default to microphone for permission reasons
  return 'microphone'
}

