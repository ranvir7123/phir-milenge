// Beam defaults. Set from the beam test on our real phones (docs/plan/beam-test-results.md);
// until its results are in, these are the plan's starting values.

import type { BeamSettings } from '../contracts';

export const beamSettings: BeamSettings = {
  pieceSize: 400,
  framesPerSecond: 8,
};

/** Bytes a second a catch really gets, misses included. The plan's estimate until the beam test measures it. */
export const BEAM_BYTES_PER_SECOND = 2 * 1024;

/** A beam longer than this asks "This doc is big for beaming." first. */
export const BIG_BEAM_SECONDS = 60;

/** About how long a payload of this many bytes takes to catch, in whole seconds (at least 1). */
export function beamSeconds(bytes: number): number {
  return Math.max(1, Math.round(bytes / BEAM_BYTES_PER_SECOND));
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function durationText(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}
