import { BaseComponent } from './BaseComponent.js';

export class TapeDeck extends BaseComponent {
  render() {
    const tracks = this.props.tracks || [];

    this.innerHTML = `
      <div class="h-full p-4 overflow-y-auto song-sheet-container">
        <h2 class="text-xl font-bold mb-4" style="color: var(--text-secondary)">Tape Deck</h2>
        <div class="tape-grid">
          ${tracks.map(track => `
            <div 
              class="track-card ${track.armed ? 'armed' : ''}"
              data-id="${track.id}"
            >
              <div class="flex justify-between items-center">
                <span class="font-bold" style="color: var(--text-secondary)">Track ${track.id}</span>
                ${track.armed ? '<div class="record-indicator"></div>' : ''}
              </div>
              
              <div class="flex-1 flex items-center justify-center">
                ${track.hasAudio ? `
                   <div class="audio-waveform-placeholder">
                      <span class="text-xs" style="color: #93c5fd">Audio Data</span>
                   </div>
                ` : `
                   <div class="audio-empty"></div>
                `}
              </div>

              <div class="flex gap-2 mt-2">
                  <div class="track-meter" style="background-color: ${track.muted ? 'var(--accent-red)' : 'var(--accent-green)'}"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.bindAll('.track-card', 'click', (e, el) => {
       const id = parseInt(el.dataset.id);
       if (this.props.onArm) this.props.onArm(id);
    });
  }
}

customElements.define('tape-deck', TapeDeck);