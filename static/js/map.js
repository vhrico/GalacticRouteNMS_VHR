/**
 * Galaxy Map Renderer
 * Renders an interactive 3D-like visualization of discovered star systems
 */

class GalaxyMap {
  constructor(canvasId, systems = []) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.systems = systems;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.selectedSystem = null;
    
    this.init();
  }
  
  init() {
    this.resizeCanvas();
    this.setupEventListeners();
    this.render();
  }
  
  resizeCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }
  
  setupEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());
    
    this.canvas.addEventListener('wheel', (e) => this.handleZoom(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
  }
  
  addSystem(system) {
    this.systems.push(system);
    this.render();
  }
  
  addSystems(systems) {
    this.systems.push(...systems);
    this.render();
  }
  
  handleZoom(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.zoom *= delta;
    this.zoom = Math.max(0.5, Math.min(10, this.zoom));
    this.render();
  }
  
  handleMouseMove(e) {
    // Could be used for hover effects
  }
  
  handleMouseDown(e) {
    // Could be used for panning
  }
  
  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if click is on a system
    for (const system of this.systems) {
      const screenPos = this.worldToScreen(system.x, system.y);
      const distance = Math.sqrt(
        Math.pow(screenPos.x - x, 2) + Math.pow(screenPos.y - y, 2)
      );
      
      if (distance < 8) {
        this.selectedSystem = system;
        this.onSystemSelected(system);
        this.render();
        return;
      }
    }
    
    this.selectedSystem = null;
    this.render();
  }
  
  worldToScreen(x, y) {
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    return {
      x: centerX + (x * this.zoom) + this.panX,
      y: centerY + (y * this.zoom) + this.panY
    };
  }
  
  render() {
    // Clear canvas
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid
    this.drawGrid();
    
    // Draw connection lines between systems
    this.drawConnections();
    
    // Draw systems
    this.drawSystems();
    
    // Draw info for selected system
    if (this.selectedSystem) {
      this.drawSystemInfo(this.selectedSystem);
    }
  }
  
  drawGrid() {
    const step = 50 * this.zoom;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    this.ctx.strokeStyle = 'rgba(15, 52, 96, 0.3)';
    this.ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = centerX % step; x < this.canvas.width; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = centerY % step; y < this.canvas.height; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }
  
  drawConnections() {
    if (this.systems.length < 2) return;
    
    this.ctx.strokeStyle = 'rgba(233, 69, 96, 0.2)';
    this.ctx.lineWidth = 1;
    
    // Draw lines connecting nearby systems (within 100 light-years)
    for (let i = 0; i < this.systems.length; i++) {
      for (let j = i + 1; j < this.systems.length; j++) {
        const dist = this.distance(
          this.systems[i].x, this.systems[i].y,
          this.systems[j].x, this.systems[j].y
        );
        
        if (dist < 100) {
          const pos1 = this.worldToScreen(this.systems[i].x, this.systems[i].y);
          const pos2 = this.worldToScreen(this.systems[j].x, this.systems[j].y);
          
          this.ctx.beginPath();
          this.ctx.moveTo(pos1.x, pos1.y);
          this.ctx.lineTo(pos2.x, pos2.y);
          this.ctx.stroke();
        }
      }
    }
  }
  
  drawSystems() {
    for (const system of this.systems) {
      const screenPos = this.worldToScreen(system.x, system.y);
      
      // Draw outer glow for selected system
      if (this.selectedSystem && this.selectedSystem.id === system.id) {
        this.ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, 12, 0, Math.PI * 2);
        this.ctx.fill();
      }
      
      // Draw system point
      this.ctx.fillStyle = '#e94560';
      this.ctx.beginPath();
      this.ctx.arc(screenPos.x, screenPos.y, 6, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Draw system name
      if (this.zoom > 1.5) {
        this.ctx.fillStyle = 'rgba(234, 234, 234, 0.8)';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(system.name, screenPos.x, screenPos.y + 20);
      }
    }
  }
  
  drawSystemInfo(system) {
    const x = 20;
    const y = 20;
    
    this.ctx.fillStyle = 'rgba(22, 33, 62, 0.9)';
    this.ctx.fillRect(x, y, 250, 150);
    
    this.ctx.strokeStyle = '#e94560';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, 250, 150);
    
    this.ctx.fillStyle = '#e94560';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(system.name, x + 10, y + 25);
    
    this.ctx.fillStyle = '#aaa';
    this.ctx.font = '12px Arial';
    this.ctx.fillText(`X: ${system.x.toFixed(2)}`, x + 10, y + 45);
    this.ctx.fillText(`Y: ${system.y.toFixed(2)}`, x + 10, y + 60);
    this.ctx.fillText(`Z: ${system.z.toFixed(2)}`, x + 10, y + 75);
    this.ctx.fillText(`Type: ${system.system_type || 'Unknown'}`, x + 10, y + 90);
    this.ctx.fillText(`Star: ${system.star_type || 'N/A'}`, x + 10, y + 105);
    this.ctx.fillText(`Planets: ${system.planets_count || '?'}`, x + 10, y + 120);
  }
  
  distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }
  
  onSystemSelected(system) {
    // Dispatch custom event that can be listened to by other code
    window.dispatchEvent(new CustomEvent('systemSelected', { detail: system }));
  }
}

// Initialize map when page loads
document.addEventListener('DOMContentLoaded', function() {
  const mapElement = document.getElementById('galaxyMap');
  if (mapElement) {
    fetch('/api/systems')
      .then(response => response.json())
      .then(systems => {
        window.galaxyMap = new GalaxyMap('galaxyMap', systems);
      })
      .catch(error => console.error('Error loading systems:', error));
  }
  
  // Listen for system selection
  window.addEventListener('systemSelected', function(e) {
    const system = e.detail;
    console.log('Selected system:', system);
    // Could redirect to system details page
  });
});
