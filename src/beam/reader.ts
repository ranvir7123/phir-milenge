// The camera and the code reader (docs/plan/3-how-its-built.md section 2.5).
// Reader order: the browser's own BarcodeDetector if it lists qr_code; otherwise the bundled
// barcode-detector package (ZXing as WebAssembly), its .wasm file served from our own site so it is
// saved for offline with the rest of the app.

import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

interface DetectedCode {
  rawValue: string;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<DetectedCode[]>;
}

interface DetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

export interface CodeReader {
  /** 'built-in' = the browser's own reader; 'bundled' = ZXing from our site. */
  kind: 'built-in' | 'bundled';
  read(source: HTMLVideoElement): Promise<string[]>;
}

const readers = new Map<boolean, Promise<CodeReader>>();

/** The reader to use. `bundledOnly` skips the browser's own (the beam test uses it to time ZXing on Android). */
export function getReader(bundledOnly = false): Promise<CodeReader> {
  let reader = readers.get(bundledOnly);
  if (!reader) {
    reader = makeReader(bundledOnly).catch((e: unknown) => {
      readers.delete(bundledOnly);
      throw e;
    });
    readers.set(bundledOnly, reader);
  }
  return reader;
}

async function makeReader(bundledOnly: boolean): Promise<CodeReader> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (Native && !bundledOnly) {
    try {
      if ((await Native.getSupportedFormats()).includes('qr_code')) return wrap('built-in', new Native({ formats: ['qr_code'] }));
    } catch {
      // Fall through to the bundled reader.
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  await prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
  return wrap('bundled', new BarcodeDetector({ formats: ['qr_code'] }));
}

function wrap(kind: CodeReader['kind'], detector: Detector): CodeReader {
  return {
    kind,
    async read(source) {
      const found = await detector.detect(source);
      return found.map((f) => f.rawValue);
    },
  };
}

/** 'stopped' = the camera ended by itself mid-catch (a phone call, the screen locking). */
export type CameraProblem = 'insecure' | 'blocked' | 'none' | 'busy' | 'stopped' | 'other';

export class CameraError extends Error {
  constructor(readonly problem: CameraProblem) {
    super(problem);
  }
}

/** Opens one camera stream: the back camera on phones, the webcam on laptops, or the chosen camera. */
export async function openCamera(deviceId?: string): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError('insecure');
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('none');
  const video: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId } }
    : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: false });
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new CameraError('blocked');
    if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new CameraError('none');
    if (name === 'NotReadableError' || name === 'AbortError') throw new CameraError('busy');
    throw new CameraError('other');
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Reads codes from the video as fast as the reader returns results, never faster than the screen draws.
 * Returns a function that stops it.
 */
export function startScanning(
  video: HTMLVideoElement,
  reader: CodeReader,
  onCodes: (codes: string[], now: number) => void,
  onRead?: () => void,
): () => void {
  let running = true;
  const loop = async () => {
    while (running) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!running) break;
      if (video.readyState < 2 || video.videoWidth === 0) continue;
      try {
        const codes = await reader.read(video);
        onRead?.();
        if (running && codes.length) onCodes(codes, performance.now());
      } catch {
        // A frame the reader couldn't handle; try the next one.
      }
    }
  };
  void loop();
  return () => {
    running = false;
  };
}
