import { PrismaClient } from "@prisma/client";
import { EmbeddingService } from "./embedding";
import { CacheService } from "./cache";

interface SegmentQueryResult {
  id: string;
  transcript: string;
  start_time: number;
  end_time: number;
  youtube_id: string;
  title: string;
  similarity: number;
  video: {
    id: string;
    youtube_id: string;
    title: string;
  };
}

export class QueryService {
  private prisma: PrismaClient;
  private embeddingService: EmbeddingService;
  private cacheService: CacheService;

  constructor(
    prisma: PrismaClient,
    embeddingService: EmbeddingService,
    cacheService: CacheService
  ) {
    this.prisma = prisma;
    this.embeddingService = embeddingService;
    this.cacheService = cacheService;
  }

  async findSimilarSegments(query: string, limit: number = 50) {
    console.log(`[Query] Starting search for: "${query}" (limit: ${limit})`);

    // Check cache first
    console.log(`[Query] Checking cache for query`);
    const cached = await this.cacheService.getQueryCache(query);

    if (cached) {
      console.log(`[Query] Cache hit! Returning cached results`);
      const results = await this.prisma.segment.findMany({
        where: {
          id: {
            in: cached.segments,
          },
        },
        include: {
          video: true,
        },
      });
      console.log(`[Query] Returned ${results.length} cached results`);
      return results;
    }

    console.log(`[Query] Cache miss. Performing vector search`);
    const startTime = Date.now();
    const queryVector = await this.embeddingService.createEmbedding(query);
    console.log(
      `[Query] Generated query embedding in ${Date.now() - startTime}ms`
    );

    const searchStartTime = Date.now();
    const segments = await this.prisma.$queryRaw<SegmentQueryResult[]>`
      SELECT 
        s.id,
        s.transcript,
        s.start_time,
        s.end_time,
        s.video_id,
        (s.vector <=> ${queryVector}::vector) as similarity,
        json_build_object(
          'id', v.id,
          'youtube_id', v.youtube_id,
          'title', v.title
        ) as video
      FROM "Segment" s
      JOIN "Video" v ON s.video_id = v.id
      ORDER BY similarity ASC
      LIMIT ${limit};
    `;
    console.log(
      `[Query] Vector search completed in ${Date.now() - searchStartTime}ms`
    );
    console.log(`[Query] Found ${segments.length} results`);

    // Cache the results
    console.log(`[Query] Caching search results`);
    await this.cacheService.cacheQueryResults(
      query,
      segments.map((s) => s.id)
    );

    console.log(`[Query] Total search time: ${Date.now() - startTime}ms`);
    return segments;
  }
}
