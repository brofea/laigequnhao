#!/usr/bin/env node
/**
 * 全链路种子数据脚本
 * 用法: node scripts/seed-local.mjs
 *
 * 下载 → 压缩(1024px webp ≤300KB) → 写 R2 → 写 D1 → 前端可显示
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const GROUP_COUNT = 42;
const IMAGE_COUNT = 12;
const MAX_DIM = 1024;
const TARGET_BYTES = 300 * 1024;
const SQL_FILE = join(tmpdir(), "seed-local.sql");
const LOCAL_ASSET_BASE_URL = "http://localhost:5173/assets";
const R2_BUCKET = "lgqh-dev";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

// ─── 数据池 ──────────────────────────────────────────────────
const PLATFORMS = {
  qq: { name: "QQ", joinTypes: ["group_number", "qr_code"] },
  wechat: { name: "微信", joinTypes: ["qr_code"] },
  dingtalk: { name: "钉钉", joinTypes: ["group_number", "qr_code"] },
  discord: { name: "Discord", joinTypes: ["url"] },
  telegram: { name: "Telegram", joinTypes: ["url"] },
};
const TAG_POOL = [
  "技术",
  "游戏",
  "学习",
  "考研",
  "实习",
  "摄影",
  "音乐",
  "动漫",
  "运动",
  "美食",
  "编程",
  "留学",
  "社团",
  "竞赛",
  "文艺",
  "电竞",
  "二手",
  "租房",
  "旅游",
  "读书",
  "电影",
  "设计",
  "创业",
  "志愿者",
];
const TITLES = {
  official: [
    "学生会{平台}通知群",
    "教务处{平台}公告群",
    "{院系}学院{平台}群",
    "校园{平台}官方群",
    "研究生院{平台}交流群",
    "校友会{平台}联络群",
    "团委{平台}工作群",
    "就业指导中心{平台}群",
  ],
  interest: [
    "{标签}爱好者{平台}群",
    "{标签}交流{平台}群",
    "{标签}同好{平台}群",
    "一起{标签}{平台}群",
    "{标签}小分队",
    "每日{标签}打卡群",
    "{标签}学习小组",
    "{标签}资源共享群",
  ],
};
const DESCRIPTIONS = [
  "欢迎加入，一起交流学习！",
  "本群为校园官方群，请遵守群规。",
  "技术交流、资源共享、项目合作。",
  "日常水群，快乐摸鱼。",
  "不定期举办线下活动，欢迎参与。",
];
const KINDS = ["official", "interest"];
const STATUS_WEIGHTS = { pending: 8, published: 20, rejected: 6, delisted: 6, deleted: 2 };

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

// ─── 图片处理 ────────────────────────────────────────────────
async function downloadAndProcess(count) {
  console.log(
    `下载 + 压缩 ${count} 张图片 (${MAX_DIM}px webp ≤${Math.round(TARGET_BYTES / 1024)}KB)...`,
  );
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      // 1. 获取随机图片 URL
      const res = await fetch("https://www.loliapi.com/acg/", { redirect: "manual" });
      const imgUrl =
        res.headers.get("location") || `https://esa-img.iloli.love/i/pc/img${380 + i}.webp`;
      process.stdout.write(`  [${i + 1}/${count}] 下载 ${imgUrl.slice(-30)}... `);

      // 2. 下载
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) {
        console.log("下载失败");
        continue;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      process.stdout.write(`${(buf.length / 1024).toFixed(0)}KB → `);

      // 3. 处理: resize + webp + compress
      const metadata = await sharp(buf).metadata();
      const { width: ow, height: oh } = metadata;
      if (!ow || !oh) throw new Error("无法识别图片尺寸");
      let w = ow,
        h = oh;
      if (Math.max(w, h) > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      // Binary search quality for ≤TARGET_BYTES
      let best = null;
      let lo = 1,
        hi = 100;
      for (let q = 0; q < 8; q++) {
        const mid = Math.round((lo + hi) / 2);
        const webp = await sharp(buf).resize(w, h).webp({ quality: mid }).toBuffer();
        if (webp.length <= TARGET_BYTES) {
          if (!best || webp.length > best.length) best = webp;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (!best) throw new Error("压缩后仍超过 300KB");
      const finalSize = best.length;
      const dims = `${w}x${h}`;
      console.log(`${(finalSize / 1024).toFixed(0)}KB ${dims}`);

      results.push({ buffer: best, width: w, height: h, byteLength: finalSize });
    } catch (e) {
      console.log(`出错: ${e.message}`);
    }
  }
  console.log(`  完成 ${results.length}/${count} 张`);
  return results;
}

// ─── 通过 Wrangler 写入本地 R2（同时维护 Miniflare 元数据）────────
function putLocalR2Object(r2Key, buffer) {
  const tempFile = join(tmpdir(), `lgqh-seed-${uuid()}.webp`);
  writeFileSync(tempFile, buffer);
  try {
    execFileSync(
      NPX,
      [
        "wrangler",
        "r2",
        "object",
        "put",
        `${R2_BUCKET}/${r2Key}`,
        "--local",
        "--file",
        tempFile,
        "--content-type",
        "image/webp",
        "--cache-control",
        "public, max-age=31536000, immutable",
      ],
      { stdio: "ignore", timeout: 300000 },
    );
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // 临时文件清理为尽力而为。
    }
  }
}

function writeR2Files(images) {
  const logoAssets = [];
  const qrAssets = [];
  for (const img of images) {
    for (const purpose of ["logo", "qr_code"]) {
      const id = uuid();
      const r2Key = `${purpose}/${id}.webp`;
      putLocalR2Object(r2Key, img.buffer);
      const asset = { id, r2Key, purpose, ...img };
      if (purpose === "logo") logoAssets.push(asset);
      else qrAssets.push(asset);
    }
  }
  return { logoAssets, qrAssets };
}

// ─── 生成 SQL ────────────────────────────────────────────────
function generateSQL({ logoAssets, qrAssets }) {
  const lines = [];
  lines.push("BEGIN TRANSACTION;");
  lines.push(
    "DELETE FROM likes; DELETE FROM group_tags; DELETE FROM join_methods; DELETE FROM submission_details; DELETE FROM assets; DELETE FROM groups; DELETE FROM rate_limits;",
  );
  lines.push("");

  // Asset INSERTs
  for (const a of [...logoAssets, ...qrAssets]) {
    const t = now();
    lines.push(
      `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count, created_at, updated_at) VALUES ('${a.id}', '${a.r2Key}', '${a.purpose}', 'image/webp', ${a.byteLength}, ${a.width}, ${a.height}, 'ready', 0, '${t}', '${t}');`,
    );
  }

  // Group INSERTs
  const weighted = [];
  for (const [s, w] of Object.entries(STATUS_WEIGHTS)) for (let i = 0; i < w; i++) weighted.push(s);
  const pKeys = Object.keys(PLATFORMS);
  const usedTags = new Map();

  const logoPool = [...logoAssets];
  let qrIndex = 0;
  const assetRefCounts = new Map();

  for (let i = 0; i < GROUP_COUNT; i++) {
    const id = uuid();
    const status = weighted[i % weighted.length];
    const platform = pKeys[i % pKeys.length];
    const kind = pick(KINDS);
    const rotKey = crypto.randomUUID();
    const likeCount = status === "published" ? rInt(0, 200) : 0;

    let title = pick(kind === "official" ? TITLES.official : TITLES.interest)
      .replace("{平台}", PLATFORMS[platform].name)
      .replace("{院系}", pick(["计算机", "电子", "机械", "经管", "外语", "数学"]));
    const tags = pickN(TAG_POOL, 0, 5);
    for (const t of tags) usedTags.set(t, (usedTags.get(t) ?? 0) + 1);
    title = title.replace("{标签}", tags.length > 0 ? pick(tags) : "综合");

    // Logo: 60% have logo, use a random processed asset
    const hasLogo = Math.random() < 0.6;
    let logoR2Key = "NULL";
    let logoUrl = "NULL";
    let logoW = "NULL",
      logoH = "NULL",
      logoB = "NULL";
    if (hasLogo && logoPool.length > 0) {
      const logoAsset = logoPool.shift();
      logoR2Key = `'${logoAsset.r2Key}'`;
      logoUrl = `'${LOCAL_ASSET_BASE_URL}/${logoAsset.r2Key}'`;
      logoW = logoAsset.width;
      logoH = logoAsset.height;
      logoB = logoAsset.byteLength;
      assetRefCounts.set(logoAsset.id, (assetRefCounts.get(logoAsset.id) ?? 0) + 1);
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
      let value = "NULL";
      let assetId = "NULL";
      if (jt === "group_number") value = `'${rInt(100000, 999999999)}'`;
      if (jt === "url") value = `'https://${platform}.example.com/invite/${uuid().slice(0, 8)}'`;
      if (jt === "qr_code" && qrAssets.length > 0) {
        const qrAsset = qrAssets[qrIndex % qrAssets.length];
        qrIndex++;
        assetId = `'${qrAsset.id}'`;
        assetRefCounts.set(qrAsset.id, (assetRefCounts.get(qrAsset.id) ?? 0) + 1);
      }
      lines.push(
        `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES ('${jmId}', '${id}', '${jt}', ${value}, ${sortOrder}, ${assetId});`,
      );
      sortOrder++;
    }

    // Tags
    let to = 0;
    for (const tag of tags) {
      lines.push(
        `INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES ('${uuid()}', '${id}', '${esc(tag)}', ${to});`,
      );
      to++;
    }

    // Submission details
    if (Math.random() < 0.4) {
      lines.push(
        `INSERT INTO submission_details (id, group_id, contact, notes) VALUES ('${uuid()}', '${id}', ${Math.random() < 0.6 ? `'user${rInt(1, 99)}@example.com'` : "NULL"}, ${Math.random() < 0.5 ? `'${esc(pick(["请通过一下谢谢", "求拉群", "老群友推荐", ""]))}'` : "NULL"});`,
      );
    }

    // Likes
    if (likeCount > 0) {
      const vc = Math.min(likeCount, rInt(1, 30));
      for (let v = 0; v < vc; v++) {
        lines.push(
          `INSERT INTO likes (group_id, voter_hash) VALUES ('${id}', '${uuid().replace(/-/g, "").slice(0, 16)}');`,
        );
      }
    }
    lines.push("");
  }
  for (const [assetId, refCount] of assetRefCounts) {
    lines.push(`UPDATE assets SET ref_count = ${refCount} WHERE id = '${assetId}';`);
  }
  lines.push("COMMIT;");
  lines.push(
    `-- ${GROUP_COUNT} groups, ${logoAssets.length} logo assets, ${qrAssets.length} QR assets`,
  );
  return lines.join("\n");
}

// ─── 主流程 ──────────────────────────────────────────────────
async function main() {
  console.log("═══ 全链路种子数据生成 ═══\n");
  const images = await downloadAndProcess(IMAGE_COUNT);
  if (images.length === 0) {
    console.error("无图片");
    process.exit(1);
  }
  const assets = writeR2Files(images);
  console.log(`R2 文件: ${assets.logoAssets.length + assets.qrAssets.length} 个`);
  const sql = generateSQL(assets);
  writeFileSync(SQL_FILE, sql, "utf-8");
  console.log(`SQL: ${SQL_FILE} (${(sql.length / 1024).toFixed(0)}KB)`);
  try {
    execFileSync(NPX, ["wrangler", "d1", "execute", "lgqh-dev", "--local", "--file", SQL_FILE], {
      encoding: "utf-8",
      timeout: 300000,
    });
    console.log("✅ 种子数据完成");
  } catch (err) {
    console.error("❌ 执行失败:", err.stderr?.slice(0, 200) || err.message);
  } finally {
    try {
      unlinkSync(SQL_FILE);
    } catch {
      // 临时文件清理为尽力而为。
    }
  }
}
main();
