import { flushPreferences } from './preferenceWrites';
let guard: () => Promise<void> = async () => {};
export function installExitGuard(next: () => Promise<void>) {
  guard = next;
  return () => {
    if (guard === next) guard = async () => {};
  };
}
export async function flushBeforeExit() {
  // Let an already-dispatched input/paste event commit before reading the scene.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await guard();
  await flushPreferences();
}
