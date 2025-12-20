
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
    this.addLog('system', "Studio initialized. Gemini Nano (Local) ready to assist.");

    audioEngine.onTimeUpdate = (time) => {
        this.state.currentTime = time;
        const display = this.querySelector('#time-display');
        if (display) display.textContent = `${time.toFixed(2)}s`;
    };

    audioEngine.onTrackRecorded = (idx) => {
        const newTracks = [...this.state.tracks];
        newTracks[idx] = { ...newTracks[idx], hasAudio: true, armed: false };
        this.state.tracks = newTracks;
        this.addLog('system', `Recording finalized on Track ${idx + 1}.`);
        this.render();
    };
    
    this.render();
  }

  addLog(sender, text) {
    this.state.logs = [...this.state.logs, { id: Date.now(), sender, text }];
    const chat = this.querySelector('chat-interface');
    if (chat) {
        chat.props = { logs: this.state.logs, isLoading: this.state.isAiLoading, onSendMessage: this.handleAiMessage.bind(this) };
    } else {
        this.render();
    }
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

  async executeCommand(item) {
    const { command, args, message } = item;
    if (message) this.addLog('ai', message);

    console.log("Studio Action:", command, args);

    switch (command) {
        case 'play':
            await audioEngine.init();
            audioEngine.play(args.start_section, null, this.state.songState.sections);
            break;
        case 'stop':
            audioEngine.stop();
            break;
        case 'arm':
            this.handleArmTrack(args.track_number);
            this.state.activeTab = AppTab.TapeDeck;
            this.render();
            break;
        case 'record':
            const armedTrack = this.state.tracks.find(t => t.armed);
            if (!armedTrack) {
                this.addLog('system', "Error: No tracks armed for recording.");
                return;
            }
            await audioEngine.init();
            audioEngine.record(armedTrack.id - 1);
            break;
        case 'set_bpm':
            if (args.bpm) {
                this.state.songState.bpm = args.bpm;
                audioEngine.setBpm(args.bpm);
                this.render();
            }
            break;
        case 'add_section':
            const newSect = `\n[${args.name}: ${args.bars}]\n`;
            const updatedText = this.state.songState.text + newSect;
            this.parseSongText(updatedText);
            this.state.activeTab = AppTab.SongSheet;
            this.render();
            break;
        case 'update_mixer':
            this.handleUpdateTrack(args.channel, {
                gainDB: args.gainDB,
                muted: args.mute,
                soloed: args.solo
            });
            break;
    }
  }

  async handleAiMessage(text) {
    this.addLog('user', text);
    this.state.isAiLoading = true;
    this.render(); // Ensure loading state shows

    try {
        const results = await geminiService.prompt(text, this.state.songState);
        if (Array.isArray(results)) {
            for (const item of results) {
                await this.executeCommand(item);
            }
        }
    } catch (e) {
        this.addLog('system', `Studio Error: ${e.message}`);
    } finally {
        this.state.isAiLoading = false;
        this.render();
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
      this.state.tracks = this.state.tracks.map(t => {
          if (t.id === id) {
              if (updates.gainDB !== undefined) audioEngine.setTrackVolume(id - 1, updates.gainDB);
              return { ...t, ...updates };
          }
          return t;
      });

      const mixer = this.querySelector('audio-mixer');
      if (mixer) {
          mixer._props.tracks = this.state.tracks;
          mixer.updateTrackUI(id, updates);
      } else {
          this.render();
      }
  }

  render() {
    const { activeTab, currentTime, logs, isAiLoading, songState, tracks } = this.state;

    this.innerHTML = `
      <div class="flex flex-col h-screen w-full bg-black">
        <div class="app-header flex items-center justify-between shrink-0">
          <div class="flex items-center gap-3">
              <h1 class="text-xl font-bold app-title">GEMINI STUDIO 16</h1>
              <div class="h-4 w-px bg-gray-700 mx-2"></div>
              <button id="btn-audio-init" class="new-tab-btn text-xs">🎤 CONNECT MIC</button>
          </div>
          
          <div class="flex gap-4">
               <button id="btn-play" class="transport-btn btn-play">PLAY</button>
               <button id="btn-stop" class="transport-btn btn-stop">STOP</button>
               <button id="btn-rec" class="transport-btn btn-rec">REC</button>
          </div>

          <div id="time-display" class="font-mono text-2xl time-display tabular-nums">
              ${currentTime.toFixed(2)}s
          </div>
        </div>

        <div class="flex flex-1 overflow-hidden">
          <div class="flex-1 flex flex-col min-w-0 bg-[#080808]">
             <div class="tab-bar flex">
                ${Object.values(AppTab).map(tab => `
                    <button class="tab-btn ${activeTab === tab ? 'active' : ''}" data-tab="${tab}">
                      ${tab.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}
                    </button>
                `).join('')}
             </div>

             <div id="main-content" class="flex-1 p-6 overflow-hidden relative"></div>
          </div>

          <chat-interface></chat-interface>
        </div>
      </div>
    `;

    this.bind('#btn-audio-init', 'click', async () => {
        try {
            await audioEngine.initInput();
            this.addLog('system', `Input connected: ${audioEngine.inputDeviceInfo.label}`);
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
         else this.addLog('system', "Error: Arm a track first.");
    });

    this.bindAll('.tab-btn', 'click', (e, el) => {
        this.state.activeTab = el.dataset.tab;
        this.render();
    });

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
