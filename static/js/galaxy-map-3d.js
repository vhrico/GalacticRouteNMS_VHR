/**
 * Local 3D Galaxy Map Renderer
 * Renders saved system data into a pan/zoomable Three.js canvas.
 */

class GalaxyMap3D {
  constructor(canvasId, systems = []) {
    this.canvas = document.getElementById(canvasId);
    this.systems = this.normalizeSystems(systems);
    this.systemObjects = new Map();
    this.connectionLines = null;
    this.selectedSystem = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.defaultCameraDirection = new THREE.Vector3(1.25, 0.85, 1.15).normalize();

    this.bounds = this.calculateBounds();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101523);

    const { width, height } = this.getCanvasSize();
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100000);
    this.camera.position.set(260, 190, 250);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.zoomSpeed = 1.1;
    this.controls.rotateSpeed = 0.7;
    this.controls.panSpeed = 0.9;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 8000;

    if (THREE.MOUSE) {
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      };
    }

    this.init();
  }

  normalizeSystems(systems) {
    return systems.map((system) => ({
      ...system,
      x: Number(system.x) || 0,
      y: Number(system.y) || 0,
      z: Number(system.z) || 0
    }));
  }

  getCanvasSize() {
    return {
      width: Math.max(this.canvas.clientWidth, 320),
      height: Math.max(this.canvas.clientHeight, 360)
    };
  }

  calculateBounds() {
    if (!this.systems.length) {
      return {
        center: new THREE.Vector3(0, 0, 0),
        scale: 1,
        radius: 180,
        maxSpan: 1
      };
    }

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (const system of this.systems) {
      min.x = Math.min(min.x, system.x);
      min.y = Math.min(min.y, system.y);
      min.z = Math.min(min.z, system.z);
      max.x = Math.max(max.x, system.x);
      max.y = Math.max(max.y, system.y);
      max.z = Math.max(max.z, system.z);
    }

    const center = new THREE.Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2
    );
    const span = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const maxSpan = Math.max(span.x, span.y, span.z, 1);
    const scale = Math.min(60, 720 / maxSpan);
    const radius = Math.max(120, (maxSpan * scale) / 1.8);

    return { center, scale, radius, maxSpan };
  }

  plotPosition(system) {
    return new THREE.Vector3(
      (system.x - this.bounds.center.x) * this.bounds.scale,
      (system.y - this.bounds.center.y) * this.bounds.scale,
      (system.z - this.bounds.center.z) * this.bounds.scale
    );
  }

  init() {
    this.setupLighting();
    this.setupReferenceGrid();
    this.setupStarfield();
    this.createSystems();
    this.setupEventListeners();
    this.fitToSystems(false);
    this.animate();
  }

  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(220, 260, 180);
    this.scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x54d6c7, 0.6, 1200);
    fillLight.position.set(-260, 120, -180);
    this.scene.add(fillLight);
  }

  setupReferenceGrid() {
    const gridSize = Math.max(600, this.bounds.radius * 2.4);
    const grid = new THREE.GridHelper(gridSize, 24, 0x26566f, 0x1c2a3b);
    grid.position.y = -this.bounds.radius * 0.42;
    grid.material.opacity = 0.5;
    grid.material.transparent = true;
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(Math.min(180, this.bounds.radius * 0.5));
    axes.material.depthTest = false;
    axes.renderOrder = 1;
    this.scene.add(axes);
  }

  setupStarfield() {
    const count = 900;
    const radius = Math.max(1000, this.bounds.radius * 3.8);
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const distance = radius * (0.45 + Math.random() * 0.55);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      positions[i * 3] = distance * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = distance * Math.cos(phi);
      positions[i * 3 + 2] = distance * Math.sin(phi) * Math.sin(theta);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xbfd7ff,
      size: 2,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    });

    this.scene.add(new THREE.Points(geometry, material));
  }

  createSystems() {
    this.systemObjects.forEach((entry) => this.scene.remove(entry.group));
    this.systemObjects.clear();

    if (this.connectionLines) {
      this.scene.remove(this.connectionLines);
      this.connectionLines.geometry.dispose();
      this.connectionLines.material.dispose();
      this.connectionLines = null;
    }

    for (const system of this.systems) {
      this.createSystemObject(system);
    }

    this.drawConnections();
  }

  createSystemObject(system) {
    const group = new THREE.Group();
    const color = this.getSystemColor(system);
    const radius = this.getSystemRadius(system);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 28, 28),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.58,
        metalness: 0.18,
        roughness: 0.36
      })
    );
    sphere.userData = { system };
    group.add(sphere);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.9, 24, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        depthWrite: false
      })
    );
    group.add(glow);

    const label = this.createLabel(system.name);
    label.position.set(0, radius + 12, 0);
    group.add(label);

    group.position.copy(this.plotPosition(system));
    this.scene.add(group);
    this.systemObjects.set(system.id, { group, sphere, glow, label, system });
  }

  getSystemColor(system) {
    const value = `${system.system_type || ''} ${system.star_type || ''}`.toLowerCase();

    if (value.includes('red') || value.includes('m')) return 0xff5f57;
    if (value.includes('blue') || value.includes('b') || value.includes('o')) return 0x67a8ff;
    if (value.includes('green')) return 0x7ddc8a;
    if (value.includes('binary') || value.includes('exotic')) return 0xb58cff;
    if (value.includes('white') || value.includes('a')) return 0xf3f7ff;
    return 0xffcf66;
  }

  getSystemRadius(system) {
    const planets = Number(system.planets_count) || 0;
    return 7 + Math.min(planets, 6) * 0.55;
  }

  createLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext('2d');
    const label = String(text || 'Unknown').slice(0, 36);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(11, 17, 29, 0.62)';
    ctx.fillRect(16, 34, 480, 58);
    ctx.strokeStyle = 'rgba(255, 207, 102, 0.42)';
    ctx.strokeRect(16, 34, 480, 58);
    ctx.fillStyle = '#f3f7ff';
    ctx.font = '600 30px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 64, 440);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });

    return new THREE.Mesh(new THREE.PlaneGeometry(84, 21), material);
  }

  drawConnections() {
    if (this.systems.length < 2) return;

    const positions = [];
    const threshold = Math.max(90, this.bounds.maxSpan * 0.18);

    for (let i = 0; i < this.systems.length; i += 1) {
      for (let j = i + 1; j < this.systems.length; j += 1) {
        const first = this.systems[i];
        const second = this.systems[j];
        const distance = this.rawDistance(first, second);

        if (distance <= threshold) {
          const start = this.plotPosition(first);
          const end = this.plotPosition(second);
          positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        }
      }
    }

    if (!positions.length) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0x54d6c7,
      transparent: true,
      opacity: 0.28
    });

    this.connectionLines = new THREE.LineSegments(geometry, material);
    this.scene.add(this.connectionLines);
  }

  rawDistance(first, second) {
    return Math.sqrt(
      ((second.x - first.x) ** 2) +
      ((second.y - first.y) ** 2) +
      ((second.z - first.z) ** 2)
    );
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());
    this.renderer.domElement.addEventListener('click', (event) => this.onCanvasClick(event));
    this.renderer.domElement.addEventListener('pointermove', (event) => this.updateMouse(event));
    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  updateMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onWindowResize() {
    const { width, height } = this.getCanvasSize();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  onCanvasClick(event) {
    this.updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const spheres = Array.from(this.systemObjects.values()).map((entry) => entry.sphere);
    const intersects = this.raycaster.intersectObjects(spheres, false);

    if (!intersects.length) {
      this.deselectSystem();
      return;
    }

    this.selectSystem(intersects[0].object.userData.system);
  }

  selectSystem(system) {
    this.deselectSystem(false);
    this.selectedSystem = system;

    const entry = this.systemObjects.get(system.id);
    if (entry) {
      entry.sphere.material.emissiveIntensity = 1.15;
      entry.sphere.scale.setScalar(1.28);
      entry.glow.material.opacity = 0.32;
    }

    this.focusOnSystem(system);
    this.emitSelection(system);
  }

  deselectSystem(emit = true) {
    if (this.selectedSystem) {
      const entry = this.systemObjects.get(this.selectedSystem.id);
      if (entry) {
        entry.sphere.material.emissiveIntensity = 0.58;
        entry.sphere.scale.setScalar(1);
        entry.glow.material.opacity = 0.16;
      }
    }

    this.selectedSystem = null;
    if (emit) this.emitSelection(null);
  }

  focusOnSystem(system) {
    const entry = this.systemObjects.get(system.id);
    if (!entry) return;

    const target = entry.group.position.clone();
    const distance = Math.max(80, this.bounds.radius * 0.42);
    const cameraTarget = target.clone().add(this.defaultCameraDirection.clone().multiplyScalar(distance));
    this.tweenCamera(cameraTarget, target, 850);
  }

  fitToSystems(animated = true) {
    const target = new THREE.Vector3(0, 0, 0);
    const distance = Math.max(190, this.bounds.radius * 2.25);
    const cameraTarget = target.clone().add(this.defaultCameraDirection.clone().multiplyScalar(distance));
    this.controls.minDistance = Math.max(12, this.bounds.radius * 0.06);
    this.controls.maxDistance = Math.max(900, this.bounds.radius * 8);

    if (animated) {
      this.tweenCamera(cameraTarget, target, 700);
    } else {
      this.camera.position.copy(cameraTarget);
      this.controls.target.copy(target);
      this.controls.update();
    }
  }

  resetView() {
    this.deselectSystem();
    this.fitToSystems(true);
  }

  tweenCamera(endPosition, endTarget, duration) {
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - ((-2 * progress + 2) ** 2) / 2;

      this.camera.position.lerpVectors(startPosition, endPosition, eased);
      this.controls.target.lerpVectors(startTarget, endTarget, eased);
      this.controls.update();

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }

  async saveSnapshot() {
    this.renderer.render(this.scene, this.camera);
    const image = this.renderer.domElement.toDataURL('image/png');
    const response = await fetch('/api/map-snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Snapshot could not be saved.');
    }

    return payload;
  }

  emitSelection(system) {
    window.dispatchEvent(new CustomEvent('systemSelected', { detail: system }));
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    this.systemObjects.forEach((entry) => {
      entry.label.quaternion.copy(this.camera.quaternion);
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}

function setMapStatus(message, variant = '') {
  const status = document.getElementById('mapStatus');
  if (!status) return;

  status.textContent = message;
  status.className = `map-status ${variant}`.trim();

  if (message && variant !== 'persistent') {
    window.clearTimeout(setMapStatus.timer);
    setMapStatus.timer = window.setTimeout(() => {
      status.textContent = '';
      status.className = 'map-status';
    }, 4200);
  }
}

function showMapError(mapElement, message) {
  const container = mapElement.parentElement;
  if (!container) return;

  const errorElement = document.createElement('div');
  errorElement.className = 'map-error';
  errorElement.textContent = message;
  container.replaceChild(errorElement, mapElement);
}

function updateSelectedSystemPanel(system) {
  const panel = document.getElementById('selectedSystemPanel');
  const name = document.getElementById('selectedSystemName');
  const coords = document.getElementById('selectedSystemCoords');
  const link = document.getElementById('selectedSystemLink');
  if (!panel || !name || !coords || !link) return;

  if (!system) {
    panel.hidden = true;
    return;
  }

  name.textContent = system.name || 'Unknown system';
  coords.textContent = `X ${system.x.toFixed(2)} | Y ${system.y.toFixed(2)} | Z ${system.z.toFixed(2)}`;
  link.href = `/system/${system.id}`;
  panel.hidden = false;
}

function addSnapshotToPage(snapshot) {
  const mapPanel = document.querySelector('.map-panel');
  if (!mapPanel || !snapshot.url) return;

  let strip = document.querySelector('.snapshot-strip');
  let list = document.querySelector('.snapshot-list');

  if (!strip) {
    strip = document.createElement('section');
    strip.className = 'snapshot-strip';
    strip.setAttribute('aria-label', 'Saved map images');
    strip.innerHTML = [
      '<div class="section-heading">',
      '<h2>Saved 3D Images</h2>',
      '<span>1</span>',
      '</div>',
      '<div class="snapshot-list"></div>'
    ].join('');
    mapPanel.insertAdjacentElement('afterend', strip);
    list = strip.querySelector('.snapshot-list');
  }

  const count = strip.querySelector('.section-heading span');
  if (count) count.textContent = String(Number(count.textContent || '0') + 1);

  const link = document.createElement('a');
  link.className = 'snapshot-thumb';
  link.href = snapshot.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.innerHTML = `<img src="${snapshot.url}" alt="Saved galaxy map snapshot"><span>Just now</span>`;
  list.prepend(link);
}

document.addEventListener('DOMContentLoaded', () => {
  const mapElement = document.getElementById('galaxyMap3D');
  if (!mapElement) return;

  if (typeof THREE === 'undefined') {
    showMapError(mapElement, 'The local 3D viewer could not load Three.js.');
    return;
  }

  if (typeof THREE.OrbitControls === 'undefined') {
    showMapError(mapElement, 'The local 3D viewer could not load OrbitControls.');
    return;
  }

  fetch('/api/systems')
    .then((response) => response.json())
    .then((systems) => {
      window.galaxyMap = new GalaxyMap3D('galaxyMap3D', systems);
      if (!systems.length) {
        setMapStatus('Add a system to populate the 3D view.', 'persistent');
      }
    })
    .catch((error) => {
      console.error('Error loading systems:', error);
      showMapError(mapElement, 'System data could not be loaded.');
    });

  document.querySelectorAll('[data-map-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.galaxyMap) return;

      const action = button.dataset.mapAction;
      if (action === 'fit') window.galaxyMap.fitToSystems(true);
      if (action === 'reset') window.galaxyMap.resetView();
      if (action === 'snapshot') {
        button.disabled = true;
        setMapStatus('Saving current view...');
        try {
          const snapshot = await window.galaxyMap.saveSnapshot();
          addSnapshotToPage(snapshot);
          setMapStatus('Saved PNG snapshot.', 'success');
        } catch (error) {
          setMapStatus(error.message, 'error');
        } finally {
          button.disabled = false;
        }
      }
    });
  });

  window.addEventListener('systemSelected', (event) => {
    updateSelectedSystemPanel(event.detail);
  });
});
