/**
 * 3D Galaxy Map Renderer
 * Renders an interactive 3D visualization of discovered star systems using Three.js
 */

class GalaxyMap3D {
  constructor(canvasId, systems = []) {
    this.canvas = document.getElementById(canvasId);
    this.systems = systems;
    
    // Three.js setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      100000
    );
    this.camera.position.set(0, 100, 150);
    this.camera.lookAt(0, 0, 0);
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas,
      antialias: true,
      alpha: true 
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    
    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = false;
    this.controls.zoomSpeed = 1.2;
    this.controls.rotateSpeed = 0.8;
    
    // Zoom limits
    this.controls.minDistance = 50;
    this.controls.maxDistance = 5000;
    
    // Map state
    this.selectedSystem = null;
    this.systemObjects = new Map();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    this.init();
  }
  
  init() {
    this.setupLighting();
    this.setupGrid();
    this.createSystems();
    this.setupEventListeners();
    this.animate();
  }
  
  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    // Directional light for depth
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(directionalLight);
  }
  
  setupGrid() {
    // Create grid helper for reference
    const gridSize = 2000;
    const gridDivisions = 20;
    const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x0f3460, 0x16213e);
    gridHelper.position.y = -50;
    this.scene.add(gridHelper);
    
    // Add axes helper for debugging (optional, can be hidden)
    const axesHelper = new THREE.AxesHelper(200);
    this.scene.add(axesHelper);
  }
  
  createSystems() {
    // Clear existing systems
    this.systemObjects.forEach(obj => {
      this.scene.remove(obj.mesh);
      if (obj.label) this.scene.remove(obj.label);
    });
    this.systemObjects.clear();
    
    // Create star systems
    for (const system of this.systems) {
      this.createSystemObject(system);
    }
    
    // Draw connections between nearby systems
    this.drawConnections();
  }
  
  createSystemObject(system) {
    const group = new THREE.Group();
    
    // Create sphere for system
    const geometry = new THREE.SphereGeometry(6, 16, 16);
    const material = new THREE.MeshStandardMaterial({
      color: 0xe94560,
      emissive: 0xe94560,
      emissiveIntensity: 0.5,
      metalness: 0.3,
      roughness: 0.4
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.userData = { system };
    
    group.add(sphere);
    
    // Create glow effect
    const glowGeometry = new THREE.SphereGeometry(8, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xe94560,
      transparent: true,
      opacity: 0.2,
      wireframe: false
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);
    
    // Position in 3D space
    group.position.set(system.x, system.y, system.z);
    
    // Create text label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e9eaea';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(system.name, 128, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const labelGeometry = new THREE.PlaneGeometry(40, 20);
    const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.z = 15;
    group.add(label);
    
    this.scene.add(group);
    this.systemObjects.set(system.id, { mesh: group, sphere, system });
  }
  
  drawConnections() {
    if (this.systems.length < 2) return;
    
    const linePoints = [];
    const lineIndices = [];
    
    for (let i = 0; i < this.systems.length; i++) {
      for (let j = i + 1; j < this.systems.length; j++) {
        const dist = this.distance3D(
          this.systems[i].x, this.systems[i].y, this.systems[i].z,
          this.systems[j].x, this.systems[j].y, this.systems[j].z
        );
        
        // Connect systems within 100 light-years
        if (dist < 100) {
          const startIdx = linePoints.length;
          linePoints.push(
            new THREE.Vector3(this.systems[i].x, this.systems[i].y, this.systems[i].z),
            new THREE.Vector3(this.systems[j].x, this.systems[j].y, this.systems[j].z)
          );
          lineIndices.push(startIdx, startIdx + 1);
        }
      }
    }
    
    if (linePoints.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array(linePoints.map(p => [p.x, p.y, p.z]).flat()),
        3
      ));
      
      const material = new THREE.LineBasicMaterial({
        color: 0xe94560,
        transparent: true,
        opacity: 0.3,
        linewidth: 2
      });
      
      const lines = new THREE.LineSegments(geometry, material);
      this.scene.add(lines);
      this.connectionLines = lines;
    }
  }
  
  distance3D(x1, y1, z1, x2, y2, z2) {
    return Math.sqrt(
      Math.pow(x2 - x1, 2) + 
      Math.pow(y2 - y1, 2) + 
      Math.pow(z2 - z1, 2)
    );
  }
  
  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
    this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }
  
  onWindowResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  onMouseMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }
  
  onCanvasClick(event) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const systemMeshes = Array.from(this.systemObjects.values()).map(obj => obj.sphere);
    const intersects = this.raycaster.intersectObjects(systemMeshes);
    
    if (intersects.length > 0) {
      const clickedSystem = intersects[0].object.userData.system;
      this.selectSystem(clickedSystem);
    } else {
      this.deselectSystem();
    }
  }
  
  selectSystem(system) {
    this.selectedSystem = system;
    
    // Update visual feedback
    const systemObj = this.systemObjects.get(system.id);
    if (systemObj) {
      systemObj.sphere.material.emissiveIntensity = 1.0;
      systemObj.sphere.scale.set(1.3, 1.3, 1.3);
    }
    
    // Dispatch event
    this.onSystemSelected(system);
    
    // Camera tween to focus on system
    this.focusOnSystem(system);
  }
  
  deselectSystem() {
    if (this.selectedSystem) {
      const systemObj = this.systemObjects.get(this.selectedSystem.id);
      if (systemObj) {
        systemObj.sphere.material.emissiveIntensity = 0.5;
        systemObj.sphere.scale.set(1, 1, 1);
      }
    }
    this.selectedSystem = null;
  }
  
  focusOnSystem(system) {
    // Smoothly pan/tilt camera to focus on selected system
    const target = new THREE.Vector3(system.x, system.y, system.z);
    const distance = 150;
    const direction = new THREE.Vector3(1, 0.5, 1).normalize();
    const cameraTarget = target.clone().add(direction.multiplyScalar(distance));
    
    // Use Tween.js for smooth animation if available, otherwise use simple animation
    const startPos = this.camera.position.clone();
    const startTime = Date.now();
    const duration = 1000; // ms
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const eased = progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress;
      
      this.camera.position.lerpVectors(startPos, cameraTarget, eased);
      this.controls.target.lerp(target, eased);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }
  
  animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  
  addSystem(system) {
    this.systems.push(system);
    this.createSystemObject(system);
    this.drawConnections();
  }
  
  addSystems(systems) {
    this.systems.push(...systems);
    this.createSystems();
  }
  
  onSystemSelected(system) {
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('systemSelected', { detail: system }));
  }
  
  // Public API for camera control
  zoomIn() {
    this.camera.position.multiplyScalar(0.8);
    this.controls.update();
  }
  
  zoomOut() {
    this.camera.position.multiplyScalar(1.2);
    this.controls.update();
  }
  
  resetView() {
    this.camera.position.set(0, 100, 150);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
}

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', function() {
  const mapElement = document.getElementById('galaxyMap3D');
  if (mapElement) {
    // Check if Three.js and OrbitControls are loaded
    if (typeof THREE === 'undefined') {
      console.error('Three.js is required for 3D map');
      return;
    }
    
    fetch('/api/systems')
      .then(response => response.json())
      .then(systems => {
        window.galaxyMap = new GalaxyMap3D('galaxyMap3D', systems);
      })
      .catch(error => console.error('Error loading systems:', error));
  }
  
  // Listen for system selection
  window.addEventListener('systemSelected', function(e) {
    const system = e.detail;
    console.log('Selected system:', system);
  });
});
