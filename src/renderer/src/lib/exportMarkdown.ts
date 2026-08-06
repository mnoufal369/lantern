import type { SessionMeta } from '@shared/types'
import type { TranscriptBlock } from './transcript'

function toolSection(block: TranscriptBlock & { kind: 'tool' }, depth: number): string {
  const indent = '  '.repeat(depth)
  const input = (block.input ?? {}) as Record<string, unknown>
  const lines: string[] = []

  if (block.toolName === 'Bash') {
    lines.push(`${indent}- ⚙️ Ran: \`${String(input.command ?? '')}\``)
    if (typeof block.output === 'string' && block.output.trim() !== '') {
      lines.push(`${indent}  <details><summary>Output</summary>\n\n\`\`\`\n${block.output.slice(0, 4000)}\n\`\`\`\n</details>`)
    }
  } else if (['Edit', 'Write', 'MultiEdit'].includes(block.toolName)) {
    lines.push(`${indent}- ✏️ ${block.toolName === 'Write' ? 'Created' : 'Edited'} \`${String(input.file_path ?? '')}\``)
  } else if (block.toolName === 'Task') {
    lines.push(`${indent}- ✨ Subagent: ${String(input.description ?? 'task')}`)
    for (const child of block.children) {
      if (child.kind === 'tool') {
        lines.push(toolSection(child, depth + 1))
      }
    }
  } else {
    lines.push(`${indent}- 🔧 ${block.toolName}`)
  }
  if (block.permission === 'denied') {
    lines.push(`${indent}  _(denied by user)_`)
  }
  return lines.join('\n')
}

export function transcriptToMarkdown(meta: SessionMeta, blocks: TranscriptBlock[]): string {
  const lines: string[] = [
    `# ${meta.title || 'dockPilot session'}`,
    '',
    `**Project:** \`${meta.cwd}\`  `,
    `**Date:** ${new Date(meta.createdAt).toLocaleString()}  `,
    `**Turns:** ${meta.stats.turns} · **Cost:** $${meta.stats.totalCostUsd.toFixed(3)}`,
    '',
    '---',
    ''
  ]

  for (const block of blocks) {
    switch (block.kind) {
      case 'user':
        lines.push(`### 🙋 You`, '', block.text, '')
        break
      case 'text':
        lines.push(`### 🤖 Agent`, '', block.text, '')
        break
      case 'tool':
        lines.push(toolSection(block, 0), '')
        break
      case 'todo':
        lines.push(
          '**Plan:**',
          ...block.items.map((item) => `- [${item.status === 'completed' ? 'x' : ' '}] ${item.text}`),
          ''
        )
        break
      case 'turn':
        lines.push(`> ✓ turn done · $${block.costUsd.toFixed(3)}`, '')
        break
      case 'error':
        lines.push(`> ⚠️ ${block.message}`, '')
        break
      default:
        break
    }
  }

  lines.push('---', '', '_Exported from dockPilot_')
  return lines.join('\n')
}
