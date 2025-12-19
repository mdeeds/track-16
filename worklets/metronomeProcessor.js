/**
 * An AudioWorkletProcessor that generates metronome clicks.
 * It produces a sine wave beep for each beat, with a higher frequency for the downbeat.
 * The timing and rhythm can be controlled via messages from the main thread.
 *
 * @class MetronomeProcessor
 * @extends AudioWorkletProcessor
 */
class MetronomeProcessor extends AudioWorkletProcessor {
  #bpm = 120;
  #beatsPerMeasure = 4;
  #startFrame = 0;
  #nextBeatFrame = 0;
  #beatCount = 0;
  #beepDurationFrames = 0;

  constructor() {
    super();
    this.port.onmessage = this.#handleMessage.bind(this);
    this.#recalculateBeepDuration();
  }

  /**
   * Recalculates the duration of the beep in frames.
   * This is called on initialization.
   */
  #recalculateBeepDuration() {
    const beepDurationSeconds = 0.02;
    // sampleRate is available in AudioWorkletGlobalScope
    this.#beepDurationFrames = beepDurationSeconds * sampleRate;
  }

  /**
   * Handles messages from the main thread to update metronome settings.
   * @param {MessageEvent} event
   */
  #handleMessage(event) {
    const { type, value } = event.data;
    if (type === 'update') {
      const { bpm, beatsPerMeasure, startFrame } = value;

      if (beatsPerMeasure !== undefined) {
        this.#beatsPerMeasure = beatsPerMeasure;
      }

      if (bpm !== undefined) {
        this.#bpm = bpm;
      }

      // If a new startFrame is provided, reset the metronome's timing sequence.
      if (startFrame !== undefined) {
        this.#startFrame = startFrame;
        this.#nextBeatFrame = startFrame;
        this.#beatCount = 0;

        console.log(`Current frame: ${currentFrame}, start frame: ${startFrame}`);
      }
    }
  }

  /**
   * Called by the browser's audio engine to generate audio data.
   * @param {Float32Array[][]} inputs - An array of inputs (not used).
   * @param {Float32Array[][]} outputs - An array of outputs to fill with audio data.
   * @returns {boolean} - Must return true to keep the processor alive.
   */
  process(inputs, outputs) {
    const output = outputs[0];
    const leftChannel = output[0];
    let rightChannel = null;
    if (output.length > 1) rightChannel = output[1];

    const framesPerBeat = (60 / this.#bpm) * sampleRate;

    for (let i = 0; i < leftChannel.length; i++) {
      const frame = currentFrame + i;

      // Check if it's time for the next beat.
      if (frame >= this.#nextBeatFrame) {
        // Schedule the next beat.
        this.#nextBeatFrame += framesPerBeat;
        // Increment beat count, wrapping around the measure.
        this.#beatCount = (this.#beatCount + 1) % this.#beatsPerMeasure;
      }
      // The beat count is always incremented one past where the beat is.
      const isDownbeat = (this.#beatCount === 1 && this.#beatsPerMeasure > 0);

      // The frame number of the beat that just happened or is about to happen.
      const lastBeatFrame = this.#nextBeatFrame - framesPerBeat;
      const framesSinceLastBeat = frame - lastBeatFrame;

      let sample = 0;
      // Generate audio only if we are within the beep's duration.
      if (framesSinceLastBeat >= 0 && framesSinceLastBeat < this.#beepDurationFrames) {
        // Use a higher frequency for the downbeat (beat 0).
        const frequency = isDownbeat ? 800 : 400;
        const phase = (framesSinceLastBeat / sampleRate) * frequency * 2 * Math.PI;
        sample = Math.sin(phase);
      }

      leftChannel[i] = sample;
      if (rightChannel) { rightChannel[i] = sample; }
    }

    return true;
  }
}

registerProcessor('metronome-processor', MetronomeProcessor);