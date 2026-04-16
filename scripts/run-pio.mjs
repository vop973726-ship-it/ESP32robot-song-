import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const projectDir = process.argv[2];

if (!projectDir) {
  console.error("Usage: node scripts/run-pio.mjs <platformio-project-dir>");
  process.exit(1);
}

const repoRoot = process.cwd();
const platformioCoreDir = path.join(repoRoot, ".platformio");
const localPio = path.join(homedir(), ".local", "bin", "pio");

const candidates = [
  ["pio", ["run", "-d", projectDir]],
  ["python3", ["-m", "platformio", "run", "-d", projectDir]],
];

if (existsSync(localPio)) {
  candidates.push([localPio, ["run", "-d", projectDir]]);
}

for (const [command, args] of candidates) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      PLATFORMIO_CORE_DIR: platformioCoreDir,
    },
  });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }
}

console.error("PlatformIO executable not found. Install PlatformIO or expose `pio` in PATH.");
process.exit(1);
