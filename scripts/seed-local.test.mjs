import assert from "node:assert/strict";
import test from "node:test";
import { assertApiReachable, DEFAULT_SEED_API_BASE, resolveSeedApiBase } from "./seed-local.mjs";

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
