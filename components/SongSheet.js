import { BaseComponent } from './BaseComponent.js';

export class SongSheet extends BaseComponent {
  render() {
    const text = this.props.songState?.text || '';
    
    this.innerHTML = `
      <div class="flex flex-col h-full p-4 song-sheet-container">
        <h2 class="text-xl font-bold mb-4" style="color: var(--text-secondary)">Song Sheet</h2>
        <div class="text-sm mb-2" style="color: var(--text-secondary)">
          Define sections like <code>[Intro: 8]</code>. Updates are saved automatically.
        </div>
        <textarea
          id="song-editor"
          class="flex-1 w-full song-textarea font-mono"
          placeholder="[Intro: 8]\nType lyrics or notes here...\n\n[Verse 1: 16]\n..."
          spellcheck="false"
        >${text}</textarea>
      </div>
    `;

    this.bind('#song-editor', 'input', (e) => {
      if (this.props.onUpdate) {
        this.props.onUpdate(e.target.value);
      }
    });
  }
}

customElements.define('song-sheet', SongSheet);