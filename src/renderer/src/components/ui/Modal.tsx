import { X } from 'lucide-react'
import { useEffect } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}

export default function Modal({ title, onClose, children, wide }: Props): React.JSX.Element {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className={`modal-in flex max-h-[85vh] w-full flex-col rounded-lg border border-deck-border bg-deck-panel shadow-[0_10px_32px_rgba(0,0,0,0.4)] ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between border-b border-deck-border px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
