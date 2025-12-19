
import { BaseComponent } from './BaseComponent.js';
import { audioEngine } from '../services/audioEngine.js';

export class Metronome extends BaseComponent {
  constructor() {
      super();
      // Directly set _state to avoid triggering render() in the constructor
      // touching DOM in constructor is prohibited in Custom Elements
      this._state = {
          devices: { inputs: [], outputs: [] }
      };
  }

  connectedCallback() {
    // Initial render when connected
    this.render();

    this.loadDevices().then(() => {
        if (this.isConnected) this.render();
    });
    
    // Also try initializing input if not done, to get permission and labels
    // We do this silently to check what's available
    audioEngine.getDevices().then(d => {
        this.state = { devices: d };
    });
    
    navigator.mediaDevices.ondevicechange = () => {
        this.loadDevices().then(() => this.render());
    };

    this.startVisualizer();
  }

  async loadDevices() {
      const devices = await audioEngine.getDevices();
      this.state = { devices };
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
      
      // -- Clean Slate --
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // -- VU Meter Logic --
      if (audioEngine.analyser) {
          const bufferLength = audioEngine.analyser.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);
          audioEngine.analyser.getByteTimeDomainData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
              const x = (dataArray[i] - 128) / 128.0;
              sum += x * x;
          }
          const rms = Math.sqrt(sum / bufferLength);
          
          let percent = Math.min(rms * 400, 100);
          
          const bar = this.querySelector('#vu-bar');
          if (bar) {
              bar.style.width = `${percent}%`;
              if (percent > 90) bar.style.backgroundColor = 'var(--accent-red)';
              else if (percent > 70) bar.style.backgroundColor = 'var(--accent-yellow)';
              else bar.style.backgroundColor = 'var(--accent-green)';
          }
      }

      this.animId = requestAnimationFrame(draw);
    };
    draw();
  }

  render() {
    const bpm = this.props.bpm || 120;
    const info = audioEngine.inputDeviceInfo || { label: 'Initializing...', sampleRate: 0, deviceId: 'default' };
    const ctxRate = audioEngine.ctx ? audioEngine.ctx.sampleRate : 0;
    
    const { inputs, outputs } = this.state.devices;
    const currentInput = audioEngine.currentInputDeviceId || 'default';
    const currentOutput = audioEngine.currentOutputDeviceId || 'default';

    this.innerHTML = `
      <div class="h-full p-4 metronome-container">
        <h2 class="text-2xl font-bold mb-4" style="color: var(--text-secondary)">Metronome & Input</h2>
        
        <div class="metronome-visual" style="opacity: 0.1">
           <canvas width="1" height="1"></canvas> 
        </div>
        
        <!-- Source Config -->
        <div class="w-full max-w-md mb-6 space-y-4">
            <div>
                <label class="block text-xs uppercase font-bold text-white mb-1">Audio Input</label>
                <select id="input-select" class="device-select">
                    ${inputs.length === 0 ? `<option value="default">${info.label}</option>` : ''}
                    ${inputs.map(d => `<option value="${d.deviceId}" ${d.deviceId === currentInput ? 'selected' : ''}>${d.label || d.deviceId}</option>`).join('')}
                </select>
            </div>
            
            <div>
                <label class="block text-xs uppercase font-bold text-white mb-1">Audio Output</label>
                <select id="output-select" class="device-select" ${!audioEngine.ctx || typeof audioEngine.ctx.setSinkId !== 'function' ? 'disabled' : ''}>
                    ${outputs.length === 0 ? '<option value="default">Default Speaker</option>' : ''}
                    <option value="default" ${currentOutput === 'default' ? 'selected' : ''}>Default Speaker</option>
                    ${outputs.map(d => `<option value="${d.deviceId}" ${d.deviceId === currentOutput ? 'selected' : ''}>${d.label || d.deviceId}</option>`).join('')}
                </select>
                ${(!audioEngine.ctx || typeof audioEngine.ctx.setSinkId !== 'function') ? '<span class="text-xs text-secondary italic">Output selection not supported in this browser</span>' : ''}
            </div>

            <div class="flex gap-4 justify-center mt-2">
               <div class="text-center">
                  <span class="block text-xs uppercase" style="font-size: 0.65rem; color: var(--text-secondary)">Input Rate</span>
                  <span class="font-mono text-white text-sm">${info.sampleRate} Hz</span>
               </div>
               <div class="text-center">
                  <span class="block text-xs uppercase" style="font-size: 0.65rem; color: var(--text-secondary)">Output Rate</span>
                  <span class="font-mono text-white text-sm">${ctxRate} Hz</span>
               </div>
            </div>
        </div>

        <!-- VU Meter -->
        <div class="w-full max-w-md mb-6">
            <div class="flex justify-between text-xs text-secondary mb-1" style="color: var(--text-secondary)">
                <span>-60</span>
                <span>-30</span>
                <span>-12</span>
                <span>-6</span>
                <span>0 dB</span>
            </div>
            <div class="vu-meter-bg h-4 w-full bg-gray-800 rounded relative overflow-hidden">
                <div id="vu-bar" class="h-full bg-green-500 transition-all duration-75" style="width: 0%"></div>
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
        <div class="text-center mt-2 font-mono text-xl">${bpm} BPM</div>
      </div>
    `;

    this.bind('#bpm-slider', 'input', (e) => {
        if (this.props.onBpmChange) this.props.onBpmChange(parseInt(e.target.value));
    });

    this.bind('#input-select', 'change', async (e) => {
        const deviceId = e.target.value;
        await audioEngine.initInput(deviceId);
        this.render();
    });

    this.bind('#output-select', 'change', async (e) => {
        const deviceId = e.target.value;
        await audioEngine.setOutputDevice(deviceId);
    });
    
    // Check if visualizer needs starting (e.g. after re-render)
    this.startVisualizer();
  }
}

customElements.define('metronome-tool', Metronome);
