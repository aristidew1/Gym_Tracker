export async function copyText(text, {
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
} = {}) {
  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue with the WebView-compatible fallback.
  }

  if (!documentRef?.body || typeof documentRef.createElement !== 'function') return false;
  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  documentRef.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = documentRef.execCommand?.('copy') === true;
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}
