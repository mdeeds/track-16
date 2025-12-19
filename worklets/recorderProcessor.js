class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRecording = false;
    this.recordedBuffer = [];
    this.startSample = 0;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'arm') {
        // Prepare
      } else if (e.data.type === 'record') {
        this.isRecording = true;
        this.recordedBuffer = []; // Reset for this take
        this.startSample = e.data.startSample || 0;
      } else if (e.data.type === 'stop') {
        this.isRecording = false;
        // Send data back
        this.port.postMessage({ 
          type: 'audioData', 
          buffer: this.recordedBuffer,
          startSample: this.startSample 
        });
        this.recordedBuffer = [];
      }
    };
  }

  process(inputs, outputs, parameters) {
    // Pass audio through
    const input = inputs[0];
    const output = outputs[0];
    
    // Safety check
    if (!input || input.length === 0) return true;

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];
      if (outputChannel) {
        outputChannel.set(inputChannel);
      }
    }

    if (this.isRecording) {
      // Interleave or just take mono for simplicity in this demo, 
      // but let's try to capture channel 0
      const inputData = input[0];
      // We need to copy the float32 data. 
      // Accumulating in a JS array is memory inefficient but simple for short clips.
      // A better way is sending chunks.
      // We will send chunks every ~1 second (44100 samples)
      for (let i = 0; i < inputData.length; i++) {
        this.recordedBuffer.push(inputData[i]);
      }
    }

    return true;
  }
}
registerProcessor('recording-processor', RecorderProcessor);