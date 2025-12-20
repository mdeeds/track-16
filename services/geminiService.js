
// @ts-check
// Fix: Import GoogleGenAI and Type from @google/genai as required by guidelines
import { GoogleGenAI, Type } from "@google/genai";

export class ToolSchemas {
  /**
   * @param {string[]} sectionNames
   */
  getSchema(sectionNames) {
    // Fix: Use Type constants from @google/genai for responseSchema
    const sectionEnum = sectionNames.length > 0 
      ? { type: Type.STRING, enum: sectionNames } 
      : { type: Type.STRING };

    return {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          message: {
            description: "Send a message to the user.",
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING }
            },
            required: ["text"]
          },
          play: {
            description: "Plays the audio. Specify the start_section and last_section to play. If only start_section is provided, only that section will play.",
            type: Type.OBJECT,
            properties: {
              start_section: sectionEnum,
              last_section: sectionEnum,
              loop: { type: Type.BOOLEAN }
            },
            required: ["start_section"]
          },
          record: {
            description: "Record audio over part of the song. Specify the start_section and last_section to record over. If only start_section is provided, only that section will be recorded over.",
            type: Type.OBJECT,
            properties: {
              start_section: sectionEnum,
              last_section: sectionEnum
            },
            required: ["start_section"]
          },
          stop: {
            description: "Stop playback or recording.",
            type: Type.OBJECT,
            properties: {
              confirm: { type: Type.BOOLEAN, description: "Set to true to stop." }
            },
            required: ["confirm"]
          },
          arm: {
            description: "Arm a track for recording. The armed track is the one that will be recorded to.",
            type: Type.OBJECT,
            properties: {
              track_number: { type: Type.NUMBER, description: "The track index (1-16)" }
            },
            required: ["track_number"]
          },
          set_metronome_properties: {
            description: "Set the metronome volume. Volume is in decibels. -6 is normal.",
            type: Type.OBJECT,
            properties: {
              volumeDB: { type: Type.NUMBER }
            }
          },
          set_latency_compensation: {
            description: "Set the latency compensation for all tracks in seconds. This is used to align playback with the metronome.",
            type: Type.OBJECT,
            properties: {
              seconds: { type: Type.NUMBER }
            },
            required: ["seconds"]
          },
          update_song_attributes: {
            description: "Update the song's attributes, like BPM or time signature.",
            type: Type.OBJECT,
            properties: {
              bpm: { type: Type.NUMBER },
              beats_per_bar: { type: Type.NUMBER }
            }
          },
          create_section: {
            description: "Create a new section in the song.",
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              bar_count: { type: Type.NUMBER },
              body: { type: Type.STRING }
            },
            required: ["name", "bar_count"]
          },
          update_section: {
            description: "Update an existing section in the song.",
            type: Type.OBJECT,
            properties: {
              name: sectionEnum,
              bar_count: { type: Type.NUMBER },
              body: { type: Type.STRING }
            },
            required: ["name"]
          },
          update_mixer_channel: {
            description: "Update the settings for a mixer channel.",
            type: Type.OBJECT,
            properties: {
              channel: { type: Type.NUMBER },
              gainDB: { type: Type.NUMBER },
              levelDB: { type: Type.NUMBER },
              inputIsMono: { type: Type.BOOLEAN },
              pan: { type: Type.NUMBER },
              mute: { type: Type.BOOLEAN },
              solo: { type: Type.BOOLEAN },
            },
            required: ["channel"]
          }
        }
      }
    };
  }


  /**
   * @returns a string that describes the functions in getSchema.
   */
  getSchemaSummary() {
    const schema = this.getSchema([]).items;
    const tools = schema.properties;
    const summaryLines = [];

    for (const toolName of Object.getOwnPropertyNames(tools)) {
      const tool = tools[toolName];
      if (tool.properties) {
        let toolLine = "";
        if (tool.description) {
          toolLine += tool.description + ": ";
        }
        const requiredParams = new Set(tool.required || []);
        const paramNames = Object.keys(tool.properties);

        const paramsSummary = paramNames.map(param =>
          requiredParams.has(param) ? param : `[${param}]`
        ).join(', ');
        toolLine += `${toolName}{${paramsSummary}}`;
        summaryLines.push(toolLine);
      }
    }
    return summaryLines.join('\n');
  }
}

export class GeminiService {
  constructor() {
    this.toolSchemas = new ToolSchemas();
  }

  /**
   * Prompts Gemini with the user text and current song context.
   * @param {string} text User query
   * @param {any} songState Current app state
   */
  async prompt(text, songState) {
    // Fix: Initialize GoogleGenAI with API_KEY from process.env
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const sectionNames = songState.sections.map(s => s.name);
    
    const systemInstruction = `
      You are a professional Studio Assistant for a 16-track audio recorder.
      Current Song Context:
      - BPM: ${songState.bpm}
      - Sections: ${sectionNames.join(', ') || 'None'}
      
      Available Studio Commands:
      ${this.toolSchemas.getSchemaSummary()}
      
      Instructions:
      1. Analyze the user request.
      2. Respond ONLY with a valid JSON array of command objects.
      3. Each object must strictly follow the schema.
      4. Do not include markdown formatting or extra text.
    `;

    try {
      // Fix: Use ai.models.generateContent with 'gemini-3-flash-preview' and responseSchema
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: text,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: this.toolSchemas.getSchema(sectionNames)
        }
      });
            
      // Fix: Access response text using .text property
      const jsonStr = response.text.trim();
      
      const parsed = JSON.parse(jsonStr);
      const results = Array.isArray(parsed) ? parsed : [parsed];

      // Map tool output back to internal app command format
      return results.map(res => {
        const toolName = Object.keys(res).find(k => k !== 'message');
        if (toolName && res[toolName] && typeof res[toolName] === 'object') {
           return {
             command: toolName,
             args: res[toolName],
             message: res.message?.text || ""
           };
        }
        return {
          command: null,
          args: {},
          message: res.message?.text || ""
        };
      });

    } catch (e) {
      console.error("Gemini Studio Error:", e);
      return [{ 
        command: "error", 
        args: {}, 
        message: "Studio local brain error: " + e.message 
      }];
    }
  }
}

export const geminiService = new GeminiService();
