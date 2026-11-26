// Alles, was vom Gerät abhängt: Dateien sichern, Speicher, Installation.

export type SaveResult = "shared" | "downloaded" | "cancelled";

/** Öffnet auf dem iPhone das Teilen-Menü („In Dateien sichern“, iCloud Drive …). Muss direkt aus einem Fingertipp kommen. */
export async function saveFile(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
      if ((e as DOMException).name === "NotAllowedError") throw new Error("iOS hat das Teilen abgelehnt. Bitte noch einmal tippen.");
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Bittet das System, die Daten nicht bei Speichermangel zu löschen. Eine Garantie ist das nicht. */
export async function requestPersistence(): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);
}

export function vibrate(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* nicht unterstützt */ }
}
