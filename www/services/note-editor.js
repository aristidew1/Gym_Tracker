export function insertNotePrompt(value, prompt, selectionStart, selectionEnd, maxLength = Infinity) {
  const source = String(value || '');
  const start = Math.max(0, Math.min(Number(selectionStart) || 0, source.length));
  const end = Math.max(start, Math.min(Number(selectionEnd) || start, source.length));
  const prefix = start > 0 && source[start - 1] !== '\n' ? '\n' : '';
  const insertion = `${prefix}${prompt}`;
  const available = Math.max(0, maxLength - (source.length - (end - start)));
  const accepted = insertion.slice(0, available);
  return {
    value: `${source.slice(0, start)}${accepted}${source.slice(end)}`,
    cursor: start + accepted.length,
  };
}
