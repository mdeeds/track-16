const TOOLS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      message: {
        description: "Send a message to the user.",
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"]
      },
      play: {
        description: "Plays the audio.",
        type: "object",
        properties: {
          start_section: { type: "string" }, // Enum injected dynamically
          last_section: { type: "string" },
          loop: { type: "boolean" }
        },
        required: ["start_section"]
      },
      record: {
        description: "Record audio.",
        type: "object",
        properties: {
          start_section: { type: "string" },
          last_section: { type: "string" }
        },
        required: ["start_section"]
      },
      stop: {
        description: "Stop playback or recording.",
        type: "object",
        properties: {}
      },
      arm: {
        description: "Arm a track for recording.",
        type: "object",
        properties: {
          track_number: { type: "number", minimum: 1, maximum: 16 }
        },
        required: ["track_number"]
      },
      set_metronome_properties: {
        description: "Set metronome volume dB.",
        type: "object",
        properties: { volumeDB: { type: "number" } }
      },
      update_song_attributes: {
        description: "Update song attributes.",
        type: "object",
        properties: {
          bpm: { type: "number" },
          beats_per_bar: { type: "number" }
        }
      },
      create_section: {
        description: "Create a new section.",
        type: "object",
        properties: {
          name: { type: "string" },
          bar_count: { type: "number" },
          body: { type: "string" }
        },
        required: ["name", "bar_count"]
      },
      update_mixer_channel: {
        description: "Update mixer channel.",
        type: "object",
        properties: {
          channel: { type: "number" },
          gainDB: { type: "number" },
          mute: { type: "boolean" },
          solo: { type: "boolean" }
        },
        required: ["channel"]
      }
    }
  }
};

export class GeminiService {
  constructor() {
    this.session = null;
  }

  async isAvailable() {
    if (!window.ai || !window.ai.languageModel) {
      return false;
    }
    const capabilities = await window.ai.languageModel.capabilities();
    return capabilities.available !== 'no';
  }

  async createSession(songState) {
    if (!await this.isAvailable()) throw new Error("Gemini Nano not available");

    const sectionNames = songState.sections.map(s => s.name);
    const systemPrompt = `
      You are an AI assistant for a 16-track audio recorder. 
      You help the user control the playback, recording, mixer, and song structure.
      Current Song Sections: ${sectionNames.join(', ')}.
      Current BPM: ${songState.bpm}.
      
      Respond ONLY with a JSON array of tool commands based on the user's request.
      Do not output markdown code blocks. Just the raw JSON.
      
      Schema: ${JSON.stringify(TOOLS_SCHEMA)}
    `;

    try {
        this.session = await window.ai.languageModel.create({
            systemPrompt: systemPrompt
        });
    } catch (e) {
        console.error("Failed to create session", e);
        throw e;
    }
  }

  async prompt(text) {
    if (!this.session) throw new Error("Session not initialized");
    
    // We can update the context if needed here, but Prompt API sessions preserve context.
    // If song structure changed significantly, we might need a new session or send a state update message first.
    
    try {
        const responseStr = await this.session.prompt(text);
        // Attempt to clean markdown if present (e.g. ```json ... ```)
        const cleanStr = responseStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanStr);
    } catch (e) {
        console.error("Gemini Error:", e);
        return [{ message: { text: "I encountered an error processing your request." } }];
    }
  }
}

export const geminiService = new GeminiService();
