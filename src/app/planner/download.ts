/** Saves `text` as a file through the browser (a temporary link click). `bom` puts a byte-order mark first, so Excel reads UTF-8. */
export function download(filename: string, text: string, mime: string, bom = false): void {
  const blob = new Blob([bom ? '﻿' : '', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
