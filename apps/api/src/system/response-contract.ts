type OutputMode = 'guided' | 'advanced';

function unwrapOuterCodeFence(answer: string): string {
  const lines = answer.replace(/\r/g, '').split('\n');
  if (lines.length < 3) {
    return answer;
  }

  const first = lines[0].trim();
  const last = lines[lines.length - 1].trim();
  if (!first.startsWith('```') || !last.startsWith('```')) {
    return answer;
  }

  return lines.slice(1, -1).join('\n').trim();
}

function hasHeading(answer: string, heading: string): boolean {
  return new RegExp(`^##\\s+${heading}\\b`, 'im').test(answer);
}

function splitToBullets(input: string, maxItems: number): string[] {
  const cleaned = input
    .replace(/\r/g, '\n')
    .split('\n')
    .flatMap((line) => line.split('. '))
    .map((item) => item.trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const item of cleaned) {
    if (!unique.includes(item)) {
      unique.push(item);
    }
    if (unique.length >= maxItems) {
      break;
    }
  }

  return unique.length > 0 ? unique : ['No structured points returned'];
}

function toSection(title: string, bullets: string[]): string {
  return `## ${title}\n${bullets.map((item) => `- ${item}`).join('\n')}\n`;
}

export function enforceStructuredResponse(answer: string, mode: OutputMode): string {
  const trimmed = unwrapOuterCodeFence(answer.trim());
  if (!trimmed) {
    return '## Summary\n- No response generated\n';
  }

  if (mode === 'guided') {
    const required = ['Thesis', 'Catalysts', 'Risks', 'Decision'];
    const allPresent = required.every((heading) => hasHeading(trimmed, heading));
    if (allPresent) {
      return trimmed;
    }

    const bullets = splitToBullets(trimmed, 12);
    return [
      toSection('Thesis', bullets.slice(0, 3)),
      toSection('Catalysts', bullets.slice(3, 6)),
      toSection('Risks', bullets.slice(6, 9)),
      toSection('Decision', bullets.slice(9, 12))
    ].join('\n');
  }

  const advancedRequired = ['Summary', 'Thesis', 'Catalysts', 'Risks', 'Scenarios', 'Decision'];
  const advancedPresent = advancedRequired.every((heading) => hasHeading(trimmed, heading));
  if (advancedPresent) {
    return trimmed;
  }

  const bullets = splitToBullets(trimmed, 18);
  return [
    toSection('Summary', bullets.slice(0, 3)),
    toSection('Thesis', bullets.slice(3, 6)),
    toSection('Catalysts', bullets.slice(6, 9)),
    toSection('Risks', bullets.slice(9, 12)),
    toSection('Scenarios', bullets.slice(12, 15)),
    toSection('Decision', bullets.slice(15, 18))
  ].join('\n');
}
