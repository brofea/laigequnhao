#!/usr/bin/env node
/**
 * 全链路种子数据脚本
 * 用法: node scripts/seed-local.mjs
 *
 * 前提: 先启动 pnpm pages:dev:local（API 在 localhost:8788）
 *
 * 下载 → 压缩（logo 128px/80KB, QR 512px/400KB）→ 通过 API 上传 R2 → 写 D1
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUP_COUNT = 100;
const IMAGE_COUNT = 20;
const SQL_FILE = join(__dirname, "..", "seed-local.sql");
const API_BASE = "http://localhost:8788/api/v1";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

// ─── 压缩参数（与 shared/contracts/asset.ts 同步）─────────
const LOGO_MAX_DIM = 128;
const LOGO_MAX_BYTES = 80 * 1024;
const LOGO_START_Q = 85;
const LOGO_MIN_Q = 5;
const LOGO_Q_STEP = 20;

const QR_MAX_DIM = 512;
const QR_MAX_BYTES = 400 * 1024;
const QR_START_Q = 95;
const QR_MIN_Q = 15;
const QR_Q_STEP = 20;

// ─── 读取 .dev.vars ───────────────────────────────────────
function readAdminPassword() {
  const devVarsPath = resolve(__dirname, "..", ".dev.vars");
  const content = readFileSync(devVarsPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("ADMIN_PASSWORD=")) return trimmed.slice("ADMIN_PASSWORD=".length);
  }
  return "123456";
}
const ADMIN_PASSWORD = readAdminPassword();

// ─── 工具函数 ─────────────────────────────────────────────
const uuid = () => crypto.randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, min, max) => {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
};
const rInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const daysAgo = (d) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dt.setHours(rInt(8, 22), rInt(0, 59));
  return dt.toISOString();
};
const now = () => new Date().toISOString();
const esc = (s) => s.replace(/'/g, "''");

// ─── 数据池 ────────────────────────────────────────────────
const PLATFORMS = {
  qq: { name: "QQ", joinTypes: ["group_number", "qr_code"] },
  wechat: { name: "微信", joinTypes: ["qr_code"] },
  dingtalk: { name: "钉钉", joinTypes: ["group_number", "qr_code"] },
  discord: { name: "Discord", joinTypes: ["url"] },
  telegram: { name: "Telegram", joinTypes: ["url"] },
};
const TAG_POOL = [
  "技术","游戏","学习","考研","实习","摄影","音乐","动漫","运动","美食",
  "编程","留学","社团","竞赛","文艺","电竞","二手","租房","旅游","读书",
  "电影","设计","创业","志愿者",
];
const TITLES = {
  official: [
    "学生会{平台}通知群","教务处{平台}公告群","{院系}学院{平台}群",
    "校园{平台}官方群","研究生院{平台}交流群","校友会{平台}联络群",
    "团委{平台}工作群","就业指导中心{平台}群",
  ],
  interest: [
    "{标签}爱好者{平台}群","{标签}交流{平台}群","{标签}同好{平台}群",
    "一起{标签}{平台}群","{标签}小分队","每日{标签}打卡群",
    "{标签}学习小组","{标签}资源共享群",
  ],
};
const DESCRIPTIONS = [
  "欢迎加入，一起交流学习！","本群为校园官方群，请遵守群规。",
  "技术交流、资源共享、项目合作。","日常水群，快乐摸鱼。",
  "不定期举办线下活动，欢迎参与。",
];
const KINDS = ["official", "interest"];
const STATUS_WEIGHTS = { pending: 18, published: 50, rejected: 12, delisted: 12, deleted: 8 };

// ─── 图片压缩（sharp，质量递减）────────────────────────────
async function compressToSize(buf, w, h, opts) {
  let best = null;
  let q = opts.startQuality;
  while (q >= opts.minQuality) {
    const pipeline = sharp(buf).resize(w, h);
    if (!opts.preserveAlpha) pipeline.flatten({ background: "#ffffff" });
    const webp = await pipeline.webp({ quality: q, alphaQuality: 100 }).toBuffer();
    if (webp.length <= opts.maxBytes) { best = webp; break; }
    q -= opts.qualityStep;
  }
  // 最后一次：最低质量
  if (!best) {
    const pipeline = sharp(buf).resize(w, h);
    if (!opts.preserveAlpha) pipeline.flatten({ background: "#ffffff" });
    const webp = await pipeline.webp({ quality: opts.minQuality, alphaQuality: 100 }).toBuffer();
    if (webp.length <= opts.maxBytes) best = webp;
  }
  return best;
}

// ─── 下载 + 处理图片 ───────────────────────────────────────
async function downloadAndProcess(count) {
  console.log(`下载 + 压缩 ${count} 张图片...`);
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("https://www.loliapi.com/acg/", { redirect: "manual" });
      const imgUrl = res.headers.get("location") || `https://esa-img.iloli.love/i/pc/img${380 + i}.webp`;
      process.stdout.write(`  [${i + 1}/${count}] ${imgUrl.slice(-40)}... `);

      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) { console.log("下载失败"); continue; }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) throw new Error("无法识别尺寸");
      let ow = meta.width, oh = meta.height;

      // Logo 版本: 128px, 80KB, alpha, 85→5
      const lw = Math.max(ow, oh) > LOGO_MAX_DIM
        ? Math.round(ow * LOGO_MAX_DIM / Math.max(ow, oh)) : ow;
      const lh = Math.max(ow, oh) > LOGO_MAX_DIM
        ? Math.round(oh * LOGO_MAX_DIM / Math.max(ow, oh)) : oh;
      const logoBuf = await compressToSize(buf, lw, lh, {
        startQuality: LOGO_START_Q, minQuality: LOGO_MIN_Q,
        qualityStep: LOGO_Q_STEP, maxBytes: LOGO_MAX_BYTES, preserveAlpha: true,
      });

      // QR 版本: 512px, 400KB, opaque, 95→15
      const qw = Math.max(ow, oh) > QR_MAX_DIM
        ? Math.round(ow * QR_MAX_DIM / Math.max(ow, oh)) : ow;
      const qh = Math.max(ow, oh) > QR_MAX_DIM
        ? Math.round(oh * QR_MAX_DIM / Math.max(ow, oh)) : oh;
      const qrBuf = await compressToSize(buf, qw, qh, {
        startQuality: QR_START_Q, minQuality: QR_MIN_Q,
        qualityStep: QR_Q_STEP, maxBytes: QR_MAX_BYTES, preserveAlpha: false,
      });

      const ok = [];
      if (logoBuf) ok.push(`L:${(logoBuf.length / 1024).toFixed(0)}KB ${lw}x${lh}`);
      else ok.push(`L:FAIL`);
      if (qrBuf) ok.push(`Q:${(qrBuf.length / 1024).toFixed(0)}KB ${qw}x${qh}`);
      else ok.push(`Q:FAIL`);
      console.log(ok.join(" "));

      if (logoBuf || qrBuf) {
        results.push({ logoBuf, qrBuf, logoW: lw, logoH: lh, qrW: qw, qrH: qh });
      }
    } catch (e) {
      console.log(`出错: ${e.message}`);
    }
  }
  console.log(`  完成 ${results.length}/${count} 张`);
  return results;
}

// ─── API 认证 ─────────────────────────────────────────────
let csrfToken = null;
let sessionCookie = null;

async function authenticate() {
  const res = await fetch(`${API_BASE}/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`认证失败: ${json.error?.message}`);
  csrfToken = json.data.csrfToken;
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) sessionCookie = setCookie.split(";")[0];
  console.log("API 认证成功");
}

// ─── API 上传 ─────────────────────────────────────────────
async function uploadViaApi(buffer, purpose) {
  const b = Buffer.isBuffer(buffer) ? new Blob([buffer], { type: "image/webp" }) : buffer;
  const form = new FormData();
  form.append("file", b, `${purpose}.webp`);
  form.append("purpose", purpose);
  const headers = { "X-CSRF-Token": csrfToken };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const res = await fetch(`${API_BASE}/admin/assets`, {
    method: "POST", headers, body: form,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`上传失败(${purpose}): ${json.error?.message}`);
  return { id: json.data.id, r2Key: json.data.r2Key, publicUrl: json.data.publicUrl };
}

// ─── 上传所有资源 ──────────────────────────────────────────
async function uploadAssets(images) {
  const logos = [];
  const qrs = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    process.stdout.write(`  上传 ${i + 1}/${images.length} logo... `);
    if (img.logoBuf) {
      const asset = await uploadViaApi(img.logoBuf, "logo");
      logos.push({ ...asset, width: img.logoW, height: img.logoH, byteLength: img.logoBuf.length });
      console.log(`OK ${asset.id.slice(0, 8)}`);
    } else {
      console.log("SKIP");
    }
    process.stdout.write(`  上传 ${i + 1}/${images.length} QR... `);
    if (img.qrBuf) {
      const asset = await uploadViaApi(img.qrBuf, "qr_code");
      qrs.push({ ...asset, width: img.qrW, height: img.qrH, byteLength: img.qrBuf.length });
      console.log(`OK ${asset.id.slice(0, 8)}`);
    } else {
      console.log("SKIP");
    }
  }
  return { logos, qrs };
}

// ─── 生成 SQL ─────────────────────────────────────────────
function generateSQL({ logos, qrs }) {
  const lines = [];
  lines.push("BEGIN TRANSACTION;");
  lines.push("DELETE FROM likes; DELETE FROM group_tags; DELETE FROM join_methods;");
  lines.push("DELETE FROM submission_details; DELETE FROM assets; DELETE FROM groups;");
  lines.push("DELETE FROM rate_limits;");
  lines.push("");

  // Asset INSERTs
  for (const a of [...logos, ...qrs]) {
    const t = now();
    lines.push(
      `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count, created_at, updated_at) VALUES ('${a.id}', '${a.r2Key}', '${a.r2Key.startsWith("logo") ? "logo" : "qr_code"}', 'image/webp', ${a.byteLength}, ${a.width}, ${a.height}, 'ready', 0, '${t}', '${t}');`,
    );
  }

  // Groups
  const weighted = [];
  for (const [s, w] of Object.entries(STATUS_WEIGHTS)) for (let i = 0; i < w; i++) weighted.push(s);
  const pKeys = Object.keys(PLATFORMS);
  const logoPool = [...logos];
  const qrPool = [...qrs];
  const assetRefCounts = new Map();

  for (let i = 0; i < GROUP_COUNT; i++) {
    const id = uuid();
    const status = weighted[i % weighted.length];
    const platform = pKeys[i % pKeys.length];
    const kind = pick(KINDS);
    const rotKey = uuid();
    const likeCount = status === "published" ? rInt(0, 200) : 0;

    let title = pick(kind === "official" ? TITLES.official : TITLES.interest)
      .replace("{平台}", PLATFORMS[platform].name)
      .replace("{院系}", pick(["计算机","电子","机械","经管","外语","数学"]));
    const tags = pickN(TAG_POOL, 0, 5);
    title = title.replace("{标签}", tags.length > 0 ? pick(tags) : "综合");

    // Logo: 前 20 个必须有，其余随机
    const hasLogo = i < 20 ? logoPool.length > 0 : Math.random() < 0.3 && logoPool.length > 0;
    let logoR2Key = "NULL", logoUrl = "NULL";
    let logoW = "NULL", logoH = "NULL", logoB = "NULL";
    if (hasLogo) {
      const a = logoPool.shift();
      logoR2Key = `'${a.r2Key}'`;
      logoUrl = `'${a.publicUrl}'`;
      logoW = a.width; logoH = a.height; logoB = a.byteLength;
      assetRefCounts.set(a.id, (assetRefCounts.get(a.id) ?? 0) + 1);
    }

    const isDeleted = status === "deleted";
    const delAt = isDeleted ? `'${daysAgo(rInt(1, 14))}'` : "NULL";
    const actualStatus = isDeleted ? "published" : status;

    lines.push(
      `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, like_count, version, logo_r2_key, logo_url, logo_width, logo_height, logo_byte_length, deleted_at, created_at, updated_at) VALUES ('${id}', '${esc(title)}', '${esc(pick(DESCRIPTIONS))}', '${kind}', '${platform}', '${actualStatus}', '${rotKey}', ${likeCount}, 1, ${logoR2Key}, ${logoUrl}, ${logoW}, ${logoH}, ${logoB}, ${delAt}, '${daysAgo(rInt(1, 60))}', '${now()}');`,
    );

    // Join methods
    let sortOrder = 0;
    for (const jt of PLATFORMS[platform].joinTypes) {
      const jmId = uuid();
      let value = "NULL", assetId = "NULL";
      if (jt === "group_number") value = `'${rInt(100000, 999999999)}'`;
      if (jt === "url") value = `'https://${platform}.example.com/invite/${uuid().slice(0, 8)}'`;
      // QR: 前 20 个必须有，其余随机
      const hasQr = i < 20 ? qrPool.length > 0 : Math.random() < 0.3 && qrPool.length > 0;
      if (jt === "qr_code" && hasQr) {
        const a = qrPool.shift();
        assetId = `'${a.id}'`;
        assetRefCounts.set(a.id, (assetRefCounts.get(a.id) ?? 0) + 1);
      }
      lines.push(
        `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES ('${jmId}', '${id}', '${jt}', ${value}, ${sortOrder}, ${assetId});`,
      );
      sortOrder++;
    }

    // Tags
    let to = 0;
    for (const tag of tags) {
      lines.push(`INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES ('${uuid()}', '${id}', '${esc(tag)}', ${to});`);
      to++;
    }

    if (Math.random() < 0.4) {
      lines.push(`INSERT INTO submission_details (id, group_id, contact, notes) VALUES ('${uuid()}', '${id}', ${Math.random() < 0.6 ? `'user${rInt(1,99)}@example.com'` : "NULL"}, ${Math.random() < 0.5 ? `'${esc(pick(["请通过一下谢谢","求拉群","老群友推荐",""]))}'` : "NULL"});`);
    }

    if (likeCount > 0) {
      for (let v = 0; v < Math.min(likeCount, rInt(1, 30)); v++) {
        lines.push(`INSERT INTO likes (group_id, voter_hash) VALUES ('${id}', '${uuid().replace(/-/g, "").slice(0, 16)}');`);
      }
    }
    lines.push("");
  }

  for (const [assetId, refCount] of assetRefCounts) {
    lines.push(`UPDATE assets SET ref_count = ${refCount} WHERE id = '${assetId}';`);
  }
  lines.push("COMMIT;");
  lines.push(`-- ${GROUP_COUNT} groups, ${logos.length} logos, ${qrs.length} QRs`);
  return lines.join("\n");
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log("═══ 全链路种子数据生成 ═══\n");
  console.log(`API: ${API_BASE}`);
  await authenticate();

  const images = await downloadAndProcess(IMAGE_COUNT);
  if (images.length === 0) { console.error("无图片"); process.exit(1); }

  const assets = await uploadAssets(images);
  console.log(`R2 上传: ${assets.logos.length} logos + ${assets.qrs.length} QRs`);

  const sql = generateSQL(assets);
  writeFileSync(SQL_FILE, sql, "utf-8");
  console.log(`SQL: ${SQL_FILE} (${(sql.length / 1024).toFixed(0)}KB)`);

  try {
    execSync(`${NPX} wrangler d1 execute lgqh-dev --local --file "${SQL_FILE}"`, {
      encoding: "utf-8", timeout: 300000, stdio: "pipe",
    });
    console.log("✅ 种子数据完成");
  } catch (err) {
    console.error("❌ 执行失败:", err.stderr?.slice(0, 200) || err.message);
    console.log(`SQL 文件保留: ${SQL_FILE}`);
  }
}
main();
