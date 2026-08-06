import { useEffect, useRef } from 'react'
import Transcript from './Transcript'
import Composer from './Composer'
import { useSessionsStore } from '@/stores/useSessionsStore'

export default function ChatView({ sessionId }: { sessionId: string }): React.JSX.Element {
  const entry = useSessionsStore((s) => s.sessions[sessionId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [entry?.blocks])

  if (!entry) {
    return <div className="flex-1" />
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
        className="selectable min-h-0 flex-1 overflow-y-auto px-6 py-4"
      >
        <Transcript blocks={entry.blocks} />
        {entry.blocks.length === 0 && (
          <p className="mt-16 text-center text-sm text-zinc-500">
            Send a message to start the agent in{' '}
            <span className="font-mono text-zinc-400">{entry.meta.cwd}</span>
          </p>
        )}
      </div>
      <Composer sessionId={sessionId} status={entry.meta.status} />
    </div>
  )
}
