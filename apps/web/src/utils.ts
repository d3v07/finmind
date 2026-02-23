export function formatTimestamp(isoDate: string): string {
  return new Date(isoDate).toLocaleString();
}

export function abbreviateId(input: string): string {
  if (input.length <= 10) {
    return input;
  }

  return `${input.slice(0, 6)}...${input.slice(-4)}`;
}
