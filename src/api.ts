import { Hono } from "hono";
import { cors } from "hono/cors";
import { Application } from "./app";

const app = new Hono();
const backend = new Application();

// Enable CORS
app.use("/*", cors());

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Process a YouTube video
app.post("/videos", async (c) => {
  try {
    const { youtubeId } = await c.req.json();

    if (!youtubeId) {
      return c.json({ error: "youtubeId is required" }, 400);
    }

    await backend.processVideo(youtubeId);
    return c.json({ status: "success", youtubeId });
  } catch (error) {
    console.error("Error processing video:", error);
    return c.json({ error: "Failed to process video" }, 500);
  }
});

// Search video segments
app.get("/search", async (c) => {
  try {
    const query = c.req.query("q");
    const limit = parseInt(c.req.query("limit") || "50");

    if (!query) {
      return c.json({ error: "Search query is required" }, 400);
    }

    const results = await backend.query(query, limit);
    return c.json({ results });
  } catch (error) {
    console.error("Error searching segments:", error);
    return c.json({ error: "Search failed" }, 500);
  }
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
