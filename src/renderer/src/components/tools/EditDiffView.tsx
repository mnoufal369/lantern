import { diffLines } from 'diff'

interface Props {
  oldText: string
  newText: string
}

export default function EditDiffView({ oldText, newText }: Props): React.JSX.Element {
  const parts = diffLines(oldText, newText)
  return (
    <pre className="selectable overflow-x-auto rounded-md bg-deck-code p-2 font-mono text-[12px] leading-relaxed">
      {parts.map((part, i) => {
        const lines = part.value.replace(/\n$/, '').split('\n')
        return lines.map((line, j) => (
          <div
            key={`${i}-${j}`}
            className={
              part.added
                ? 'bg-diff-add text-diff-add-text'
                : part.removed
                  ? 'bg-diff-del text-diff-del-text'
                  : 'text-zinc-400'
            }
          >
            <span className="mr-2 inline-block w-3 select-none opacity-60">
              {part.added ? '+' : part.removed ? '-' : ' '}
            </span>
            {line}
          </div>
        ))
      })}
    </pre>
  )
}
