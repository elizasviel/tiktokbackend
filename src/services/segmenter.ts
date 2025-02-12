import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";

export class VideoSegmenter {
  async segmentVideo(videoPath: string, segmentDuration: number = 30) {
    console.log(`[Segmenter] Starting video segmentation for ${videoPath}`);
    console.log(`[Segmenter] Segment duration: ${segmentDuration} seconds`);

    const outputDir = path.join(process.cwd(), "temp", "segments");
    await fs.promises.mkdir(outputDir, { recursive: true });
    console.log(`[Segmenter] Created output directory: ${outputDir}`);

    const outputPattern = path.join(outputDir, "segment_%d.mp4");

    return new Promise<string[]>((resolve, reject) => {
      const segments: string[] = [];

      ffmpeg(videoPath)
        .outputOptions([
          `-f segment`,
          `-segment_time ${segmentDuration}`,
          `-reset_timestamps 1`,
        ])
        .output(outputPattern)
        .on("progress", (progress) => {
          console.log(
            `[Segmenter] Processing: ${Math.round(progress.percent ?? 0)}% done`
          );
        })
        .on("end", () => {
          const files = fs
            .readdirSync(outputDir)
            .filter((file) => file.startsWith("segment_"))
            .map((file) => path.join(outputDir, file));
          console.log(
            `[Segmenter] Successfully created ${files.length} segments`
          );
          resolve(files);
        })
        .on("error", (error) => {
          console.error(`[Segmenter] Error during segmentation:`, error);
          reject(error);
        })
        .run();
    });
  }

  async extractAudioFromSegment(segmentPath: string) {
    console.log(
      `[Segmenter] Extracting audio from segment: ${path.basename(segmentPath)}`
    );

    const outputDir = path.join(process.cwd(), "temp", "audio");
    await fs.promises.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(
      outputDir,
      `${path.basename(segmentPath)}.mp3`
    );

    return new Promise<string>((resolve, reject) => {
      ffmpeg(segmentPath)
        .toFormat("mp3")
        .output(outputPath)
        .on("progress", (progress) => {
          console.log(
            `[Segmenter] Audio extraction: ${Math.round(
              progress.percent ?? 0
            )}% done`
          );
        })
        .on("end", () => {
          console.log(`[Segmenter] Audio extraction complete: ${outputPath}`);
          resolve(outputPath);
        })
        .on("error", (error) => {
          console.error(`[Segmenter] Audio extraction error:`, error);
          reject(error);
        })
        .run();
    });
  }
}
