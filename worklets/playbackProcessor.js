const FRAMES_PER_QUANTUM = 128;

/**
 * An AudioWorkletProcessor that plays back a given audio buffer in a loop.
 * The loop region can be controlled by k-rate AudioParams.
 *
 * @class PlaybackProcessor
 * @extends AudioWorkletProcessor
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  /** @type {Float32Array} */
  #leftBuffer = new Float32Array(0);
  /** @type {Float32Array} */
  #rightBuffer = new Float32Array(0);

  /** @type {boolean} Whether to loop playback. */
  #loop = false;
  /** @type {number} The `currentFrame` when playback should start. */
  #startFrame = -1;

  constructor() {
    super();
    this.port.onmessage = this.#handleMessage.bind(this);
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'loopStart',
        defaultValue: 0,
        minValue: 0,
        automationRate: 'k-rate'
      },
      {
        name: 'loopDuration',
        defaultValue: 0,
        minValue: 0,
        automationRate: 'k-rate'
      },
      {
        name: 'latencyCompensation',
        defaultValue: 0,
        minValue: 0,
        automationRate: 'k-rate'
      }
    ];
  }

  /**
   * @param {MessageEvent} event
   */
  #handleMessage(event) {
    const { type, data } = event.data;
    if (type === 'set_buffers') {
      this.#leftBuffer = data.left;
      this.#rightBuffer = data.right;
    } else if (type === 'start') {
      this.#startFrame = data.startFrame;
      this.#loop = data.loop;
    } else if (type === 'stop') {
      this.#startFrame = -1;
    }
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   * @returns {boolean}
   */
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const leftChannel = output[0];
    const rightChannel = output.length > 1 ? output[1] : null;

    if (this.#startFrame === -1 || this.#leftBuffer.length === 0) {
      // Not started or no buffer, output silence.
      return true;
    }

    const loopStartParam = parameters.loopStart[0];
    const loopDurationParam = parameters.loopDuration[0];
    const latencyCompensationParam = parameters.latencyCompensation[0];

    const loopStartFrame = Math.floor(loopStartParam * sampleRate);
    const loopDurationFrames = (loopDurationParam > 0)
      ? Math.floor(loopDurationParam * sampleRate)
      : this.#leftBuffer.length - loopStartFrame;

    if (loopDurationFrames <= 0) {
      return true; // Nothing to play.
    }

    const loopEndFrame = loopStartFrame + loopDurationFrames;
    const latencyCompensationFrames = Math.floor(latencyCompensationParam * sampleRate);


    for (let i = 0; i < FRAMES_PER_QUANTUM; i++) {
      const frame = currentFrame + i;

      if (frame < this.#startFrame) {
        // Haven't reached the start time yet.
        continue;
      }

      const framesSinceStart = frame - this.#startFrame;
      const compensatedLoopStartFrame = loopStartFrame + latencyCompensationFrames;
      let bufferFrameIndex = compensatedLoopStartFrame + framesSinceStart;

      if (this.#loop) {
        bufferFrameIndex = compensatedLoopStartFrame + (framesSinceStart % loopDurationFrames);
      }

      if (bufferFrameIndex < loopEndFrame) {
        leftChannel[i] = this.#leftBuffer[bufferFrameIndex] ?? 0;
        if (rightChannel) rightChannel[i] = this.#rightBuffer[bufferFrameIndex] || 0;
      }
    }

    return true;
  }
}

registerProcessor('playback-processor', PlaybackProcessor);