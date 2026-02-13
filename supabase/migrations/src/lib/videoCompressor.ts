// =============================================================================
// Work Orders — Browser Video Compressor (FFmpeg.wasm)
// =============================================================================
// Lazy-loads FFmpeg WASM (single-threaded, no SharedArrayBuffer needed).
// Compresses any video to H.264 MP4 at 720p — universally playable in all browsers.
// =============================================================================

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// CDN base for the single-threaded WASM core (no COOP/COEP headers required)
const CORE_VERSION = '0.12.6';
const CDN_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

/**
 * Lazy-load FFmpeg. Only downloads the ~30MB WASM binary on first use.
 * Subsequent calls reuse the loaded instance.
 */
async function ensureLoaded(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loadPromise) {
    ffmpeg = new FFmpeg();
    loadPromise = (async () => {
      const coreURL = await toBlobURL(`${CDN_BASE}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm');
      await ffmpeg!.load({ coreURL, wasmURL });
    })();
  }

  await loadPromise;
  return ffmpeg!;
}

export interface CompressOptions {
  /** Max height in pixels (width scales proportionally). Default: 720 */
  maxHeight?: number;
  /** CRF quality (0=lossless, 51=worst). Default: 28 (good for mobile uploads) */
  crf?: number;
  /** Preset speed/quality tradeoff. Default: 'fast' */
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'fast' | 'medium';
  /** Audio bitrate. Default: '128k' */
  audioBitrate?: string;
  /** Progress callback (0-100) */
  onProgress?: (percent: number) => void;
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  ratio: number; // e.g. 0.35 means 35% of original
}

/**
 * Returns true if the file is a video type that should be compressed.
 */
export function shouldCompress(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Compress a video file to H.264 MP4 in the browser.
 *
 * - Scales down to maxHeight (default 720p) if larger
 * - H.264 video + AAC audio = plays everywhere
 * - Runs entirely client-side via WebAssembly
 *
 * @returns A new File object with the compressed MP4
 */
export async function compressVideo(
  input: File,
  options: CompressOptions = {},
): Promise<CompressResult> {
  const {
    maxHeight = 720,
    crf = 28,
    preset = 'fast',
    audioBitrate = '128k',
    onProgress,
  } = options;

  const ff = await ensureLoaded();

  // Wire up progress reporting
  const progressHandler = onProgress
    ? ({ progress }: { progress: number }) => {
        onProgress(Math.min(100, Math.round(progress * 100)));
      }
    : null;

  if (progressHandler) {
    ff.on('progress', progressHandler);
  }

  const inputName = 'input' + getExtension(input.name);
  const outputName = 'output.mp4';

  // Write input file to FFmpeg virtual filesystem
  await ff.writeFile(inputName, await fetchFile(input));

  // Compress:
  // -i input        : source file
  // -c:v libx264    : H.264 codec (universal browser support)
  // -crf 28         : quality (lower = better, 28 is good for mobile)
  // -preset fast    : encoding speed
  // -vf scale=...   : scale down to maxHeight, keep aspect ratio
  //                   -2 ensures width is divisible by 2 (required by H.264)
  // -c:a aac        : AAC audio (universal support)
  // -b:a 128k       : audio bitrate
  // -movflags +faststart : optimize for web streaming
  // -y              : overwrite output
  await ff.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', preset,
    '-vf', `scale=-2:'min(${maxHeight},ih)'`,
    '-c:a', 'aac',
    '-b:a', audioBitrate,
    '-movflags', '+faststart',
    '-y',
    outputName,
  ]);

  // Read compressed output
  const data = await ff.readFile(outputName);
  // FFmpeg returns Uint8Array<ArrayBufferLike>; copy to plain ArrayBuffer for Blob compat
  const bytes = new Uint8Array(data as Uint8Array);
  const blob = new Blob([bytes.buffer], { type: 'video/mp4' });

  // Clean up virtual filesystem
  try {
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);
  } catch {
    // ignore cleanup errors
  }

  // Remove progress listener
  if (progressHandler) {
    ff.off('progress', progressHandler);
  }

  // Build result File with .mp4 extension
  const compressedName = input.name.replace(/\.[^.]+$/, '') + '.mp4';
  const compressedFile = new File([blob], compressedName, { type: 'video/mp4' });

  return {
    file: compressedFile,
    originalSize: input.size,
    compressedSize: compressedFile.size,
    ratio: compressedFile.size / input.size,
  };
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot) : '';
}
