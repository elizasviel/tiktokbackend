import { PrismaClient } from "@prisma/client";
import { YouTubeService } from "./services/youtube";
import { VideoSegmenter } from "./services/segmenter";
import { TranscriptionService } from "./services/transcription";
import { EmbeddingService } from "./services/embedding";
import { ProcessingPipeline } from "./services/pipeline";
import { QueryService } from "./services/query";
import { CacheService } from "./services/cache";
import { EventEmitter } from "events";
import { OpenAI } from "openai";

export class Application extends EventEmitter {
  private prisma: PrismaClient;
  private pipeline: ProcessingPipeline;
  private queryService: QueryService;

  constructor() {
    super();
    this.prisma = new PrismaClient();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const youtube = new YouTubeService(process.env.YOUTUBE_API_KEY!);
    const segmenter = new VideoSegmenter();
    const transcription = new TranscriptionService(openai);
    const embedding = new EmbeddingService(openai);
    const cache = new CacheService(this.prisma);

    this.pipeline = new ProcessingPipeline(
      youtube,
      segmenter,
      transcription,
      embedding,
      this.prisma,
      openai
    );

    this.queryService = new QueryService(this.prisma, embedding, cache);
  }

  async processVideo(youtubeId: string) {
    this.emit(`progress:${youtubeId}`, {
      status: "started",
      message: "Starting video processing",
    });

    return await this.pipeline.processVideo(youtubeId, (status) => {
      this.emit(`progress:${youtubeId}`, status);
    });
  }

  async query(searchQuery: string, limit?: number) {
    return await this.queryService.findSimilarSegments(searchQuery, limit);
  }

  async deleteAllVideos() {
    await this.prisma.cache.deleteMany({});
    await this.prisma.segment.deleteMany({});
    await this.prisma.video.deleteMany({});
  }
}

const app = new Application();
