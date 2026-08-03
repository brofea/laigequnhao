#!/usr/bin/env node
/**
 * 全链路种子数据脚本
 * 用法: node scripts/seed-local.mjs
 *
 * 前提: 先启动 pnpm dev（默认通过单地址 localhost:5173 访问 Worker API）
 * 若单独运行 pnpm worker:dev，请设置 SEED_API_BASE=http://127.0.0.1:8788/api/v1。
 *
 * 下载 → 压缩（logo 128px/80KB, QR 1024px/400KB）→ 通过 API 上传 R2 → 写 D1
 *
 * 群组分布: 100已发布 + 10待审核 + 10已下架 + 10已拒绝 + 10回收站(状态=已拒绝) = 140
 * 所有140个群都有头像（logo压缩）
 * 每种加群方式独立50%概率出现，但每组至少一种
 * 有qr_code的群，二维码图片与头像同源，压缩参数不同（仅这些群额外压缩QR版本）
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUP_COUNT = 140;
const SQL_FILE = join(__dirname, "..", "seed-local.sql");
const API_BASE = process.env.SEED_API_BASE ?? "http://127.0.0.1:5173/api/v1";
const PERSIST_TO = process.env.WRANGLER_PERSIST_TO ?? resolve(__dirname, "..", ".wrangler/state");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

function assertLocalSeedTarget() {
  const url = new URL(API_BASE);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`seed only accepts a loopback API; refused ${url.hostname}`);
  }
  try {
    const output = execSync(
      `${NPX} wrangler d1 execute lgqh-dev --local --persist-to "${PERSIST_TO}" --command "SELECT COUNT(*) AS count FROM groups;" --json`,
      { cwd: resolve(__dirname, ".."), encoding: "utf-8", timeout: 30000, stdio: "pipe" },
    );
    const count = Number(output.match(/"count"\s*:\s*(\d+)/)?.[1] ?? NaN);
    if (!Number.isFinite(count)) throw new Error("could not read the local groups count");
    if (count > 0 && process.env.SEED_ALLOW_NONEMPTY !== "true") {
      throw new Error(
        "local D1 already contains application rows; run pnpm clean first or set SEED_ALLOW_NONEMPTY=true explicitly",
      );
    }
  } catch (error) {
    throw new Error(`seed target check failed: ${error.message}`, { cause: error });
  }
}

// ─── 压缩参数（与 shared/contracts/asset.ts 同步）─────────
const LOGO_MAX_DIM = 128;
const LOGO_MAX_BYTES = 80 * 1024;
const LOGO_START_Q = 85;
const LOGO_MIN_Q = 45;
const LOGO_Q_STEP = 20;

const QR_MAX_DIM = 1024;
const QR_MAX_BYTES = 400 * 1024;
const QR_START_Q = 95;
const QR_MIN_Q = 55;
const QR_Q_STEP = 10;

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
const PLATFORMS = [
  "QQ",
  "微信",
  "钉钉",
  "飞书",
  "小红书",
  "抖音",
  "百度贴吧",
  "Telegram",
  "Discord",
];
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

// ─── 图片压缩（sharp，质量递减）────────────────────────────
async function compressToSize(buf, w, h, opts) {
  let best = null;
  let q = opts.startQuality;
  while (q >= opts.minQuality) {
    const pipeline = sharp(buf).resize(w, h);
    if (!opts.preserveAlpha) pipeline.flatten({ background: "#ffffff" });
    const webp = await pipeline.webp({ quality: q, alphaQuality: 100 }).toBuffer();
    if (webp.length <= opts.maxBytes) {
      best = webp;
      break;
    }
    q -= opts.qualityStep;
  }
  if (!best) {
    const pipeline = sharp(buf).resize(w, h);
    if (!opts.preserveAlpha) pipeline.flatten({ background: "#ffffff" });
    const webp = await pipeline.webp({ quality: opts.minQuality, alphaQuality: 100 }).toBuffer();
    if (webp.length <= opts.maxBytes) best = webp;
  }
  return best;
}

// ─── 下载 + 处理图片（全部下载并压缩logo；QR压缩在后续按需进行）───
async function downloadAndProcess(count) {
  console.log(`下载 + 压缩 ${count} 张图片（logo）...`);
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("https://www.loliapi.com/acg/", { redirect: "manual" });
      const imgUrl =
        res.headers.get("location") || `https://esa-img.iloli.love/i/pc/img${380 + i}.webp`;
      process.stdout.write(`  [${i + 1}/${count}] ${imgUrl.slice(-40)}... `);

      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) {
        console.log("下载失败");
        continue;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const meta = await sharp(buf).metadata();
      if (!meta.width || !meta.height) throw new Error("无法识别尺寸");
      const ow = meta.width,
        oh = meta.height;

      // Logo 版本: 128px, 80KB, alpha, 85→45
      const lw =
        Math.max(ow, oh) > LOGO_MAX_DIM ? Math.round((ow * LOGO_MAX_DIM) / Math.max(ow, oh)) : ow;
      const lh =
        Math.max(ow, oh) > LOGO_MAX_DIM ? Math.round((oh * LOGO_MAX_DIM) / Math.max(ow, oh)) : oh;
      const logoBuf = await compressToSize(buf, lw, lh, {
        startQuality: LOGO_START_Q,
        minQuality: LOGO_MIN_Q,
        qualityStep: LOGO_Q_STEP,
        maxBytes: LOGO_MAX_BYTES,
        preserveAlpha: true,
      });

      if (logoBuf) {
        console.log(`L:${(logoBuf.length / 1024).toFixed(0)}KB ${lw}x${lh}`);
        results.push({ sourceBuf: buf, logoBuf, logoW: lw, logoH: lh });
      } else {
        console.log("L:FAIL");
        results.push(null); // placeholder to keep index alignment
      }
    } catch (e) {
      console.log(`出错: ${e.message}`);
      results.push(null);
    }
  }
  const valid = results.filter(Boolean);
  console.log(`  完成 ${valid.length}/${count} 张（有效）`);
  return valid; // 只返回有效的，保持平坦索引
}

// ─── 按需生成 QR 压缩版本 ──────────────────────────────────
async function compressQR(sourceBuf) {
  const meta = await sharp(sourceBuf).metadata();
  const ow = meta.width,
    oh = meta.height;
  const qw = Math.max(ow, oh) > QR_MAX_DIM ? Math.round((ow * QR_MAX_DIM) / Math.max(ow, oh)) : ow;
  const qh = Math.max(ow, oh) > QR_MAX_DIM ? Math.round((oh * QR_MAX_DIM) / Math.max(ow, oh)) : oh;
  return await compressToSize(sourceBuf, qw, qh, {
    startQuality: QR_START_Q,
    minQuality: QR_MIN_Q,
    qualityStep: QR_Q_STEP,
    maxBytes: QR_MAX_BYTES,
    preserveAlpha: false,
  });
}

// ─── 规划所有群组 ──────────────────────────────────────────
function planGroups(imageCount) {
  const groups = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    // 状态分配: 0-99 已发布, 100-109 待审核, 110-119 已下架, 120-129 已拒绝, 130-139 回收站
    let status, isDeleted;
    if (i < 100) {
      status = "published";
      isDeleted = false;
    } else if (i < 110) {
      status = "pending";
      isDeleted = false;
    } else if (i < 120) {
      status = "delisted";
      isDeleted = false;
    } else if (i < 130) {
      status = "rejected";
      isDeleted = false;
    } else {
      status = "rejected";
      isDeleted = true;
    }

    // 加群方式: 每种独立50%，至少一种
    let hasGroupNumber = Math.random() < 0.5;
    let hasUrl = Math.random() < 0.5;
    let hasQrCode = Math.random() < 0.5;
    if (!hasGroupNumber && !hasUrl && !hasQrCode) {
      const choice = pick(["groupNumber", "url", "qrCode"]);
      if (choice === "groupNumber") hasGroupNumber = true;
      else if (choice === "url") hasUrl = true;
      else hasQrCode = true;
    }

    // 图片索引（循环使用）
    const imageIndex = i % imageCount;

    groups.push({
      index: i,
      status: isDeleted ? "rejected" : status,
      isDeleted,
      joinMethods: { hasGroupNumber, hasUrl, hasQrCode },
      imageIndex,
    });
  }
  return groups;
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
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`上传失败(${purpose}): HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  if (!json.ok) throw new Error(`上传失败(${purpose}): ${json.error?.message}`);
  return { id: json.data.id, r2Key: json.data.r2Key, publicUrl: json.data.publicUrl };
}

// ─── 上传所有资源 ──────────────────────────────────────────
async function uploadAll(images, groups) {
  const logos = new Array(groups.length).fill(null);
  const qrCodes = new Array(groups.length).fill(null);

  // 先统计需要上传的总数
  let logoCount = 0,
    qrCount = 0;
  for (const g of groups) {
    const img = images[g.imageIndex];
    if (img) logoCount++;
    if (g.joinMethods.hasQrCode && img) qrCount++;
  }

  // 上传 logos
  let done = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const img = images[g.imageIndex];
    if (!img) {
      console.log(`  logo ${i + 1}/${logoCount}: SKIP（无源图）`);
      continue;
    }
    process.stdout.write(`  logo ${done + 1}/${logoCount}... `);
    try {
      const asset = await uploadViaApi(img.logoBuf, "logo");
      logos[i] = { ...asset, width: img.logoW, height: img.logoH, byteLength: img.logoBuf.length };
      console.log(`OK ${asset.id.slice(0, 8)}`);
      done++;
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }

  // 上传 QR codes（仅对有 qr_code 的群）
  done = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.joinMethods.hasQrCode) continue;
    const img = images[g.imageIndex];
    if (!img) {
      console.log(`  QR ${i + 1}/${qrCount}: SKIP（无源图）`);
      continue;
    }
    process.stdout.write(`  QR ${done + 1}/${qrCount}... `);
    try {
      const qrBuf = await compressQR(img.sourceBuf);
      const qrMeta = await sharp(qrBuf).metadata();
      const asset = await uploadViaApi(qrBuf, "qr_code");
      qrCodes[i] = {
        ...asset,
        width: qrMeta.width,
        height: qrMeta.height,
        byteLength: qrBuf.length,
      };
      console.log(
        `OK ${asset.id.slice(0, 8)} ${(qrBuf.length / 1024).toFixed(0)}KB ${qrMeta.width}x${qrMeta.height}`,
      );
      done++;
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
    }
  }

  console.log(
    `R2 上传: ${logos.filter(Boolean).length} logos + ${qrCodes.filter(Boolean).length} QRs`,
  );
  return { logos, qrCodes };
}

// ─── 生成 SQL ─────────────────────────────────────────────
function generateSQL(groups, { logos, qrCodes }) {
  const lines = [];
  lines.push("BEGIN TRANSACTION;");
  lines.push("");

  // Asset INSERTs（先插 logos，再插 QR codes）
  const assetRefCounts = new Map();
  const logoAssetIds = new Array(groups.length).fill(null);
  const qrAssetIds = new Array(groups.length).fill(null);

  for (let i = 0; i < groups.length; i++) {
    const a = logos[i];
    if (a) {
      const t = now();
      lines.push(
        `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count, created_at, updated_at) VALUES ('${a.id}', '${a.r2Key}', 'logo', 'image/webp', ${a.byteLength}, ${a.width}, ${a.height}, 'ready', 0, '${t}', '${t}');`,
      );
      logoAssetIds[i] = a.id;
    }
  }
  for (let i = 0; i < groups.length; i++) {
    const a = qrCodes[i];
    if (a) {
      const t = now();
      lines.push(
        `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count, created_at, updated_at) VALUES ('${a.id}', '${a.r2Key}', 'qr_code', 'image/webp', ${a.byteLength}, ${a.width}, ${a.height}, 'ready', 0, '${t}', '${t}');`,
      );
      qrAssetIds[i] = a.id;
    }
  }
  lines.push("");

  // Groups + join methods + tags + likes
  for (const g of groups) {
    const id = uuid();
    const platform = pick(PLATFORMS);
    const kind = pick(KINDS);
    const rotKey = uuid();

    let title = pick(kind === "official" ? TITLES.official : TITLES.interest)
      .replace("{平台}", platform)
      .replace("{院系}", pick(["计算机", "电子", "机械", "经管", "外语", "数学"]));
    const tags = pickN(TAG_POOL, 0, 5);
    title = title.replace("{标签}", tags.length > 0 ? pick(tags) : "综合");

    const likeCount = g.status === "published" ? rInt(0, 200) : 0;
    // 与 likes 表行数保持一致（点赞接口用 COUNT(*) 覆盖 like_count，seed 必须可复现）
    const likerCount = likeCount > 0 ? rInt(1, likeCount) : 0;
    const delAt = g.isDeleted ? `'${daysAgo(rInt(1, 14))}'` : "NULL";

    // Logo: 所有群都有
    const logoAsset = logos[g.index];
    let logoR2Key = "NULL",
      logoUrl = "NULL";
    let logoW = "NULL",
      logoH = "NULL",
      logoB = "NULL";
    if (logoAsset) {
      logoR2Key = `'${logoAsset.r2Key}'`;
      logoUrl = `'${logoAsset.publicUrl}'`;
      logoW = logoAsset.width;
      logoH = logoAsset.height;
      logoB = logoAsset.byteLength;
      assetRefCounts.set(logoAsset.id, (assetRefCounts.get(logoAsset.id) ?? 0) + 1);
    }

    lines.push(
      `INSERT INTO groups (id, title, description, kind, platform, status, rotation_key, like_count, version, logo_r2_key, logo_url, logo_width, logo_height, logo_byte_length, deleted_at, created_at, updated_at) VALUES ('${id}', '${esc(title)}', '${esc(pick(DESCRIPTIONS))}', '${kind}', '${platform}', '${g.status}', '${rotKey}', ${likerCount}, 1, ${logoR2Key}, ${logoUrl}, ${logoW}, ${logoH}, ${logoB}, ${delAt}, '${daysAgo(rInt(1, 60))}', '${now()}');`,
    );

    // 加群方式
    let sortOrder = 0;
    if (g.joinMethods.hasQrCode && qrCodes[g.index]) {
      const a = qrCodes[g.index];
      const jmId = uuid();
      lines.push(
        `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES ('${jmId}', '${id}', 'qr_code', NULL, ${sortOrder}, '${a.id}');`,
      );
      sortOrder++;
      assetRefCounts.set(a.id, (assetRefCounts.get(a.id) ?? 0) + 1);
    }
    if (g.joinMethods.hasGroupNumber) {
      const jmId = uuid();
      lines.push(
        `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES ('${jmId}', '${id}', 'group_number', '${rInt(100000, 999999999)}', ${sortOrder}, NULL);`,
      );
      sortOrder++;
    }
    if (g.joinMethods.hasUrl) {
      const jmId = uuid();
      lines.push(
        `INSERT INTO join_methods (id, group_id, type, value, sort_order, asset_id) VALUES ('${jmId}', '${id}', 'url', 'https://${platform.toLowerCase()}.example.com/invite/${uuid().slice(0, 8)}', ${sortOrder}, NULL);`,
      );
    }

    // Tags
    let to = 0;
    for (const tag of tags) {
      lines.push(
        `INSERT INTO group_tags (id, group_id, tag, sort_order) VALUES ('${uuid()}', '${id}', '${esc(tag)}', ${to});`,
      );
      to++;
    }

    // Submission details (40%)
    if (Math.random() < 0.4) {
      lines.push(
        `INSERT INTO submission_details (id, group_id, contact, notes) VALUES ('${uuid()}', '${id}', ${Math.random() < 0.6 ? `'user${rInt(1, 99)}@example.com'` : "NULL"}, ${Math.random() < 0.5 ? `'${esc(pick(["请通过一下谢谢", "求拉群", "老群友推荐", ""]))}'` : "NULL"});`,
      );
    }

    // Likes（仅已发布群；行数 = like_count，保持计数可复现）
    for (let v = 0; v < likerCount; v++) {
      lines.push(
        `INSERT INTO likes (group_id, voter_hash) VALUES ('${id}', '${uuid().replace(/-/g, "").slice(0, 16)}');`,
      );
    }
    lines.push("");
  }

  // ref_count updates
  for (const [assetId, refCount] of assetRefCounts) {
    lines.push(`UPDATE assets SET ref_count = ${refCount} WHERE id = '${assetId}';`);
  }
  lines.push("COMMIT;");
  lines.push(
    `-- ${GROUP_COUNT} groups, ${logos.filter(Boolean).length} logos, ${qrCodes.filter(Boolean).length} QRs`,
  );
  // 一致性自检：like_count 必须等于 likes 实际行数（否则点赞接口会用 COUNT 覆盖，造成显示跳变）
  lines.push(
    "SELECT 'like_count_mismatch' AS check_name, COUNT(*) AS bad_count FROM (SELECT g.id FROM groups g LEFT JOIN likes l ON l.group_id = g.id GROUP BY g.id HAVING g.like_count != COUNT(l.voter_hash));",
  );
  return lines.join("\n");
}

// ─── 主流程 ────────────────────────────────────────────────
async function main() {
  console.log("═══ 全链路种子数据生成 ═══\n");
  console.log(`API: ${API_BASE}`);
  assertLocalSeedTarget();
  await authenticate();

  // 1. 下载所有图片（全部压缩logo）
  const images = await downloadAndProcess(GROUP_COUNT);
  if (images.length === 0) {
    console.error("无有效图片");
    process.exit(1);
  }

  // 2. 规划群组
  const groups = planGroups(images.length);
  console.log(
    `群组: ${groups.filter((g) => g.status === "published").length} 已发布, ${groups.filter((g) => !g.isDeleted && g.status === "pending").length} 待审核, ${groups.filter((g) => !g.isDeleted && g.status === "delisted").length} 已下架, ${groups.filter((g) => !g.isDeleted && g.status === "rejected").length} 已拒绝, ${groups.filter((g) => g.isDeleted).length} 回收站`,
  );
  const qrGroups = groups.filter((g) => g.joinMethods.hasQrCode).length;
  console.log(
    `加群方式: ${qrGroups} 个有二维码, ${groups.filter((g) => g.joinMethods.hasGroupNumber).length} 个有群号, ${groups.filter((g) => g.joinMethods.hasUrl).length} 个有链接`,
  );

  // 3. 上传
  const assets = await uploadAll(images, groups);

  // 4. 生成 SQL
  const sql = generateSQL(groups, assets);
  writeFileSync(SQL_FILE, sql, "utf-8");
  console.log(`SQL: ${SQL_FILE} (${(sql.length / 1024).toFixed(0)}KB)`);

  // 5. 执行
  try {
    execSync(
      `${NPX} wrangler d1 execute lgqh-dev --local --persist-to "${PERSIST_TO}" --file "${SQL_FILE}"`,
      {
        encoding: "utf-8",
        timeout: 300000,
        stdio: "pipe",
      },
    );
    console.log("✅ 种子数据完成");
  } catch (err) {
    console.error("❌ 执行失败:", err.stderr?.slice(0, 200) || err.message);
    console.log(`SQL 文件保留: ${SQL_FILE}`);
    process.exitCode = 1;
  }
}
main();
