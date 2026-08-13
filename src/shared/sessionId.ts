/** A Claude session id is a plain UUID v4-shaped string. */
const SESSION_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/**
 * Pulls a Claude session id out of whatever the user pasted — a bare UUID, a
 * quoted one, a `claude --resume <id>` line, or the path of a transcript file
 * under ~/.claude/projects. Returns null when the text holds no well-formed id.
 */
export function extractSessionId(input: string): string | null {
  const match = SESSION_UUID.exec(input)
  return match ? match[0].toLowerCase() : null
}
