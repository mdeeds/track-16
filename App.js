
import { AppTab } from './types.js';
import { BaseComponent } from './components/BaseComponent.js';
import { audioEngine } from './services/audioEngine.js';
import { geminiService } from './services/geminiService.js';

const INITIAL_SONG_TEXT = `[Intro: 4]

[Verse 1: 8]

[Chorus: 8]
`;

export class AppRoot extends BaseComponent {
  constructor() {
    super();
    this.state = {
      activeTab: AppTab.SongSheet,
      logs: [],
      isAiLoading: false,
      currentTime: 0,
      songState: {
        bpm: 120,
        beatsPerBar: 4,
        sections: [],
        text: INITIAL_SONG_TEXT
      },
      tracks: Array.from({ length: 16 }, (_, i) => ({
        id: i + 1,
        name: `Track ${i + 1}`,
        armed: false,
        gainDB: 0,
        pan: 0,
        muted: false,
        soloed: false,
        hasAudio: false
      }))
    };
  }

  connectedCallback() {
    this.parseSongText(INITIAL_SONG_TEXT);
    
    // Init Gemini
    geminiService.isAvailable().then(avail => {
        if (!avail) this.addLog('system', "Gemini Nano is not detected. Use Chrome Canary.");
        else this.addLog('system', "Gemini Nano ready. Try 'Arm track 1'.");
    });

    // Audio Callbacks
    audioEngine.onTimeUpdate = (time) => {
        this.state.currentTime = time;
        const display = this.querySelector('#time-display');
        if (display) display.textContent = `${time.toFixed(2)}s`;
    };

    audioEngine.onTrackRecorded = (idx) => {
        const newTracks = [...this.state.tracks];
        newTracks[idx] = { ...newTracks[idx], hasAudio: true, armed: false };
        this.state.tracks = newTracks;
        this.addLog('system', `Recording finished on Track ${idx + 1}.`);
        this.render();
    };
    
    this.render();
  }

  addLog(sender, text) {
    this.state.logs = [...this.state.logs, { id: Date.now(), sender, text }];
    const chat = this.querySelector('chat-interface');
    if (chat) chat.props = { logs: this.state.logs, isLoading: this.state.isAiLoading, onSendMessage: this.handleAiMessage.bind(this) };
    else this.render();
  }

  parseSongText(text) {
    const lines = text.split('\n');
    const sections = [];
    let currentBar = 0;
    const regex = /^\[(.*?):\s*(\d+)\]$/;
    
    lines.forEach(line => {
        const match = line.trim().match(regex);
        if (match) {
            const bars = parseInt(match[2]);
            sections.push({ name: match[1], bars, startBar: currentBar });
            currentBar += bars;
        }
    });
    
    this.state.songState = { ...this.state.songState, text, sections };
  }

  async executeTool(toolObj) {
    const entries = Object.entries(toolObj);
    if (entries.length === 0) return;
    const [command, args] = entries[0];

    console.log("Executing:", command, args);

    switch (command) {
        case 'message':
            this.addLog('ai', args.text);
            break;
        case 'play':
            await audioEngine.init();
            audioEngine.play(args.start_section, args.last_section, this.state.songState.sections);
            this.addLog('system', `Playing...`);
            break;
        case 'stop':
            audioEngine.stop();
            this.addLog('system', "Stopped.");
            break;
        case 'arm':
            this.handleArmTrack(args.track_number);
            this.state.activeTab = AppTab.TapeDeck;
            this.addLog('system', `Track ${args.track_number} armed.`);
            this.render();
            break;
        case 'record':
            const armedTrack = this.state.tracks.find(t => t.armed);
            if (!armedTrack) {
                this.addLog('ai', "Please arm a track first.");
                return;
            }
            await audioEngine.init();
            audioEngine.record(armedTrack.id - 1);
            this.addLog('system', `Recording Track ${armedTrack.id}...`);
            break;
        case 'set_metronome_properties':
            if (args.volumeDB !== undefined) {
                audioEngine.updateMetronome(args.volumeDB);
                this.addLog('system', `Metronome volume ${args.volumeDB}dB.`);
            }
            break;
        case 'update_song_attributes':
            if (args.bpm) {
                this.state.songState.bpm = args.bpm;
                audioEngine.setBpm(args.bpm);
                this.addLog('system', `BPM set to ${args.bpm}.`);
                this.render();
            }
            break;
        case 'create_section':
            const newSect = `\n[${args.name}: ${args.bar_count}]\n${args.body || ''}\n`;
            this.parseSongText(this.state.songState.text + newSect);
            this.addLog('system', `Created section ${args.name}.`);
            this.state.activeTab = AppTab.SongSheet;
            this.render();
            break;
        case 'update_mixer_channel':
            this.handleUpdateTrack(args.channel, {
                gainDB: args.gainDB,
                muted: args.mute,
                soloed: args.solo
            });
            // Don't auto-switch tab for mixer updates to avoid jumpiness, 
            // unless explicitly asked? Prompt implied just doing it.
            // But if we are already on mixer, we don't want to re-render.
            if (this.state.activeTab !== AppTab.Mixer) {
                 this.state.activeTab = AppTab.Mixer;
                 this.render();
            }
            break;
    }
  }

