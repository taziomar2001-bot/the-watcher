import { AuthScreen } from './AuthScreen'

// First-run gate: the full auth experience with a "use without an account"
// escape hatch. All auth logic lives in AuthScreen (shared with Settings).
export function Welcome({ onSkip }: { onSkip: () => void }) {
  return <AuthScreen firstRun onClose={onSkip} onSkip={onSkip} />
}
