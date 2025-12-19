class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.isPlaying = false;
    this.playHead = 0;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'load') {
        this.buffer = e.data.buffer; // Float32Array
      } else if (e.data.type === 'play') {
        this.isPlaying = true;
        this.playHead = e.data.startSample || 0;
      } else if (e.data.type === 'stop') {
        this.isPlaying = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    if (this.isPlaying && this.buffer) {
      const channel = output[0];
      for (let i = 0; i < channel.length; i++) {
        if (this.playHead < this.buffer.length) {
          const sample = this.buffer[this.playHead];
          channel[i] = sample;
          // Mono to stereo copy
          if (output[1]) output[1][i] = sample;
          this.playHead++;
        } else {
          channel[i] = 0;
          if (output[1]) output[1][i] = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);