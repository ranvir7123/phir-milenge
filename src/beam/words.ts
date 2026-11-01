// Words on the beam screens, exactly as written in docs/plan/2-user-experience.md.

import type { CameraProblem } from './reader';

export const cameraWords: Record<CameraProblem, { title: string; body: string; warning: boolean; retry: boolean }> = {
  insecure: {
    title: 'Camera needs a secure address.',
    body: "This copy wasn't opened from the secure link, so the phone won't allow the camera. Open the link from the card instead, or use a file. Docs you wrote here won't appear there, so beam them or save a file first.",
    warning: true,
    retry: false,
  },
  blocked: {
    title: 'Camera is blocked.',
    body: isIPhone()
      ? 'To catch, Relay Docs needs the camera. Tap aA left of the web address, then Website Settings, then Camera, then Allow.'
      : 'To catch, Relay Docs needs the camera. Tap the icon left of the web address, then Camera, then Allow.',
    warning: true,
    retry: true,
  },
  none: {
    title: 'No camera found.',
    body: 'This device has no camera Relay Docs can use. Open a file instead, or beam from this device to a phone.',
    warning: true,
    retry: false,
  },
  busy: {
    title: 'The camera is busy.',
    body: 'Another app or tab is using it. Close that one, then try again.',
    warning: true,
    retry: true,
  },
  stopped: {
    title: 'The camera stopped.',
    body: 'Tap Carry on to keep catching.',
    warning: false,
    retry: true,
  },
  other: {
    title: 'The camera stopped.',
    body: 'Tap Carry on to keep catching.',
    warning: false,
    retry: true,
  },
};

export const words = {
  foreignCode: "That code isn't a doc. Point the camera at the screen that says Horn OK Please.",
  cantRead: "Can't read the code. Come closer and tilt away from the lights.",
  stillCantReadTitle: "Still can't read the code.",
  stillCantReadBody: "Hold both screens still, a hand's length apart, or use a file instead.",
};

function isIPhone(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
}
