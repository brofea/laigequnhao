import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS = {
  workerName: "laigequnhao",
  d1Name: "laigequnhao-prod",
  r2Name: "laigequnhao-assets-prod",
};

function setting(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function targetNames() {
  return {
    workerName: setting("CF_WORKER_NAME", DEFAULTS.workerName),
    d1Name: setting("CF_D1_NAME", DEFAULTS.d1Name),
    r2Name: setting("CF_R2_NAME", DEFAULTS.r2Name),
  };
}

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

function cleanOutput(value) {
  return value.replace(ansiPattern, "").trim();
}

function parseJsonOutput(output) {
  const clean = cleanOutput(output);
  const starts = [clean.indexOf("["), clean.indexOf("{")].filter((index) => index >= 0);
  if (starts.length === 0) {
    throw new Error("Wrangler did not return JSON output.");
  }
  const start = Math.min(...starts);
  return JSON.parse(clean.slice(start));
}

export async function wrangler(args, options = {}) {
  try {
    const result = await execFileAsync("pnpm", ["exec", "wrangler", ...args], {
      cwd: ROOT,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
    return { ...result, code: 0 };
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const wrapped = new Error(
      `wrangler ${args.join(" ")} failed (exit ${error.code ?? "unknown"}).\n${cleanOutput(output)}`,
    );
    wrapped.code = error.code;
    wrapped.stdout = error.stdout;
    wrapped.stderr = error.stderr;
    throw wrapped;
  }
}

async function listD1() {
  const result = await wrangler(["d1", "list", "--json"]);
  const parsed = parseJsonOutput(result.stdout);
  return Array.isArray(parsed) ? parsed : [];
}

function d1Id(entry) {
  return entry.uuid ?? entry.database_id ?? entry.id ?? null;
}

async function findD1(name) {
  const found = (await listD1()).find((entry) => entry.name === name);
  return found ? { name, id: d1Id(found), created: false } : null;
}

async function createD1(name) {
  const result = await wrangler(["d1", "create", name]);
  const output = cleanOutput(`${result.stdout}\n${result.stderr ?? ""}`);
  const id = output.match(/(?:database_id|uuid)["'\s:=]+([0-9a-f-]{16,})/i)?.[1];
  if (!id) {
    throw new Error(`D1 ${name} was created or reported ambiguously; no database ID was returned.`);
  }
  return { name, id, created: true };
}

async function findR2(name) {
  try {
    await wrangler(["r2", "bucket", "info", name, "--json"]);
    return { name, created: false };
  } catch (error) {
    const output = cleanOutput(`${error.stdout ?? ""}\n${error.stderr ?? ""}`).toLowerCase();
    if (/not found|does not exist|could not find|couldn't find|404/.test(output)) {
      return null;
    }
    throw error;
  }
}

async function createR2(name) {
  await wrangler(["r2", "bucket", "create", name]);
  return { name, created: true };
}

export async function resolveResources({ ensure }) {
  const names = targetNames();
  const existingD1 = await findD1(names.d1Name);
  const existingR2 = await findR2(names.r2Name);

  if (!ensure) {
    if (!existingD1 || !existingR2) {
      const missing = [!existingD1 && `D1 ${names.d1Name}`, !existingR2 && `R2 ${names.r2Name}`]
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Remote resource check failed; missing: ${missing}. No resources were created.`,
      );
    }
    return { ...names, d1: existingD1, r2: existingR2 };
  }

  const d1 = existingD1 ?? (await createD1(names.d1Name));
  const r2 = existingR2 ?? (await createR2(names.r2Name));
  return { ...names, d1, r2 };
}

function asRelativeConfigPath(from, target) {
  const value = relative(from, target).split(sep).join("/");
  return value.startsWith(".") ? value : `./${value}`;
}

export async function writeGeneratedConfig(baseConfigPath, resources) {
  const base = JSON.parse(await readFile(baseConfigPath, "utf8"));
  const generatedDir = resolve(ROOT, ".wrangler/deploy");
  const baseDir = dirname(resolve(ROOT, baseConfigPath));
  const generatedPath = join(generatedDir, "wrangler.generated.json");
  const clientDir = resolve(baseDir, base.assets.directory);
  const workerEntry = resolve(baseDir, base.main);

  base.name = resources.workerName;
  base.main = asRelativeConfigPath(generatedDir, workerEntry);
  base.assets = {
    ...base.assets,
    directory: asRelativeConfigPath(generatedDir, clientDir),
  };
  base.d1_databases = [
    {
      binding: "DB",
      database_name: resources.d1Name,
      database_id: resources.d1.id,
      migrations_dir: asRelativeConfigPath(generatedDir, resolve(ROOT, "migrations")),
    },
  ];
  base.r2_buckets = [{ binding: "R2", bucket_name: resources.r2Name }];
  base.vars = {
    ENVIRONMENT: "production",
    SKIP_TURNSTILE: "false",
    SECURE_COOKIE: "true",
  };
  delete base.env;

  await mkdir(generatedDir, { recursive: true });
  await writeFile(generatedPath, `${JSON.stringify(base, null, 2)}\n`, "utf8");
  return generatedPath;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const names = targetNames();
  console.log(
    `${checkOnly ? "Checking" : "Ensuring"} production resources: Worker ${names.workerName}, D1 ${names.d1Name}, R2 ${names.r2Name}`,
  );
  const result = await resolveResources({ ensure: !checkOnly });
  console.log(
    `${checkOnly ? "Remote resources exist" : "Remote resources ready"}; Worker will be reused or created by wrangler deploy.`,
  );
  if (result.d1?.created || result.r2?.created) {
    console.log(
      `Created: ${[result.d1.created && `D1 ${result.d1.name}`, result.r2.created && `R2 ${result.r2.name}`].filter(Boolean).join(", ")}`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`cloudflare:check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
