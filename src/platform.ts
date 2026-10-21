// Differences between the browser version and the installed desktop app (Tauri).

/** True inside the installed desktop app. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Saves a generated file. In the browser it downloads; in the desktop app it opens the
 * system "Save as" window, because desktop web views don't download files like a browser.
 * Resolves to false if the user cancels.
 */
export async function saveFile(fileName: string, data: BlobPart, type: string): Promise<boolean> {
  const blob = new Blob([data], { type });
  if (isDesktop) {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ]);
    const ext = fileName.split('.').pop() ?? '';
    const path = await save({
      defaultPath: fileName,
      filters: ext ? [{ name: `${ext.toUpperCase()} file`, extensions: [ext] }] : [],
    });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Asks the user to confirm an action. Uses a native dialog in the desktop app, where the
 * browser's built-in confirm box is not guaranteed to appear (macOS web views), and the
 * browser's box on the web.
 */
export async function askConfirm(message: string): Promise<boolean> {
  if (isDesktop) {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, { title: 'FilmOrganizer', kind: 'warning' });
  }
  return window.confirm(message);
}
