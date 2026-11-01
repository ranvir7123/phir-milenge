// The two moving parts every beam screen shares: the looping code, and the camera box that reads it.

import { useEffect, useRef, useState } from 'react';
import { drawQr, qrVersionFor } from './qr';
import { CameraError, getReader, listCameras, openCamera, startScanning, stopStream, type CameraProblem, type CodeReader } from './reader';
import type { BeamSender } from './sender';
import './beam.css';

/**
 * Shows the sender's frames one after another, `fps` a second, forever. The code is as big as its box
 * allows: the box's width, or with `fill` its width and height (the box then takes the free space).
 */
export function BeamCode({
  sender,
  fps,
  maxSize = Infinity,
  fill = false,
  onFrame,
}: {
  sender: BeamSender;
  fps: number;
  maxSize?: number;
  fill?: boolean;
  onFrame?(i: number): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [room, setRoom] = useState(0);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom(fill ? Math.min(el.clientWidth, el.clientHeight) : el.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [fill]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || room <= 0) return;
    const size = Math.min(room, maxSize);
    const version = qrVersionFor(sender.frameText(0).length);
    const start = performance.now();
    let shown = -1;
    let raf = 0;
    const tick = (now: number) => {
      const i = Math.floor(((now - start) * fps) / 1000);
      if (i !== shown) {
        shown = i;
        drawQr(c, sender.frameText(i), size, version);
        onFrameRef.current?.(i);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sender, fps, room, maxSize]);

  return (
    <div ref={box} className={fill ? 'beam-code-box fill' : 'beam-code-box'}>
      <canvas ref={canvas} className="beam-code" aria-label="The moving code" />
    </div>
  );
}

export type CameraState = { kind: 'starting' } | { kind: 'on'; reader: CodeReader['kind'] } | { kind: 'problem'; problem: CameraProblem };

/**
 * One camera stream for the whole screen, reading codes into `onCodes`. Returns the camera view (with
 * corner marks) to place on screen, and the controls for it.
 */
export function useCamera({
  onCodes,
  onState,
  onRead,
  active = true,
  bundledOnly = false,
}: {
  onCodes(codes: string[], now: number): void;
  onState?(state: CameraState): void;
  onRead?(): void;
  active?: boolean;
  bundledOnly?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef({ onCodes, onState, onRead });
  handlers.current = { onCodes, onState, onRead };

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let stopScan = () => {};
    let cancelled = false;
    handlers.current.onState?.({ kind: 'starting' });
    (async () => {
      try {
        const [s, reader] = await Promise.all([openCamera(deviceId), getReader(bundledOnly)]);
        if (cancelled) {
          stopStream(s);
          return;
        }
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        setCameras(await listCameras());
        handlers.current.onState?.({ kind: 'on', reader: reader.kind });
        stopScan = startScanning(
          v,
          reader,
          (codes, now) => handlers.current.onCodes(codes, now),
          () => handlers.current.onRead?.(),
        );
        // The camera can stop by itself (a phone call, the screen locking).
        s.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (!cancelled) handlers.current.onState?.({ kind: 'problem', problem: 'stopped' });
        });
      } catch (e) {
        if (!cancelled) handlers.current.onState?.({ kind: 'problem', problem: e instanceof CameraError ? e.problem : 'other' });
      }
    })();
    return () => {
      cancelled = true;
      stopScan();
      stopStream(stream);
    };
  }, [deviceId, attempt, active, bundledOnly]);

  const switchCamera = () => {
    if (cameras.length < 2) return;
    const current = cameras.findIndex((c) => c.deviceId === (deviceId ?? currentDeviceId(video.current)));
    setDeviceId(cameras[(current + 1) % cameras.length]!.deviceId);
  };

  const view = (
    <div className="camera-box">
      <video ref={video} className="camera-video" playsInline muted autoPlay />
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
    </div>
  );

  return { view, canSwitch: cameras.length > 1, switchCamera, retry: () => setAttempt((a) => a + 1) };
}

function currentDeviceId(video: HTMLVideoElement | null): string | undefined {
  const stream = video?.srcObject as MediaStream | null;
  return stream?.getVideoTracks()[0]?.getSettings().deviceId;
}

/** The warning triangle, always followed by its words. */
export function WarnIcon() {
  return (
    <svg className="warn-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2 21h20L12 3Z" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 10v5" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.2" fill="var(--warning)" />
    </svg>
  );
}
