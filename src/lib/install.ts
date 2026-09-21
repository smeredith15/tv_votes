/**
 * The browser's own "install this app" prompt.
 *
 * Chrome and Edge fire an event when they judge a site installable, and it can
 * only be acted on later if it is kept. Safari has no such event — there the
 * only route is the share sheet, so the app says so instead.
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Hold on to it, so the offer can be made where it makes sense.
    event.preventDefault();
    deferred = event as InstallPrompt;
    announce();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    announce();
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

/** True when already running as an installed app rather than in a tab. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function install(): Promise<boolean> {
  if (!deferred) return false;
  const prompt = deferred;
  deferred = null;
  announce();

  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome === "accepted";
}
