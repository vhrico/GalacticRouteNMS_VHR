/**
 * Local Three.js loader.
 *
 * This keeps test and production behavior aligned by loading the map
 * dependencies from Flask static files instead of external CDNs.
 */

(function() {
  'use strict';

  const CONFIG = {
    THREE_URL: '/static/js/vendor/three.r128.min.js',
    ORBIT_CONTROLS_URL: '/static/js/vendor/OrbitControls.r128.js',
    MAP_URL: '/static/js/galaxy-map-3d.js',
    SCRIPT_TIMEOUT: 5000
  };

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeoutId = setTimeout(() => {
        script.remove();
        reject(new Error(`Script load timeout: ${url}`));
      }, CONFIG.SCRIPT_TIMEOUT);

      script.onload = () => {
        clearTimeout(timeoutId);
        resolve(url);
      };

      script.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to load script: ${url}`));
      };

      script.src = url;
      script.async = false;
      document.head.appendChild(script);
    });
  }

  function checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch (error) {
      return false;
    }
  }

  function showErrorMessage(message) {
    const mapContainer = document.querySelector('.card');
    if (!mapContainer) return;

    const errorElement = document.createElement('div');
    errorElement.style.cssText = [
      'min-height: 600px',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'padding: 2rem',
      'background: #1a1a2e',
      'color: #eaeaea',
      'text-align: center'
    ].join(';');
    errorElement.textContent = message;

    const canvas = mapContainer.querySelector('canvas');
    if (canvas) {
      mapContainer.replaceChild(errorElement, canvas);
    }
  }

  async function init3DMap() {
    const mapElement = document.getElementById('galaxyMap3D');
    if (!mapElement) return;

    if (!checkWebGLSupport()) {
      showErrorMessage('Your browser does not support WebGL, which is required for the 3D galaxy map.');
      return;
    }

    try {
      await loadScript(CONFIG.THREE_URL);
      await loadScript(CONFIG.ORBIT_CONTROLS_URL);
      await loadScript(CONFIG.MAP_URL);
    } catch (error) {
      console.error('[3D Map] Initialization failed:', error);
      showErrorMessage('Failed to load the local 3D galaxy map assets.');
    }
  }

  window.ThreeMapConfig = {
    ...CONFIG,
    checkWebGL: checkWebGLSupport,
    version: '2.0.0-local'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init3DMap);
  } else {
    init3DMap();
  }
})();
