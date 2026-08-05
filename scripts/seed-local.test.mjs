import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  assertApiReachable,
  DEFAULT_SEED_API_BASE,
  generateSQL,
  resolveSeedApiBase,
} from "./seed-local.mjs";

test("seed 默认复用 pnpm dev 的 localhost API 地址", () => {
  assert.equal(DEFAULT_SEED_API_BASE, "http://localhost:5173/api/v1");
  assert.equal(resolveSeedApiBase({}), DEFAULT_SEED_API_BASE);
  assert.equal(
    resolveSeedApiBase({ SEED_API_BASE: "http://127.0.0.1:8788/api/v1/" }),
    "http://127.0.0.1:8788/api/v1",
  );
});

test("seed API 连接失败时给出中文启动提示", async () => {
  const apiBase = "http://localhost:5173/api/v1";
  const fetchImpl = async () => {
    throw new TypeError("fetch failed");
  };

  await assert.rejects(assertApiReachable(apiBase, fetchImpl), (error) => {
    assert.match(error.message, /无法连接本地 Seed API/);
    assert.match(error.message, /请先运行 pnpm dev/);
    assert.match(error.message, /SEED_API_BASE/);
    assert.match(error.message, /fetch failed/);
    return true;
  });
});

// ─── 生成 SQL 的幂等性验证 ───────────────────────────────

const SCHEMA_SQL = `
CREATE TABLE assets (
  id TEXT PRIMARY KEY, r2_key TEXT NOT NULL, purpose TEXT NOT NULL,
  content_type TEXT NOT NULL, byte_length INTEGER NOT NULL, width INTEGER NOT NULL,
  height INTEGER NOT NULL, status TEXT NOT NULL, ref_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE groups (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, kind TEXT NOT NULL,
  platform TEXT NOT NULL, status TEXT NOT NULL, rotation_key TEXT NOT NULL,
  like_count INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
  logo_r2_key TEXT, logo_url TEXT, logo_width INTEGER, logo_height INTEGER,
  logo_byte_length INTEGER, deleted_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE join_methods (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL, type TEXT NOT NULL, value TEXT,
  sort_order INTEGER NOT NULL, asset_id TEXT
);
CREATE TABLE group_tags (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, tag TEXT NOT NULL, sort_order INTEGER NOT NULL);
CREATE TABLE submission_details (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, contact TEXT, notes TEXT);
CREATE TABLE likes (group_id TEXT NOT NULL, voter_hash TEXT NOT NULL);
`;

function sampleSeedInputs() {
  const groups = [
    {
      index: 0,
      status: "published",
      isDeleted: false,
      joinMethods: { hasGroupNumber: true, hasUrl: true, hasQrCode: true },
      imageIndex: 0,
    },
    {
      index: 1,
      status: "pending",
      isDeleted: false,
      joinMethods: { hasGroupNumber: false, hasUrl: false, hasQrCode: false },
      imageIndex: 1,
    },
  ];
  const logos = new Array(groups.length).fill(null);
  const qrCodes = new Array(groups.length).fill(null);
  logos[0] = {
    id: "00000000-0000-4000-8000-000000000001",
    r2Key: "logo/00000000-0000-4000-8000-000000000001.png",
    publicUrl: "http://localhost:8787/logo/00000000-0000-4000-8000-000000000001.png",
    width: 128,
    height: 128,
    byteLength: 1000,
  };
  logos[1] = {
    id: "00000000-0000-4000-8000-000000000002",
    r2Key: "logo/00000000-0000-4000-8000-000000000002.png",
    publicUrl: "http://localhost:8787/logo/00000000-0000-4000-8000-000000000002.png",
    width: 128,
    height: 96,
    byteLength: 900,
  };
  qrCodes[0] = {
    id: "00000000-0000-4000-8000-000000000003",
    r2Key: "qr_code/00000000-0000-4000-8000-000000000003.png",
    publicUrl: "http://localhost:8787/qr_code/00000000-0000-4000-8000-000000000003.png",
    width: 1024,
    height: 576,
    byteLength: 200000,
  };
  return { groups, logos, qrCodes };
}

test("生成 SQL 中 assets 写入为幂等 upsert，且不抛主键冲突", () => {
  const { groups, logos, qrCodes } = sampleSeedInputs();
  const sql = generateSQL(groups, { logos, qrCodes });

  const assetInserts = sql.match(/INSERT INTO assets /g) ?? [];
  assert.equal(assetInserts.length, 3, "应有 2 条 logo + 1 条 qr_code 的 assets 写入");
  const upserts = sql.match(/INSERT INTO assets .*?ON CONFLICT\(id\) DO UPDATE/g) ?? [];
  assert.equal(upserts.length, 3, "所有 assets 写入都应是 upsert");

  // 模拟上传接口已写入 staged 行（与 seed 相同的 ID），再次执行生成的 SQL 不应冲突
  const stagedDb = new DatabaseSync(":memory:");
  stagedDb.exec(SCHEMA_SQL);
  stagedDb.exec(
    "INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, created_at, updated_at) VALUES " +
      "('00000000-0000-4000-8000-000000000001', 'logo/00000000-0000-4000-8000-000000000001.png', 'logo', 'image/png', 1000, 128, 128, 'staged', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), " +
      "('00000000-0000-4000-8000-000000000002', 'logo/00000000-0000-4000-8000-000000000002.png', 'logo', 'image/png', 900, 128, 96, 'staged', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), " +
      "('00000000-0000-4000-8000-000000000003', 'qr_code/00000000-0000-4000-8000-000000000003.png', 'qr_code', 'image/png', 200000, 1024, 576, 'staged', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
  );
  stagedDb.exec(sql);
  const assets = stagedDb.prepare("SELECT id, status, ref_count FROM assets ORDER BY id").all();
  assert.deepEqual(
    assets.map((r) => [r.id, r.status, r.ref_count]),
    [
      ["00000000-0000-4000-8000-000000000001", "ready", 1],
      ["00000000-0000-4000-8000-000000000002", "ready", 1],
      ["00000000-0000-4000-8000-000000000003", "ready", 1],
    ],
  );
  stagedDb.close();

  // 空库场景：直接执行也应成功（干净环境，DB 中无 staged 行）
  const freshDb = new DatabaseSync(":memory:");
  freshDb.exec(SCHEMA_SQL);
  freshDb.exec(sql);
  const freshCount = freshDb.prepare("SELECT COUNT(*) AS n FROM assets").get().n;
  assert.equal(freshCount, 3);
  freshDb.close();
});
