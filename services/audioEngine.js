
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.metronomeNode = null;
    this.metronomeGain = null;
    this.trackNodes = Array(16).fill(null);
    this.recorderNodes = Array(16).fill(null);
    this.gainNodes = Array(16).fill(null);
    
    // Storage for raw audio data (Float32Arrays)
    this.trackBuffers = Array(16).fill(null);

    this.isPlaying = false;
    this.isRecording = false;
    this.currentSample = 0;
    this.startTime = 0;
    this.animationFrameId = null;
    
    // State
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.metronomeVolume = 0.5; // Default linear volume
    
    // Input Monitoring
    this.inputStream = null;
    this.inputSource = null;
    this.analyser = null;
    this.inputDeviceInfo = { label: 'None', sampleRate: 0, deviceId: 'default' };
    
    this.currentInputDeviceId = 'default';
    this.currentOutputDeviceId = 'default';
    
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
    // The processor handles timing, but not volume or stopping (it runs on global frame).
    // We use a GainNode to control volume and start/stop (mute).
    this.metronomeNode = new AudioWorkletNode(this.ctx, 'metronome-processor');
    this.metronomeGain = this.ctx.createGain();
    this.metronomeGain.gain.value = 0; // Start muted
    this.metronomeNode.connect(this.metronomeGain);
    this.metronomeGain.connect(this.ctx.destination);

    // Initialize Tracks
    for (let i = 0; i < 16; i++) {
        // Playback Node
        this.trackNodes[i] = new AudioWorkletNode(this.ctx, 'playback-processor');
        const gain = this.ctx.createGain();
        gain.gain.value = 0.8;
        this.trackNodes[i].connect(gain);
        gain.connect(this.ctx.destination);
        this.gainNodes[i] = gain;
    }
  }

  startAudioContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  async getDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return { inputs: [], outputs: [] };
    }
    // Ensure we have permission to see labels if possible by checking if stream exists
    // If stream exists, we have permission.
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
        inputs: devices.filter(d => d.kind === 'audioinput'),
        outputs: devices.filter(d => d.kind === 'audiooutput')
    };
  }

  async setOutputDevice(deviceId) {
    this.currentOutputDeviceId = deviceId;
    if (this.ctx && typeof this.ctx.setSinkId === 'function') {
        try {
            await this.ctx.setSinkId(deviceId);
        } catch(e) {
            console.error("Failed to set output device", e);
        }
    } else {
        console.warn("setSinkId is not supported in this browser.");
    }
  }

  async initInput(deviceId = null) {
      if (!this.ctx) await this.init();
      this.startAudioContext();
      
      if (deviceId) {
          this.currentInputDeviceId = deviceId;
      }

      // Stop existing stream to release device or apply new constraints
      if (this.inputStream) {
          this.inputStream.getTracks().forEach(t => t.stop());
      }

      try {
          // Use exact deviceId if provided and not default, otherwise let browser choose default
          const constraintAudio = {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false
          };
          
          if (this.currentInputDeviceId && this.currentInputDeviceId !== 'default') {
              constraintAudio.deviceId = { exact: this.currentInputDeviceId };
          }

          this.inputStream = await navigator.mediaDevices.getUserMedia({ audio: constraintAudio });
          
          const track = this.inputStream.getAudioTracks()[0];
          const settings = track.getSettings();
          
          this.inputDeviceInfo = {
              label: track.label || 'Microphone',
              sampleRate: settings.sampleRate || this.ctx.sampleRate,
              deviceId: settings.deviceId
          };
          
          // Update current ID to matches what we actually got
          this.currentInputDeviceId = settings.deviceId;
          
          // Reconnect Source
          if (this.inputSource) this.inputSource.disconnect();
          this.inputSource = this.ctx.createMediaStreamSource(this.inputStream);
          
          // Reconnect Analyser
          if (!this.analyser) {
              this.analyser = this.ctx.createAnalyser();
              this.analyser.fftSize = 256; 
          }
          this.inputSource.connect(this.analyser);

          // Reconnect any active recorders (if we swap inputs while armed/recording)
          this.recorderNodes.forEach(node => {
              if (node) this.inputSource.connect(node);
          });

      } catch (e) {
          console.error("Input init failed", e);
          this.inputDeviceInfo = { label: 'Access Denied/Error', sampleRate: 0 };
      }
  }

  play(startSectionName, endSectionName, sectionMap) {
    this.startAudioContext();
    if (this.isPlaying) return;

    // Determine start sample (simplified: always 0 for now unless specific logic added)
    let startSample = 0; 
    
    // Sync Metronome
    // We align the metronome beat to the current time by sending a 'update' message with startFrame.
    const currentFrame = Math.round(this.ctx.currentTime * this.ctx.sampleRate);
    if (this.metronomeNode) {
        this.metronomeNode.port.postMessage({ 
            type: 'update', 
            value: { 
                bpm: this.bpm,
                startFrame: currentFrame
            } 
        });
    }
    if (this.metronomeGain) {
        this.metronomeGain.gain.setValueAtTime(this.metronomeVolume, this.ctx.currentTime);
    }

    this.isPlaying = true;
    this.startTime = this.ctx.currentTime;
    
    // Start playback nodes
    this.trackNodes.forEach(node => {
        if (node) node.port.postMessage({ type: 'play', startSample });
    });

    // Start UI loop since metronome processor doesn't send time back
    this._runTimeLoop();
  }

  _runTimeLoop() {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;
      const elapsed = now - this.startTime;
      if (this.onTimeUpdate) this.onTimeUpdate(elapsed);
      this.animationFrameId = requestAnimationFrame(() => this._runTimeLoop());
  }

  stop() {
    this.isPlaying = false;
    this.isRecording = false;
    
    if (this.metronomeGain) {
        this.metronomeGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    }

    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    // Stop playback nodes
    this.trackNodes.forEach(node => { if(node) node.port.postMessage({ type: 'stop' }) });
    
    // Stop recorders
    this.recorderNodes.forEach((node, idx) => {
        if (node) {
            node.port.postMessage({ type: 'stop' });
            node.disconnect();
            this.recorderNodes[idx] = null;
        }
    });
  }

  async record(trackIndex) {
    await this.initInput();
    if (!this.inputSource) return; 
    
    if (this.isRecording) return;
    
    const recorder = new AudioWorkletNode(this.ctx, 'recording-processor');
    this.inputSource.connect(recorder);

    this.recorderNodes[trackIndex] = recorder;
    
    recorder.port.onmessage = (e) => {
        if (e.data.type === 'audioData') {
            const buffer = new Float32Array(e.data.buffer);
            this.trackBuffers[trackIndex] = buffer;
            console.log(`Track ${trackIndex + 1} recorded: ${buffer.length} samples`);
            
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
    
    // If not playing, start playing logic (metronome etc)
    if (!this.isPlaying) {
        this.play();
    }
    
    recorder.port.postMessage({ type: 'record' });
  }

  setTrackVolume(index, db) {
    const linear = Math.pow(10, db / 20);
    if (this.gainNodes[index]) {
        this.gainNodes[index].gain.setTargetAtTime(linear, this.ctx.currentTime, 0.05);
    }
  }

  updateMetronome(volumeDB) {
     const linear = Math.pow(10, volumeDB / 20);
     this.metronomeVolume = linear;
     if (this.metronomeGain && this.isPlaying) {
         this.metronomeGain.gain.setTargetAtTime(linear, this.ctx.currentTime, 0.05);
     }
  }

  setBpm(bpm) {
      this.bpm = bpm;
      if (this.metronomeNode) {
          // New processor expects 'value' object
          this.metronomeNode.port.postMessage({ type: 'update', value: { bpm: bpm } });
      }
  }
}

export const audioEngine = new AudioEngine();
