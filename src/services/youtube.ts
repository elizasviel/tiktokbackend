import { google } from "googleapis";

export class YouTubeService {
  private youtube;

  constructor(apiKey: string) {
    this.youtube = google.youtube({
      version: "v3",
      auth: apiKey,
    });
  }

  async getVideoDetails(videoId: string) {
    const response = await this.youtube.videos.list({
      part: ["snippet", "contentDetails"],
      id: [videoId],
    });

    return response.data.items?.[0];
  }
}
