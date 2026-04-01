import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Interface for pluggable session storage (Memory, Redis, File, DB).
 */
export interface SessionStore {
  get(sessionId: string): Promise<any | null>;
  set(sessionId: string, data: any): Promise<void>;
  delete(sessionId: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Default in-memory session store.
 */
export class MemorySessionStore implements SessionStore {
  private store = new Map<string, any>();

  async get(sessionId: string): Promise<any | null> {
    return this.store.get(sessionId) || null;
  }

  async set(sessionId: string, data: any): Promise<void> {
    this.store.set(sessionId, data);
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Pro-grade local file session store for persistence across restarts.
 */
export class FileSessionStore implements SessionStore {
  private dir: string;

  constructor(dir: string = "./.sessions") {
    this.dir = path.resolve(dir);
  }

  private getPath(sessionId: string): string {
    return path.join(this.dir, `${sessionId}.json`);
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.dir, { recursive: true });
    } catch {}
  }

  async get(sessionId: string): Promise<any | null> {
    try {
      const data = await fs.readFile(this.getPath(sessionId), "utf8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(sessionId: string, data: any): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.getPath(sessionId), JSON.stringify(data), "utf8");
  }

  async delete(sessionId: string): Promise<void> {
    try {
      await fs.unlink(this.getPath(sessionId));
    } catch {}
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.dir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          await fs.unlink(path.join(this.dir, file));
        }
      }
    } catch {}
  }
}
