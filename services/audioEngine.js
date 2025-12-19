class AudioEngine {
  constructor() {
    this.ctx = null;
    this.metronomeNode = null;
    this.trackNodes = Array(16).fill(null);
    this.recorderNodes = Array(16).fill(null);
    this.gainNodes = Array(16).fill(null);
    
    // Storage for raw audio data (Float32Arrays)
    this.trackBuffers = Array(16).fill(null);

    this.isPlaying = false;
    this.isRecording = false;
    this.currentSample = 0;
    
    // State
    this.bpm = 120;
    this.beatsPerBar = 4;
    
    // Event callbacks
    this.onTimeUpdate = null;
    this.onTrackRecorded = null;
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Load Worklets
    try {
        await this.ctx.audioWorklet.addModule('./worklets/metronomeProcessor.js');
        await this.ctx.audioWorklet.addModule('./worklets/recorderProcessor.js');
        await this.ctx.audioWorklet.addModule('./worklets/playbackProcessor.js');
    } catch (e) {
        console.error("Failed to load audio worklets", e);
        throw e;
    }

    // Setup Metronome
    this.metronomeNode = new AudioWorkletNode(this.ctx, 'metronome-processor');
    this.metronomeNode.connect(this.ctx.destination);
    this.metronomeNode.port.onmessage = (e) => {
      if (e.data.type === 'time') {
        this.currentSample = e.data.sample;
        if (this.onTimeUpdate) {
            // Convert samples to bars/beats roughly for display
            this.onTimeUpdate(this.currentSample / this.ctx.sampleRate);
        }
      }
    };

    // Initialize Tracks
    for (let i = 0; i < 16; i++) {
        // Playback Node
        this.trackNodes[i] = new AudioWorkletNode(this.ctx, 'playback-processor');
        const gain = this.ctx.createGain();
        gain.gain.value = 0.8;
        this.trackNodes[i].connect(gain);
        gain.connect(this.ctx.destination);
        this.gainNodes[i] = gain;

        // Recorder Node (Input -> Recorder -> Destination (Muted usually))
        // We will connect mic later when arming
    }
  }

  startAudioContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(startSectionName, endSectionName, sectionMap) {
    this.startAudioContext();
    if (this.isPlaying) return;

    // Determine start sample based on section
    let startSample = 0;
    if (startSectionName) {
        // Logic to find section start
        // Simplified for now: just start at 0
    }

    this.isPlaying = true;
    if (this.metronomeNode) this.metronomeNode.port.postMessage({ type: 'play', startSample });
    
    this.trackNodes.forEach(node => {
        if (node) node.port.postMessage({ type: 'play', startSample });
    });
  }

  stop() {
    this.isPlaying = false;
    this.isRecording = false;
    if (this.metronomeNode) this.metronomeNode.port.postMessage({ type: 'stop' });
    this.trackNodes.forEach(node => { if(node) node.port.postMessage({ type: 'stop' }) });
    
    // If we were recording, we need to stop the recorders
    this.recorderNodes.forEach((node, idx) => {
        if (node) {
            node.port.postMessage({ type: 'stop' });
            // Clean up connection
            node.disconnect();
            this.recorderNodes[idx] = null;
        }
    });
  }

  async record(trackIndex) {
    this.startAudioContext();
    if (this.isRecording) return;
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.ctx.createMediaStreamSource(stream);
    
    const recorder = new AudioWorkletNode(this.ctx, 'recording-processor');
    source.connect(recorder);

    this.recorderNodes[trackIndex] = recorder;
    
    recorder.port.onmessage = (e) => {
        if (e.data.type === 'audioData') {
            const buffer = new Float32Array(e.data.buffer);
            this.trackBuffers[trackIndex] = buffer;
            console.log(`Track ${trackIndex + 1} recorded: ${buffer.length} samples`);
            
            // Send to playback node
            if (this.trackNodes[trackIndex]) {
                this.trackNodes[trackIndex].port.postMessage({
                    type: 'load',
                    buffer: buffer
                });
            }
            
            if (this.onTrackRecorded) this.onTrackRecorded(trackIndex);
        }
    };

    this.isRecording = true;
    this.isPlaying = true; // Recording implies playing usually
    
    // Start everyone
    if (this.metronomeNode) this.metronomeNode.port.postMessage({ type: 'play' });
    this.trackNodes.forEach(node => { if(node) node.port.postMessage({ type: 'play' }) });
    
    // Start specific recorder
    recorder.port.postMessage({ type: 'record' });
  }

  setTrackVolume(index, db) {
    // Convert dB to linear
    const linear = Math.pow(10, db / 20);
    if (this.gainNodes[index]) {
        this.gainNodes[index].gain.setTargetAtTime(linear, this.ctx.currentTime, 0.05);
    }
  }

  updateMetronome(volumeDB) {
     const linear = Math.pow(10, volumeDB / 20);
     if (this.metronomeNode) this.metronomeNode.port.postMessage({ type: 'update', volume: linear });
  }

  setBpm(bpm) {
      this.bpm = bpm;
      if (this.metronomeNode) this.metronomeNode.port.postMessage({ type: 'update', bpm: bpm });
  }
}

export const audioEngine = new AudioEngine();