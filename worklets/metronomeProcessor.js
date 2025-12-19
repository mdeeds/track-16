class MetronomeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bpm = 120;
    this.beatsPerBar = 4;
    this.currentSample = 0;
    this.isPlaying = false;
    this.volume = 0.5;

    this.port.onmessage = (e) => {
      if (e.data.type === 'update') {
        if (e.data.bpm) this.bpm = e.data.bpm;
        if (e.data.beatsPerBar) this.beatsPerBar = e.data.beatsPerBar;
        if (e.data.volume !== undefined) this.volume = e.data.volume;
      } else if (e.data.type === 'play') {
        this.isPlaying = true;
        this.currentSample = e.data.startSample || 0;
      } else if (e.data.type === 'stop') {
        this.isPlaying = false;
        this.currentSample = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];
    
    if (!this.isPlaying || !channel) return true;

    // sampleRate is a global in AudioWorkletGlobalScope
    const samplesPerBeat = (60 / this.bpm) * sampleRate;
    const samplesPerBar = samplesPerBeat * this.beatsPerBar;

    for (let i = 0; i < channel.length; i++) {
      const beatPosition = this.currentSample % samplesPerBeat;
      const barPosition = this.currentSample % samplesPerBar;
      
      // Simple click synthesis
      let sample = 0;
      
      // Accent on the one
      if (barPosition < 200) {
        sample = 0.8 * this.volume; 
      } else if (beatPosition < 200) {
         sample = 0.4 * this.volume;
      }
      
      // Decay
      if (barPosition < 2000 && barPosition >= 200) {
         sample = (0.8 - ((barPosition - 200) / 1800) * 0.8) * this.volume;
      } else if (beatPosition < 2000 && beatPosition >= 200) {
         sample = (0.4 - ((beatPosition - 200) / 1800) * 0.4) * this.volume;
      }

      channel[i] = sample;
      // Copy to other channels if stereo
      for (let c = 1; c < output.length; c++) {
        output[c][i] = sample;
      }

      this.currentSample++;
    }
    
    // Post current time back to main thread occasionally for UI updates
    if (this.currentSample % 5000 === 0) {
      this.port.postMessage({ type: 'time', sample: this.currentSample });
    }

    return true;
  }
}
registerProcessor('metronome-processor', MetronomeProcessor);