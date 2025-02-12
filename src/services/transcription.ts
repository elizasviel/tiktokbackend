import { OpenAI } from "openai";
import fs from "fs";
import path from "path";

export class TranscriptionService {
  private openai;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async transcribeAudio(audioPath: string) {
    try {
      console.log(
        `[Transcription] Starting transcription for: ${path.basename(
          audioPath
        )}`
      );
      console.log(
        `[Transcription] File size: ${(
          fs.statSync(audioPath).size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );

      const startTime = Date.now();
      const response = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath),
        model: "whisper-1",
      });

      const duration = Date.now() - startTime;
      console.log(`[Transcription] Completed in ${duration}ms`);
      console.log(
        `[Transcription] Text length: ${response.text.length} characters`
      );

      if (response.text.length < 10) {
        console.warn(`[Transcription] Warning: Very short transcript detected`);
      }

      return response;
    } catch (error) {
      console.error(`[Transcription] Error:`, error);
      throw error;
    }
  }
}
