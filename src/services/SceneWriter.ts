import type { Scene } from '../domain/scene';
// A flush drains to the newest state, including Undo while an older write is pending.
export class SceneWriter {
  private latest: Scene | null = null;
  private saved = '';
  private flight: Promise<void> | null = null;
  constructor(private write: (scene: Scene) => Promise<void>) {}
  reset(scene: Scene) {
    this.latest = scene;
    this.saved = JSON.stringify(scene);
  }
  update(scene: Scene) {
    this.latest = scene;
  }
  get dirty() {
    return !!this.latest && JSON.stringify(this.latest) !== this.saved;
  }
  get pending() {
    return !!this.flight;
  }
  flush(): Promise<void> {
    if (this.flight) return this.flight;
    const drain = async () => {
      while (this.latest && JSON.stringify(this.latest) !== this.saved) {
        const snapshot = this.latest,
          raw = JSON.stringify(snapshot);
        await this.write(snapshot);
        this.saved = raw;
      }
    };
    this.flight = drain().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
}
