import { YouTubeService } from "./youtube";
import { VideoSegmenter } from "./segmenter";
import { TranscriptionService } from "./transcription";
import { EmbeddingService } from "./embedding";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { OpenAI } from "openai";

export class ProcessingPipeline {
  constructor(
    private youtube: YouTubeService,
    private segmenter: VideoSegmenter,
    private transcription: TranscriptionService,
    private embedding: EmbeddingService,
    private prisma: PrismaClient,
    private openai: OpenAI
  ) {}

  async processVideo(youtubeId: string, onProgress: (status: any) => void) {
    try {
      onProgress({ status: "fetching", message: "Fetching video details" });
      const details = await this.youtube.getVideoDetails(youtubeId);
      if (!details || !details.snippet) {
        throw new Error("Video details not found");
      }
      console.log(
        `[Pipeline] Retrieved video title: "${details.snippet.title}"`
      );

      // Check if video exists
      console.log(`[Pipeline] Checking if video exists in database`);
      let video = await this.prisma.video.findUnique({
        where: { youtube_id: youtubeId },
      });

      if (!video) {
        console.log(`[Pipeline] Creating new video record in database`);
        video = await this.prisma.video.create({
          data: {
            youtube_id: youtubeId,
            title: details.snippet.title || "Untitled",
          },
        });
      }

      // 2. Download video
      onProgress({ status: "downloading", message: "Downloading video" });
      const tempDir = path.join(process.cwd(), "temp");
      await fs.promises.mkdir(tempDir, { recursive: true });
      const videoPath = path.join(tempDir, `${youtubeId}.mp4`);
      execSync(
        `yt-dlp -f 'best[height<=720]' -o "${videoPath}" https://youtube.com/watch?v=${youtubeId}`
      );
      console.log(`[Pipeline] Video downloaded successfully to ${videoPath}`);

      // 3. Segment video - Modified to handle segmentation progress
      onProgress({
        status: "segmenting",
        message: "Starting video segmentation",
      });
      const segments = await this.segmenter.segmentVideo(
        videoPath,
        (progress) => {
          onProgress({
            status: "segmenting",
            message: `Segmenting video`,
            progress: progress,
          });
        }
      );
      console.log(`[Pipeline] Created ${segments.length} segments`);

      // 4. Process each segment - Modified status message
      for (let i = 0; i < segments.length; i++) {
        onProgress({
          status: "transcribing", // Changed from processing_segment
          message: `Transcribing segment ${i + 1}/${segments.length}`,
          progress: ((i + 1) / segments.length) * 100,
        });
        const segmentPath = segments[i];

        console.log(`[Pipeline] Extracting audio from segment ${i + 1}`);
        const audioPath = await this.segmenter.extractAudioFromSegment(
          segmentPath
        );

        console.log(`[Pipeline] Transcribing segment ${i + 1}`);
        const transcription = await this.transcription.transcribeAudio(
          audioPath
        );

        // Generate a summary using OpenAI
        console.log(`[Pipeline] Generating summary for segment ${i + 1}`);
        const summary = await this.openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "Create a concise 2-line summary of the following transcript:",
            },
            {
              role: "user",
              content: transcription.text,
            },
          ],
          max_tokens: 100,
          temperature: 0.7,
        });

        console.log(`[Pipeline] Generating embedding for segment ${i + 1}`);
        const vector = await this.embedding.createEmbedding(transcription.text);

        console.log(`[Pipeline] Saving segment ${i + 1} to database`);
        await this.prisma.$executeRaw`
          INSERT INTO "Segment" (
            id,
            video_id,
            start_time,
            end_time,
            transcript,
            vector,
            created_at,
            summary
          )
          VALUES (
            gen_random_uuid(),
            ${video.id},
            ${i * 30},
            ${(i + 1) * 30},
            ${transcription.text},
            ${vector}::vector,
            NOW(),
            ${summary.choices[0].message.content}
          )
        `;

        console.log(
          `[Pipeline] Cleaning up temporary files for segment ${i + 1}`
        );
        await fs.promises.unlink(segmentPath);
        await fs.promises.unlink(audioPath);
      }

      console.log(`[Pipeline] Cleaning up downloaded video file`);
      await fs.promises.unlink(videoPath);
      onProgress({ status: "completed", message: "Processing completed" });
    } catch (error) {
      onProgress({ status: "error", message: (error as Error).message });
      throw error;
    }
  }
}
