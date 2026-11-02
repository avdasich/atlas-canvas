let guard: () => Promise<void> = async () => {};
export function installExitGuard(next: () => Promise<void>) {
  guard = next;
  return () => { if (guard === next) guard = async () => {}; };
}
export const flushBeforeExit = () => guard();
