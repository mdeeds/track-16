import { BaseComponent } from './BaseComponent.js';

export class Mixer extends BaseComponent {
  render() {
    const tracks = this.props.tracks || [];

    this.innerHTML = `
      <div class="h-full p-4 overflow-x-auto song-sheet-container">
        <h2 class="text-xl font-bold mb-4" style="color: var(--text-secondary)">Mixer</h2>
        <div class="flex gap-4 h-[calc(100%-3rem)] min-w-max">
          ${tracks.map(track => `
            <div class="mixer-channel" data-id="${track.id}">
              <span class="text-xs font-bold" style="color: var(--text-secondary)">${track.id}</span>
              
              <div class="flex flex-col gap-2 w-full px-2">
                <button 
                  class="mute-solo-btn btn-mute ${track.muted ? 'btn-mute-on' : 'btn-mute-off'}"
                  data-id="${track.id}"
                >
                  M
                </button>
                <button 
                  class="mute-solo-btn btn-solo ${track.soloed ? 'btn-solo-on' : 'btn-solo-off'}"
                  data-id="${track.id}"
                >
                  S
                </button>
              </div>

              <div class="fader-container">
                 <input 
                   type="range" 
                   min="-60" 
                   max="6" 
                   step="0.1"
                   value="${track.gainDB}"
                   class="vertical-slider track-fader"
                   data-id="${track.id}"
                 />
              </div>
              
              <span class="text-xs font-mono fader-val" style="color: var(--text-accent)">${track.gainDB.toFixed(1)}</span>
              <div class="w-full text-center" style="border-top: 1px solid var(--border-color); padding-top: 0.25rem">
                  <span class="text-xs uppercase" style="color: var(--text-secondary); font-size: 0.625rem">${track.name || `CH ${track.id}`}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindAll('.btn-mute', 'click', (e, el) => {
        const id = parseInt(el.dataset.id);
        const track = tracks.find(t => t.id === id);
        if (this.props.onUpdateTrack) this.props.onUpdateTrack(id, { muted: !track.muted });
    });

    this.bindAll('.btn-solo', 'click', (e, el) => {
        const id = parseInt(el.dataset.id);
        const track = tracks.find(t => t.id === id);
        if (this.props.onUpdateTrack) this.props.onUpdateTrack(id, { soloed: !track.soloed });
    });

    this.bindAll('.track-fader', 'input', (e, el) => {
        const id = parseInt(el.dataset.id);
        if (this.props.onUpdateTrack) this.props.onUpdateTrack(id, { gainDB: parseFloat(el.value) });
    });
  }

  updateTrackUI(id, updates) {
      const channel = this.querySelector(`.mixer-channel[data-id="${id}"]`);
      if (!channel) return;

      if (updates.muted !== undefined) {
          const btn = channel.querySelector('.btn-mute');
          if (btn) btn.className = `mute-solo-btn btn-mute ${updates.muted ? 'btn-mute-on' : 'btn-mute-off'}`;
      }
      if (updates.soloed !== undefined) {
          const btn = channel.querySelector('.btn-solo');
          if (btn) btn.className = `mute-solo-btn btn-solo ${updates.soloed ? 'btn-solo-on' : 'btn-solo-off'}`;
      }
      if (updates.gainDB !== undefined) {
          const input = channel.querySelector('.track-fader');
          // Only update if value differs significantly to avoid fighting user input, though standard range inputs are robust
          if (input && Math.abs(parseFloat(input.value) - updates.gainDB) > 0.1) {
              input.value = updates.gainDB;
          }
          const display = channel.querySelector('.fader-val');
          if (display) display.textContent = updates.gainDB.toFixed(1);
      }
  }
}

customElements.define('audio-mixer', Mixer);