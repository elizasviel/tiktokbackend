import { PrismaClient } from "@prisma/client";

export class CacheService {
  constructor(private prisma: PrismaClient) {}

  async cacheQueryResults(query: string, segmentIds: string[]) {
    console.log(
      `[Cache] Storing ${segmentIds.length} results for query: "${query}"`
    );
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const result = await this.prisma.cache.create({
      data: {
        query,
        segments: segmentIds,
        expires_at: new Date(Date.now() + CACHE_DURATION),
      },
    });
    console.log(`[Cache] Successfully cached results with ID: ${result.id}`);
    return result;
  }

  async getQueryCache(query: string) {
    console.log(`[Cache] Looking up cache for query: "${query}"`);
    const result = await this.prisma.cache.findFirst({
      where: {
        query,
        expires_at: {
          gt: new Date(),
        },
      },
    });
    console.log(`[Cache] Cache ${result ? "hit" : "miss"}`);
    return result;
  }
}
