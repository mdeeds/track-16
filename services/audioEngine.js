
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.metronomeNode = null;
    this.metronomeGain = null;
    this.trackNodes = Array(16).fill(null);
    this.recorderNodes = Array(16).fill(null);
    this.gainNodes = Array(16).fill(null);
    
    // Storage for raw audio data.
    // Each track stores an object { left: Float32Array, right: Float32Array }
    this.trackBuffers = Array(16).fill(null);

    this.isPlaying = false;
    this.isRecording = false;
    this.recordingTracks = new Set(); // Track indices currently recording
    this.currentSample = 0;
    this.startTime = 0;
    this.animationFrameId = null;
    
    // State
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.metronomeVolume = 0.5; 
    
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
    
    // Initialize Buffers after we know sample rate
    // 5 minutes buffer
    const bufferSize = this.ctx.sampleRate * 60 * 5; 
    for(let i=0; i<16; i++) {
        this.trackBuffers[i] = {
            left: new Float32Array(bufferSize),
            right: new Float32Array(bufferSize)
        };
    }

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

      if (this.inputStream) {
          this.inputStream.getTracks().forEach(t => t.stop());
      }

      try {
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
          
          this.currentInputDeviceId = settings.deviceId;
          
          if (this.inputSource) this.inputSource.disconnect();
          this.inputSource = this.ctx.createMediaStreamSource(this.inputStream);
          
          if (!this.analyser) {
              this.analyser = this.ctx.createAnalyser();
              this.analyser.fftSize = 256; 
          }
          this.inputSource.connect(this.analyser);

          // Reconnect recorders if active
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

    // Schedule start slightly in the future for synchronization
    const now = this.ctx.currentTime;
    const playStartTime = now + 0.05; // 50ms scheduling delay
    const startFrame = Math.round(playStartTime * this.ctx.sampleRate);
    
    // Metronome Sync
    if (this.metronomeNode) {
        this.metronomeNode.port.postMessage({ 
            type: 'update', 
            value: { 
                bpm: this.bpm,
                startFrame: startFrame
            } 
        });
    }
    if (this.metronomeGain) {
        this.metronomeGain.gain.setValueAtTime(this.metronomeVolume, playStartTime);
    }

    this.isPlaying = true;
    this.startTime = playStartTime;
    
    // Start playback nodes
    this.trackNodes.forEach((node, i) => {
        if (node) {
            const buffer = this.trackBuffers[i];
            if (buffer) {
                // Send stereo buffers using new protocol
                node.port.postMessage({ 
                    type: 'set_buffers', 
                    data: { left: buffer.left, right: buffer.right } 
                });
            }
            // Send start command with frame-accurate start time
            node.port.postMessage({ 
                type: 'start', 
                data: { startFrame: startFrame, loop: false } 
            });
        }
    });

    this._runTimeLoop();
  }

  _runTimeLoop() {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;
      const elapsed = Math.max(0, now - this.startTime);
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
    
    // Stop recorders and notify completion
    this.recorderNodes.forEach((node, idx) => {
        if (node) {
            node.port.postMessage({ type: 'stop' });
            node.disconnect();
            this.recorderNodes[idx] = null;
            if (this.recordingTracks.has(idx)) {
                if (this.onTrackRecorded) this.onTrackRecorded(idx);
            }
        }
    });
    this.recordingTracks.clear();
  }

  async record(trackIndex) {
    await this.initInput();
    if (!this.inputSource) return; 
    
    if (this.recorderNodes[trackIndex]) return;
    
    this.isRecording = true;
    this.recordingTracks.add(trackIndex);
    
    const recorder = new AudioWorkletNode(this.ctx, 'recorder-worklet-processor');
    this.inputSource.connect(recorder);
    this.recorderNodes[trackIndex] = recorder;
    
    // If not playing, start playing to establish time base
    if (!this.isPlaying) {
        this.play();
    }
    
    recorder.port.onmessage = (e) => {
        const { left, right, frameNumber } = e.data;
        if (left && frameNumber !== undefined) {
             const playbackStartFrame = this.startTime * this.ctx.sampleRate;
             const relativeFrame = frameNumber - playbackStartFrame;
             
             // Handle both channels (mono source might produce silent right channel depending on hardware, 
             // but recorder processor duplicates if mono input)
             this.writeToBuffer(trackIndex, Math.round(relativeFrame), left, right);
        }
    };
  }

  writeToBuffer(trackIndex, startSample, leftData, rightData) {
      if (!this.trackBuffers[trackIndex]) {
          // Fallback if not init
           const bufferSize = this.ctx.sampleRate * 60 * 5;
           this.trackBuffers[trackIndex] = {
                left: new Float32Array(bufferSize),
                right: new Float32Array(bufferSize)
           };
      }
      
      const buffers = this.trackBuffers[trackIndex];
      const length = leftData.length;
      
      for (let i = 0; i < length; i++) {
          const pos = startSample + i;
          // Check bounds
          if (pos >= 0 && pos < buffers.left.length) {
              buffers.left[pos] = leftData[i];
              // If rightData exists use it, otherwise duplicate left (though recorder sends both)
              buffers.right[pos] = rightData ? rightData[i] : leftData[i];
          }
      }
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
          this.metronomeNode.port.postMessage({ type: 'update', value: { bpm: bpm } });
      }
  }
}

export const audioEngine = new AudioEngine();