  async handleAiMessage(text) {
    this.addLog('user', text);
    this.state.isAiLoading = true;
    const chat = this.querySelector('chat-interface');
    if (chat) chat.props = { ...chat.props, isLoading: true };

    try {
        if (!geminiService.session) {
            await geminiService.createSession(this.state.songState);
        }
        const tools = await geminiService.prompt(text);
        for (const tool of tools) await this.executeTool(tool);
    } catch (e) {
        this.addLog('system', `Error: ${e.message}`);
    } finally {
        this.state.isAiLoading = false;
        const chatEl = this.querySelector('chat-interface');
        if(chatEl) chatEl.props = { logs: this.state.logs, isLoading: false, onSendMessage: this.handleAiMessage.bind(this) };
    }
  }

  handleArmTrack(id) {
    this.state.tracks = this.state.tracks.map(t => ({
        ...t,
        armed: t.id === id ? !t.armed : false
    }));
    this.render();
  }

  handleUpdateTrack(id, updates) {
      // Update State
      this.state.tracks = this.state.tracks.map(t => {
          if (t.id === id) {
              if (updates.gainDB !== undefined) audioEngine.setTrackVolume(id - 1, updates.gainDB);
              return { ...t, ...updates };
          }
          return t;
      });

      // Update UI intelligently (avoid re-rendering Mixer if active to preserve slider focus)
      const mixer = this.querySelector('audio-mixer');
      if (mixer) {
          mixer._props.tracks = this.state.tracks; // Keep props in sync
          mixer.updateTrackUI(id, updates);
      } else {
          this.render();
      }
  }

  render() {
    const { activeTab, currentTime, logs, isAiLoading, songState, tracks } = this.state;

    this.innerHTML = `
      <div class="flex flex-col h-screen w-full">
        <div class="app-header flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
              <h1 class="text-xl font-bold app-title">Gemini 16-Track</h1>
              <button id="btn-new-tab" class="new-tab-btn text-xs" title="Open in new tab">↗ New Tab</button>
              <button id="btn-audio-init" class="new-tab-btn text-xs" title="Initialize Microphone">🎤 Connect Audio</button>
          </div>
          
          <div class="flex gap-4">
               <button id="btn-play" class="transport-btn btn-play">PLAY</button>
               <button id="btn-stop" class="transport-btn btn-stop">STOP</button>
               <button id="btn-rec" class="transport-btn btn-rec">REC</button>
          </div>

          <div id="time-display" class="font-mono text-xl time-display">
              ${currentTime.toFixed(2)}s
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <div class="flex-1 flex flex-col min-w-0">
             <div class="tab-bar flex">
                ${Object.values(AppTab).map(tab => `
                    <button class="tab-btn ${activeTab === tab ? 'active' : ''}" data-tab="${tab}">
                      ${tab.replace(/([A-Z])/g, ' $1').trim()}
                    </button>
                `).join('')}
             </div>

             <div id="main-content" class="flex-1 p-4 bg-gray-950 overflow-hidden relative"></div>
          </div>

          <chat-interface></chat-interface>
        </div>
      </div>
    `;

    // Events
    this.bind('#btn-new-tab', 'click', () => window.open(window.location.href, '_blank'));
    this.bind('#btn-audio-init', 'click', async () => {
        try {
            await audioEngine.initInput();
            const info = audioEngine.inputDeviceInfo;
            this.addLog('system', `Audio connected: ${info.label} (${info.sampleRate}Hz)`);
            // Refresh Metronome if active to show new info
            if (activeTab === AppTab.Metronome) {
                const el = this.querySelector('metronome-tool');
                if (el && typeof el.render === 'function') el.render();
            }
        } catch(e) {
            this.addLog('system', `Connection failed: ${e.message}`);
        }
    });

    this.bind('#btn-play', 'click', async () => { 
        await audioEngine.init(); 
        audioEngine.play(null, null, []); 
    });
    this.bind('#btn-stop', 'click', () => audioEngine.stop());
    this.bind('#btn-rec', 'click', () => {
         const armed = tracks.find(t => t.armed);
         if (armed) audioEngine.record(armed.id - 1);
         else alert("Arm a track first");
    });

    this.bindAll('.tab-btn', 'click', (e, el) => {
        this.state.activeTab = el.dataset.tab;
        this.render();
    });

    // Mount Sub-components
    const content = this.querySelector('#main-content');
    if (activeTab === AppTab.SongSheet) {
        const el = document.createElement('song-sheet');
        el.props = { songState, onUpdate: (txt) => this.parseSongText(txt) };
        content.appendChild(el);
    } else if (activeTab === AppTab.TapeDeck) {
        const el = document.createElement('tape-deck');
        el.props = { tracks, onArm: this.handleArmTrack.bind(this) };
        content.appendChild(el);
    } else if (activeTab === AppTab.Mixer) {
        const el = document.createElement('audio-mixer');
        el.props = { tracks, onUpdateTrack: this.handleUpdateTrack.bind(this) };
        content.appendChild(el);
    } else if (activeTab === AppTab.Metronome) {
        const el = document.createElement('metronome-tool');
        el.props = { bpm: songState.bpm, onBpmChange: (bpm) => {
            this.state.songState.bpm = bpm;
            audioEngine.setBpm(bpm);
            this.render();
        }};
        content.appendChild(el);
    }

    const chat = this.querySelector('chat-interface');
    chat.props = { logs, isLoading: isAiLoading, onSendMessage: this.handleAiMessage.bind(this) };
  }
}

customElements.define('app-root', AppRoot);
