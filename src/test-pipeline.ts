import { Application } from "./app";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import assert from "assert";
import { OpenAI } from "openai";
dotenv.config();

async function cleanupDatabase() {
  const prisma = new PrismaClient();
  await prisma.cache.deleteMany({});
  await prisma.segment.deleteMany({});
  await prisma.video.deleteMany({});
  await prisma.$disconnect();
}

async function testPipeline() {
  try {
    console.log("Starting end-to-end test...\n");

    console.log("Testing OpenAI connection...");
    const isOpenAIWorking = await testOpenAIConnection();
    if (!isOpenAIWorking) {
      throw new Error("OpenAI connection test failed");
    }

    // Clean up database first
    console.log("Cleaning up database...");
    await cleanupDatabase();
    console.log("Database cleaned!\n");

    const app = new Application();

    // Test Case 1: Process multiple videos
    const videos = [
      {
        id: "jNQXAC9IVRw", // "Me at the zoo" - first YouTube video (56 seconds)
        title: "Me at the zoo",
      },
      {
        id: "dQw4w9WgXcQ", // Rick Astley - Never Gonna Give You Up
        title: "Never Gonna Give You Up",
      },
    ];

    for (const video of videos) {
      console.log(`Processing video: ${video.title}...`);
      await app.processVideo(video.id);
      console.log(`✓ Successfully processed ${video.title}\n`);
    }

    // Test Case 2: Multiple search queries
    const queries = [
      { text: "zoo animal", expectedVideo: "jNQXAC9IVRw" },
      { text: "never gonna give", expectedVideo: "dQw4w9WgXcQ" },
      { text: "music dance", expectedVideo: "dQw4w9WgXcQ" },
    ];

    for (const query of queries) {
      console.log(`Testing query: "${query.text}"...`);

      // First query - should hit database
      console.log("Executing first query (database search)...");
      const startTime = Date.now();
      const results = await app.query(query.text, 5);
      const queryTime = Date.now() - startTime;

      // Validate results
      assert(results.length > 0, `No results found for query: ${query.text}`);
      console.log(`Found ${results.length} results in ${queryTime}ms`);

      // Check if expected video is in results
      const hasExpectedVideo = results.some(
        (r) => r.video.youtube_id === query.expectedVideo
      );
      assert(
        hasExpectedVideo,
        `Expected video ${query.expectedVideo} not found in results`
      );

      // Test Case 3: Cache testing
      console.log("Testing cache with same query...");
      const cacheStartTime = Date.now();
      const cachedResults = await app.query(query.text, 5);
      const cacheQueryTime = Date.now() - cacheStartTime;

      // Verify cache is faster
      assert(
        cacheQueryTime < queryTime,
        "Cache query should be faster than original query"
      );
      console.log(
        `Cache query completed in ${cacheQueryTime}ms (${Math.round(
          ((queryTime - cacheQueryTime) / queryTime) * 100
        )}% faster)\n`
      );

      // Print detailed results
      console.log(`Top results for "${query.text}":`);
      results.slice(0, 3).forEach((segment, index) => {
        console.log(`\nResult ${index + 1}:`);
        console.log(`Video: ${segment.video.title}`);
        console.log(`YouTube ID: ${segment.video.youtube_id}`);
        console.log(`Time: ${segment.start_time}s - ${segment.end_time}s`);
        console.log(`Transcript: ${segment.transcript}`);
      });
      console.log("\n-------------------\n");
    }

    console.log("✓ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    throw error;
  } finally {
    // Clean up database after tests
    await cleanupDatabase();
  }
}

testPipeline().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

async function testOpenAIConnection() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: "test",
    });
    console.log("OpenAI connection successful!");
    return true;
  } catch (error) {
    console.error("OpenAI connection failed:", error);
    return false;
  }
}
