import { YouTubeService } from "./youtube";
import { VideoSegmenter } from "./segmenter";
import { TranscriptionService } from "./transcription";
import { EmbeddingService } from "./embedding";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export class ProcessingPipeline {
  constructor(
    private youtube: YouTubeService,
    private segmenter: VideoSegmenter,
    private transcription: TranscriptionService,
    private embedding: EmbeddingService,
    private prisma: PrismaClient
  ) {}

  async processVideo(youtubeId: string) {
    console.log(`[Pipeline] Starting processing for YouTube ID: ${youtubeId}`);
    try {
      // 1. Get video details
      console.log(`[Pipeline] Fetching video details for ${youtubeId}`);
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
      console.log(`[Pipeline] Downloading video from YouTube`);
      const tempDir = path.join(process.cwd(), "temp");
      await fs.promises.mkdir(tempDir, { recursive: true });
      const videoPath = path.join(tempDir, `${youtubeId}.mp4`);
      execSync(
        `yt-dlp -f 'best[height<=720]' -o "${videoPath}" https://youtube.com/watch?v=${youtubeId}`
      );
      console.log(`[Pipeline] Video downloaded successfully to ${videoPath}`);

      // 3. Segment video
      console.log(`[Pipeline] Starting video segmentation`);
      const segments = await this.segmenter.segmentVideo(videoPath);
      console.log(`[Pipeline] Created ${segments.length} segments`);

      // 4. Process each segment
      for (let i = 0; i < segments.length; i++) {
        console.log(
          `[Pipeline] Processing segment ${i + 1}/${segments.length}`
        );
        const segmentPath = segments[i];

        console.log(`[Pipeline] Extracting audio from segment ${i + 1}`);
        const audioPath = await this.segmenter.extractAudioFromSegment(
          segmentPath
        );

        console.log(`[Pipeline] Transcribing segment ${i + 1}`);
        const transcription = await this.transcription.transcribeAudio(
          audioPath
        );

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
            created_at
          )
          VALUES (
            gen_random_uuid(),
            ${video.id},
            ${i * 30},
            ${(i + 1) * 30},
            ${transcription.text},
            ${vector}::vector,
            NOW()
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
      console.log(`[Pipeline] Video processing completed successfully`);
    } catch (error) {
      console.error(`[Pipeline] Error processing video ${youtubeId}:`, error);
      throw error;
    }
  }
}
