import { PrismaClient } from "@prisma/client";
import { YouTubeService } from "./services/youtube";
import { VideoSegmenter } from "./services/segmenter";
import { TranscriptionService } from "./services/transcription";
import { EmbeddingService } from "./services/embedding";
import { ProcessingPipeline } from "./services/pipeline";
import { QueryService } from "./services/query";
import { CacheService } from "./services/cache";

export class Application {
  private prisma: PrismaClient;
  private pipeline: ProcessingPipeline;
  private queryService: QueryService;

  constructor() {
    this.prisma = new PrismaClient();

    const youtube = new YouTubeService(process.env.YOUTUBE_API_KEY!);
    const segmenter = new VideoSegmenter();
    const transcription = new TranscriptionService(process.env.OPENAI_API_KEY!);
    const embedding = new EmbeddingService(process.env.OPENAI_API_KEY!);
    const cache = new CacheService(this.prisma);

    this.pipeline = new ProcessingPipeline(
      youtube,
      segmenter,
      transcription,
      embedding,
      this.prisma
    );

    this.queryService = new QueryService(this.prisma, embedding, cache);
  }

  async processVideo(youtubeId: string) {
    return await this.pipeline.processVideo(youtubeId);
  }

  async query(searchQuery: string, limit?: number) {
    return await this.queryService.findSimilarSegments(searchQuery, limit);
  }
}

const app = new Application();
