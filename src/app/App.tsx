import { playgrounds } from './playgrounds';
import { BeamTestPage } from '../beam';
import { DemoSetupPage } from '../demo';

// No address changes while the app runs (iPhone re-asks for the camera on each one).
// Developer pages are picked once, when the page loads: ?play=<track>, ?beam-test, ?demo-setup.
const params = new URLSearchParams(window.location.search);

export default function App() {
  const play = params.get('play');
  if (play && play in playgrounds) {
    const Playground = playgrounds[play as keyof typeof playgrounds];
    return <Playground />;
  }
  if (params.has('beam-test')) return <BeamTestPage />;
  if (params.has('demo-setup')) return <DemoSetupPage />;

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}>Phir Milenge</h1>
      <p style={{ color: 'var(--quiet)' }}>The app shell is not built yet (track E). Playgrounds:</p>
      <ul>
        {Object.keys(playgrounds).map((name) => (
          <li key={name}>
            <a style={{ color: 'var(--beam)' }} href={`?play=${name}`}>
              {name}
            </a>
          </li>
        ))}
        <li>
          <a style={{ color: 'var(--beam)' }} href="?beam-test">
            beam test
          </a>
        </li>
        <li>
          <a style={{ color: 'var(--beam)' }} href="?demo-setup">
            demo setup
          </a>
        </li>
      </ul>
    </main>
  );
}
