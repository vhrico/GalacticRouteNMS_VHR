/**
 * Three.js Fallback Loader
 * Provides graceful fallback to local Three.js if CDN is unavailable
 */

(function() {
  'use strict';

  const FALLBACK_CONFIG = {
    THREE_URL: '/static/lib/three.min.js',
    ORBIT_CONTROLS_URL: '/static/lib/OrbitControls.js',
    CDN_TIMEOUT: 5000, // 5 seconds
    MAX_RETRIES: 2
  };

  /**
   * Load script from URL with timeout
   */
  function loadScriptWithTimeout(url, timeout = FALLBACK_CONFIG.CDN_TIMEOUT) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      
      const timeoutId = setTimeout(() => {
        script.remove();
        reject(new Error(`Script load timeout: ${url}`));
      }, timeout);

      script.onload = () => {
        clearTimeout(timeoutId);
        resolve(url);
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load script: ${url}`));
      };

      script.src = url;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  /**
   * Try loading from CDN first, fallback to local
   */
  async function loadThreeWithFallback() {
    const CDN_THREE = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    const CDN_CONTROLS = 'https://cdn.jsdelivr.net/npm/three@r128/examples/js/controls/OrbitControls.js';

    console.info('[3D Map] Attempting to load Three.js from CDN...');
    
    try {
      await Promise.race([
        loadScriptWithTimeout(CDN_THREE, FALLBACK_CONFIG.CDN_TIMEOUT),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('CDN timeout')), FALLBACK_CONFIG.CDN_TIMEOUT)
        )
      ]);
      console.info('[3D Map] ✓ Three.js loaded from CDN');
    } catch (cdnError) {
      console.warn('[3D Map] ⚠ CDN failed:', cdnError.message);
      console.info('[3D Map] Attempting to load Three.js from local fallback...');
      
      try {
        await loadScriptWithTimeout(FALLBACK_CONFIG.THREE_URL);
        console.info('[3D Map] ✓ Three.js loaded from local fallback');
      } catch (localError) {
        console.error('[3D Map] ✗ Failed to load Three.js from both CDN and local:', localError.message);
        throw new Error('Three.js is unavailable. Cannot initialize 3D map.');
      }
    }

    // Load OrbitControls
    console.info('[3D Map] Loading OrbitControls...');
    try {
      await Promise.race([
        loadScriptWithTimeout(CDN_CONTROLS, FALLBACK_CONFIG.CDN_TIMEOUT),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('CDN timeout')), FALLBACK_CONFIG.CDN_TIMEOUT)
        )
      ]);
      console.info('[3D Map] ✓ OrbitControls loaded from CDN');
    } catch (cdnError) {
      console.warn('[3D Map] ⚠ CDN failed:', cdnError.message);
      console.info('[3D Map] Attempting to load OrbitControls from local fallback...');
      
      try {
        await loadScriptWithTimeout(FALLBACK_CONFIG.ORBIT_CONTROLS_URL);
        console.info('[3D Map] ✓ OrbitControls loaded from local fallback');
      } catch (localError) {
        console.error('[3D Map] ✗ Failed to load OrbitControls:', localError.message);
        throw new Error('OrbitControls is unavailable. Cannot initialize 3D map.');
      }
    }

    if (typeof THREE === 'undefined') {
      throw new Error('Three.js failed to load properly');
    }

    return true;
  }

  /**
   * Check WebGL support
   */
  function checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Show error message to user
   */
  function showErrorMessage(message, isDev = false) {
    const mapContainer = document.querySelector('.card');
    if (!mapContainer) return;

    const errorElement = document.createElement('div');
    errorElement.style.cssText = `
      padding: 20px;
      margin: 0;
      background: #2a2a3e;
      border: 2px solid #e94560;
      border-radius: 8px;
      color: #e9eaea;
      font-family: 'Courier New', monospace;
      text-align: center;
    `;

    let errorHTML = `
      <h3 style="color: #e94560; margin-top: 0;">⚠ 3D Map Unavailable</h3>
      <p>${message}</p>
    `;

    if (isDev) {
      errorHTML += '<p style="font-size: 0.85rem; color: #aaa; margin: 15px 0 0 0;">Check browser console for details.</p>';
    }

    errorElement.innerHTML = errorHTML;
    const canvas = mapContainer.querySelector('canvas');
    if (canvas) {
      mapContainer.replaceChild(errorElement, canvas);
    }
  }

  /**
   * Initialize 3D map with fallback handling
   */
  window.init3DMap = async function() {
    const mapElement = document.getElementById('galaxyMap3D');
    if (!mapElement) {
      console.info('[3D Map] No galaxy map element found. Skipping initialization.');
      return;
    }

    // Check WebGL support first
    if (!checkWebGLSupport()) {
      console.error('[3D Map] WebGL is not supported on this browser');
      showErrorMessage(
        'Your browser does not support WebGL, which is required for the 3D galaxy map. ' +
        'Please try a modern browser like Chrome, Firefox, or Safari.'
      );
      return;
    }

    try {
      console.info('[3D Map] Initializing 3D galaxy map with fallback support...');
      
      // Load Three.js with fallback
      await loadThreeWithFallback();

      // Load 3D map after Three.js is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          loadGalaxyMapScript();
        });
      } else {
        loadGalaxyMapScript();
      }

    } catch (error) {
      console.error('[3D Map] Initialization failed:', error.message);
      showErrorMessage(
        'Failed to load the 3D galaxy map. ' +
        'The interactive map requires Three.js rendering library. ' +
        'Please refresh the page or try a different browser.'
      );
    }
  };

  /**
   * Load the galaxy map script after Three.js is available
   */
  function loadGalaxyMapScript() {
    const script = document.createElement('script');
    script.src = '/static/js/galaxy-map-3d.js';
    
    script.onerror = () => {
      console.error('[3D Map] Failed to load galaxy-map-3d.js');
      showErrorMessage(
        'Failed to load galaxy map visualization. ' +
        'Please refresh the page to try again.'
      );
    };

    document.head.appendChild(script);
  }

  /**
   * Expose configuration for debugging
   */
  window.ThreeMapConfig = {
    ...FALLBACK_CONFIG,
    checkWebGL: checkWebGLSupport,
    version: '1.0.0'
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.init3DMap);
  } else {
    window.init3DMap();
  }

})();
