import { BaseComponent } from './BaseComponent.js';

export class Metronome extends BaseComponent {
  connectedCallback() {
    this.render();
    this.startVisualizer();
  }

  disconnectedCallback() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  startVisualizer() {
    const canvas = this.querySelector('canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      if (!this.isConnected) return;
      const bpm = this.props.bpm || 120;
      
      ctx.fillStyle = '#111827'; // var(--bg-panel)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const time = Date.now() / 1000;
      const beatDuration = 60 / bpm;
      const phase = (time % beatDuration) / beatDuration;
      
      const radius = 50 + (phase < 0.1 ? 20 : 0);
      
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 4;
      ctx.stroke();

      if (phase < 0.1) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
          ctx.fill();
      }

      this.animId = requestAnimationFrame(draw);
    };
    draw();
  }

  render() {
    const bpm = this.props.bpm || 120;
    // Note: We use a fixed canvas in DOM to avoid recreating context on every render if possible, 
    // but simplified here: re-rendering recreates canvas. 
    // Optimization: Check if bpm changed significantly or use separate updater.
    // For this demo, simple innerHTML replacement is fine, though it resets canvas state.
    
    this.innerHTML = `
      <div class="h-full p-4 metronome-container">
        <h2 class="text-2xl font-bold mb-4" style="color: var(--text-secondary)">Metronome</h2>
        
        <div class="metronome-visual">
          <canvas width="300" height="300" class="metronome-canvas"></canvas>
          <div class="bpm-display">
              <span>${bpm}</span>
          </div>
        </div>

        <div class="bpm-slider-container">
          <span style="color: var(--text-secondary)">Slow</span>
          <input 
              id="bpm-slider"
              type="range" 
              min="40" 
              max="240" 
              value="${bpm}" 
              class="bpm-slider"
          />
          <span style="color: var(--text-secondary)">Fast</span>
        </div>
      </div>
    `;

    this.bind('#bpm-slider', 'input', (e) => {
        if (this.props.onBpmChange) this.props.onBpmChange(parseInt(e.target.value));
    });
    
    // Restart visualizer because canvas was replaced
    this.startVisualizer();
  }
}

customElements.define('metronome-tool', Metronome);