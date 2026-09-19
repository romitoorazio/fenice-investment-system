import { copyFile, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export async function readJsonState<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return fallback;
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some Windows/filesystem combinations do not support directory fsync.
    // The data file itself is still fsynced before the atomic rename.
  }
}

/**
 * Crash-safe local state write for the Directa/Paper bridge.
 * A complete temp file is fsynced first, then renamed over the active state.
 * The previous valid state is retained as .bak for manual/recovery inspection.
 */
export async function writeJsonStateAtomic(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.bak`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  const temp = await open(tempPath, "wx");
  try {
    await temp.write(serialized);
    await temp.sync();
  } finally {
    await temp.close();
  }

  try {
    await copyFile(filePath, backupPath);
    const backup = await open(backupPath, "r+");
    try {
      await backup.sync();
    } finally {
      await backup.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  await rename(tempPath, filePath);
  await syncDirectory(directory);
}
