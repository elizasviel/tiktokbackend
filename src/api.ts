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

    // Start processing in the background
    backend.processVideo(youtubeId).catch((error) => {
      console.error("Background processing error:", error);
    });

    // Return immediately with success
    return c.json({ status: "processing", youtubeId });
  } catch (error) {
    console.error("Error initiating video processing:", error);
    return c.json({ error: "Failed to initiate video processing" }, 500);
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

// Modify the status endpoint
app.get("/status/:youtubeId", (c) => {
  const { youtubeId } = c.req.param();

  // Set up SSE headers
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  let cleanup: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      console.log(`Starting SSE stream for ${youtubeId}`); // Debug log

      // Send an initial heartbeat immediately
      controller.enqueue(": heartbeat\n\n");

      // Send heartbeat every 5 seconds
      const keepAlive = setInterval(() => {
        controller.enqueue(": heartbeat\n\n");
      }, 5000);

      // Listen for progress events
      const onProgress = (status: any) => {
        try {
          console.log(`Raw status received:`, status); // Keep this debug log

          // Handle both string messages and status objects
          let sanitizedStatus;

          if (typeof status === "string") {
            // Handle string messages from segmenter
            if (status.includes("[Segmenter] Processing:")) {
              const percentMatch = status.match(/(\d+)% done/);
              if (percentMatch) {
                sanitizedStatus = {
                  status: "segmenting", // Changed from processing_segment
                  message: `Segmenting video: ${percentMatch[1]}%`,
                  progress: parseFloat(percentMatch[1]),
                };
              }
            } else {
              sanitizedStatus = {
                status: "processing",
                message: status,
                progress: null,
              };
            }
          } else {
            // Handle regular status objects
            sanitizedStatus = {
              status: status.status || "unknown",
              message: status.message || "",
              progress:
                typeof status.progress === "number"
                  ? parseFloat(status.progress.toFixed(2))
                  : null,
            };
          }

          const data = JSON.stringify(sanitizedStatus);
          console.log(`Sending SSE message: ${data}`);
          controller.enqueue(`data: ${data}\n\n`);
        } catch (error) {
          console.error("Error sending status:", error);
        }
      };

      // Subscribe to progress events
      backend.on(`progress:${youtubeId}`, onProgress);
      console.log(`Subscribed to progress:${youtubeId}`); // Debug log

      // Store cleanup function
      cleanup = () => {
        console.log(`Cleaning up SSE stream for ${youtubeId}`); // Debug log
        clearInterval(keepAlive);
        backend.removeListener(`progress:${youtubeId}`, onProgress);
        controller.close();
      };

      // Handle stream end
      c.req.raw.signal?.addEventListener("abort", () => {
        console.log(`Stream aborted for ${youtubeId}`); // Debug log
        if (cleanup) cleanup();
      });
    },
    cancel() {
      console.log(`Stream cancelled for ${youtubeId}`); // Debug log
      if (cleanup) cleanup();
    },
  });

  return c.body(stream);
});

// Add this new endpoint after line 49
app.delete("/videos", async (c) => {
  try {
    await backend.deleteAllVideos();
    return c.json({ status: "success" });
  } catch (error) {
    console.error("Error deleting videos:", error);
    return c.json({ error: "Failed to delete videos" }, 500);
  }
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
  serverOptions: {
    // Increase timeouts significantly
    idleTimeout: 600000, // 10 minutes
    readTimeout: 600000, // 10 minutes
    writeTimeout: 600000, // 10 minutes
  },
};
