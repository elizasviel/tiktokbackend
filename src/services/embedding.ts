import { OpenAI } from "openai";

export class EmbeddingService {
  private openai;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async createEmbedding(text: string) {
    try {
      console.log("Creating embedding for text length:", text.length);
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });
      console.log("Embedding created successfully");
      return response.data[0].embedding;
    } catch (error) {
      console.error("Embedding error:", error);
      throw error;
    }
  }
}
