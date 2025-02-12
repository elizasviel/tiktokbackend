import { Application } from "../src/app";
import dotenv from "dotenv";

dotenv.config();

async function seed() {
  try {
    console.log("Starting database seeding...");

    const app = new Application();

    // Test with a short video first
    const videoId = "jNQXAC9IVRw"; // First YouTube video ever (56 seconds)

    console.log(`Processing video ${videoId}...`);
    await app.processVideo(videoId);
    console.log("Video processing complete!");

    // Test semantic search
    console.log("\nTesting semantic search...");
    const searchResults = await app.query("zoo animals", 5);

    console.log("\nSearch results:");
    searchResults.forEach((result, index) => {
      console.log(`\nResult ${index + 1}:`);
      console.log(`Video: ${result.video.title}`);
      console.log(`Segment: ${result.start_time}s - ${result.end_time}s`);
      console.log(`Transcript: ${result.transcript}`);
    });
  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  }
}

seed();
