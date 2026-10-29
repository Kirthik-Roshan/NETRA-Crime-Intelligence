"use client";

export const CCTV_MAX_VIDEO_BYTES = 8 * 1024 * 1024;
export const CCTV_MAX_DURATION_SECONDS = 30;
export const CCTV_MAX_FRAMES = 8;

const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export interface SelectedVideo {
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
}

export interface ExtractedVideoFrame {
  index: number;
  timestamp: number;
  data: string;
  width: number;
  height: number;
}

function videoEvent(video: HTMLVideoElement, event: "loadedmetadata" | "seeked", timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error(`Video ${event} timed out.`)), timeoutMs);
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      video.removeEventListener(event, onReady);
      video.removeEventListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(new Error("The browser could not decode this video."));
    video.addEventListener(event, onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

export async function inspectVideo(file: File): Promise<SelectedVideo> {
  const extensionAllowed = /\.(mp4|webm|mov)$/i.test(file.name);
  if ((!VIDEO_MIMES.has(file.type) && !extensionAllowed) || !file.size) {
    throw new Error("Select a valid MP4, WebM, or MOV CCTV clip.");
  }
  if (file.size > CCTV_MAX_VIDEO_BYTES) {
    throw new Error(`The CCTV clip must be ${CCTV_MAX_VIDEO_BYTES / 1024 / 1024} MB or smaller for audited Stratus archival.`);
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    if (video.readyState < 1) await videoEvent(video, "loadedmetadata");
    const duration = Number(video.duration);
    if (!Number.isFinite(duration) || duration < 1) throw new Error("The CCTV clip must be at least one second long.");
    if (duration > CCTV_MAX_DURATION_SECONDS + 0.05) {
      throw new Error(`Use a clip of ${CCTV_MAX_DURATION_SECONDS} seconds or less.`);
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("The video has no decodable image track.");
    return { file, url, duration, width: video.videoWidth, height: video.videoHeight };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function sampleTimestamps(duration: number): number[] {
  const safeDuration = Math.max(1, Math.min(CCTV_MAX_DURATION_SECONDS, duration));
  const count = Math.min(CCTV_MAX_FRAMES, Math.max(4, Math.ceil(safeDuration / 1.5)));
  const start = Math.min(0.6, safeDuration * 0.12);
  const end = Math.max(start, safeDuration - Math.min(0.4, safeDuration * 0.08));
  if (count === 1 || end <= start) return [Number((safeDuration / 2).toFixed(3))];
  return Array.from({ length: count }, (_, index) => Number((start + ((end - start) * index) / (count - 1)).toFixed(3)));
}

export async function extractVideoFrames(
  source: SelectedVideo,
  onProgress?: (complete: number, total: number) => void,
): Promise<ExtractedVideoFrame[]> {
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = source.url;
  if (video.readyState < 1) await videoEvent(video, "loadedmetadata");

  const scale = Math.min(1, 960 / video.videoWidth, 540 / video.videoHeight);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot create CCTV evidence frames.");

  const timestamps = sampleTimestamps(source.duration);
  const frames: ExtractedVideoFrame[] = [];
  try {
    for (const [index, timestamp] of timestamps.entries()) {
      if (Math.abs(video.currentTime - timestamp) > 0.015) {
        video.currentTime = timestamp;
        await videoEvent(video, "seeked");
      }
      context.drawImage(video, 0, 0, width, height);
      frames.push({
        index,
        timestamp,
        data: canvas.toDataURL("image/jpeg", 0.78),
        width,
        height,
      });
      onProgress?.(index + 1, timestamps.length);
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The CCTV source clip could not be read."));
    reader.readAsDataURL(file);
  });
}
