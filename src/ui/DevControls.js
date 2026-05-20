/**
 * DevControls provides a simple UI to tune physics parameters live.
 */
export class DevControls {
  constructor(physicsState) {
    this.physics = physicsState;
    this.panel = document.getElementById('dev-panel');
    this.container = document.getElementById('sliders');
    
    this.init();
    
    // Toggle with '~' key
    window.addEventListener('keydown', (e) => {
      if (e.key === '`') {
        this.panel.classList.toggle('hidden');
      }
    });
  }

  init() {
    const params = [
      { id: 'gravity', label: 'Gravity (Valleys)', min: 0, max: 100, step: 0.1 },
      { id: 'damping', label: 'Damping (Friction)', min: 0, max: 50, step: 0.1 },
      { id: 'scrollForce', label: 'Scroll Force', min: 0.01, max: 0.5, step: 0.01 }
    ];

    params.forEach(param => {
      const group = document.createElement('div');
      group.className = 'slider-group';
      
      const label = document.createElement('label');
      label.innerText = `${param.label}: ${this.physics.config[param.id]}`;
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = param.min;
      slider.max = param.max;
      slider.step = param.step;
      slider.value = this.physics.config[param.id];
      
      slider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.physics.config[param.id] = val;
        label.innerText = `${param.label}: ${val}`;
      });
      
      group.appendChild(label);
      group.appendChild(slider);
      this.container.appendChild(group);
    });
  }
}
