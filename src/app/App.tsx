import { playgrounds } from './playgrounds';
import { BeamTestPage } from '../beam';
import { DemoSetupPage } from '../demo';
import { Shell } from './Shell';
import { Crash } from './screens/MessageScreen';

// No address changes while the app runs (iPhone re-asks for the camera on each one).
// Developer pages are picked once, when the page loads: ?play=<track>, ?beam-test, ?demo-setup.
const params = new URLSearchParams(window.location.search);

function PlaygroundList() {
  return (
    <main style={{ padding: 16 }}>
      <h1 className="display">Playgrounds</h1>
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

export default function App() {
  if (params.has('play')) {
    const play = params.get('play') ?? '';
    if (play in playgrounds) {
      const Playground = playgrounds[play as keyof typeof playgrounds];
      return <Playground />;
    }
    return <PlaygroundList />;
  }
  if (params.has('beam-test')) return <BeamTestPage />;
  if (params.has('demo-setup')) return <DemoSetupPage />;
  return (
    <Crash>
      <Shell />
    </Crash>
  );
}
