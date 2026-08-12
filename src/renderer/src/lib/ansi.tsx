import Anser from 'anser'

/** Renders text containing ANSI escape codes as styled spans. */
export function ansiToSpans(text: string): React.ReactNode[] {
  const entries = Anser.ansiToJson(text, { json: true, remove_empty: true })
  return entries.map((entry, i) => {
    const style: React.CSSProperties = {}
    if (entry.fg) {
      style.color = `rgb(${entry.fg})`
    }
    if (entry.bg) {
      style.backgroundColor = `rgb(${entry.bg})`
    }
    if (entry.decoration === 'bold') {
      style.fontWeight = 600
    }
    return (
      <span key={i} style={style}>
        {entry.content}
      </span>
    )
  })
}
