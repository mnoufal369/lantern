import { useSessionsStore } from '@/stores/useSessionsStore'

interface QuickAction {
  label: string
  /** Sent immediately when set; otherwise `prefill` lands in the composer. */
  send?: string
  prefill?: string
}

const ACTIONS_BY_PROFILE: Record<string, QuickAction[]> = {
  prof_default_qa: [
    {
      label: '🧪 Generate test cases',
      send: "Generate a thorough set of test cases for this project's core flows. Cover happy paths, edge cases and negative tests. Present them as a table with: case, steps, expected result, priority."
    },
    {
      label: '🔍 What changed on this branch?',
      send: 'Compare this branch against the default branch. Explain what changed in user-facing terms and what could break. Point out anything that deserves focused regression testing.'
    },
    {
      label: '⚠️ Find risky areas',
      send: 'Scan this codebase for risky spots: missing validation, weak error handling, race conditions, unsafe assumptions. Report as a numbered list with severity and file.'
    },
    { label: '🐛 Draft a bug report', prefill: 'Draft a clear bug report for this: ' }
  ],
  prof_default_consultant: [
    {
      label: '📋 Product summary',
      send: 'Write an executive summary of this product: what it does, its main modules, integrations, and overall quality. Aimed at a business audience — clear, structured, no jargon.'
    },
    { label: '💬 A client asks…', prefill: 'A client asks: ' },
    {
      label: '⚖️ Risks & recommendations',
      send: 'Assess the technical risks of this codebase and give prioritized recommendations. Plain business language, ranked by impact.'
    }
  ],
  prof_default_explainer: [
    { label: '✨ Explain this app', send: 'Explain what this app does in simple, everyday words — like you would to a friend.' },
    { label: '🙋 Can it…?', prefill: 'Can this app ' },
    { label: '🗺️ Give me a tour', send: 'Give me a friendly tour of the main things this project can do, one thing at a time.' }
  ]
}

interface Props {
  sessionId: string
  profileId: string
  onPrefill: (text: string) => void
}

export default function QuickActions({ sessionId, profileId, onPrefill }: Props): React.JSX.Element | null {
  const sendMessage = useSessionsStore((s) => s.sendMessage)
  const actions = ACTIONS_BY_PROFILE[profileId]
  if (!actions) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-1 pt-2">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={() => {
            if (action.send) {
              void sendMessage(sessionId, action.send)
            } else if (action.prefill) {
              onPrefill(action.prefill)
            }
          }}
          className="rounded-full border border-deck-border bg-deck-panel px-3 py-1 text-[11.5px] text-zinc-400 transition-colors hover:border-deck-accent/60 hover:bg-deck-accent/10 hover:text-zinc-200"
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
