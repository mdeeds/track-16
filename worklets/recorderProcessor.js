const CHUNKS_PER_POST = 16;
// An AudioWorkletProcessor is given 128 frames per channel at a time.
const FRAMES_PER_CHUNK = 128;
const BUFFER_SIZE = CHUNKS_PER_POST * FRAMES_PER_CHUNK;

/**
 * An AudioWorkletProcessor that records incoming audio and posts it back to the main thread.
 * It processes stereo audio, but will downmix mono to stereo if needed.
 *
 * @class RecorderWorkletProcessor
 * @extends AudioWorkletProcessor
 */
class RecorderWorkletProcessor extends AudioWorkletProcessor {
  /** @type {number} */
  #chunksWritten = 0;
  /** @type {Float32Array} */
  #leftBuffer = new Float32Array(BUFFER_SIZE);
  /** @type {Float32Array} */
  #rightBuffer = new Float32Array(BUFFER_SIZE);
  /** @type {number} */
  #firstFrameNumber = -1;

  constructor() {
    super();
    // The processor is always active and posting messages.
  }

  /**
   * Called by the browser's audio engine to process audio data.
   * @param {Float32Array[][]} inputs - An array of inputs, each with an array of channels.
   * @returns {boolean} - Must return true to keep the processor alive.
   */
  process(inputs) {
    // The processor is always "recording". We just need to check if there's any input to process.
    if (!inputs || inputs.length === 0 || inputs[0].length === 0) {
      return true;
    }

    if (this.#chunksWritten === 0) {
      this.#firstFrameNumber = currentFrame;
    }

    const offset = this.#chunksWritten * FRAMES_PER_CHUNK;

    // Sum all inputs and channels. Even channels go to left, odd to right.
    // The Float32Arrays are initialized to zero, so we can safely add to them.
    for (const input of inputs) {
      for (let channelIndex = 0; channelIndex < input.length; channelIndex++) {
        const channelData = input[channelIndex];
        const targetBuffer = (channelIndex % 2 === 0) ? this.#leftBuffer : this.#rightBuffer;
        for (let i = 0; i < channelData.length; i++) {
          targetBuffer[offset + i] += channelData[i];
        }
      }
    }

    this.#chunksWritten++;

    if (this.#chunksWritten === CHUNKS_PER_POST) {
      // Post our own buffers back to the main thread and transfer their ownership.
      this.port.postMessage({
        left: this.#leftBuffer,
        right: this.#rightBuffer,
        frameNumber: this.#firstFrameNumber
      }, [this.#leftBuffer.buffer, this.#rightBuffer.buffer]);

      // Prepare for the next batch
      this.#leftBuffer = new Float32Array(BUFFER_SIZE);
      this.#rightBuffer = new Float32Array(BUFFER_SIZE);
      this.#chunksWritten = 0;
    }

    return true;
  }
}

registerProcessor('recorder-worklet-processor', RecorderWorkletProcessor);