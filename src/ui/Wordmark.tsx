/** The app's name as its logo: a small wide "THE" over a heavy gold-gradient
 *  "WATCHER", crossed by a faint violet orbit with a tiny sun. */
export function Wordmark({ size = 44, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`wordmark ${className}`} style={{ ['--wm' as string]: `${size}px` }} role="img" aria-label="The Watcher">
      <span className="wordmark-the" aria-hidden="true">THE</span>
      <span className="wordmark-main" aria-hidden="true">WATCHER</span>
      <span className="wordmark-orbit" aria-hidden="true" />
      <span className="wordmark-sun" aria-hidden="true" />
    </div>
  )
}
