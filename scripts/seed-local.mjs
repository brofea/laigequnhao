#!/usr/bin/env node
/**
 * 全链路种子数据脚本
 * 用法: node scripts/seed-local.mjs
 *
 * 前提: 先启动 pnpm dev（默认通过单地址 localhost:5173 访问 Worker API）
 * 若单独运行 pnpm worker:dev，请设置 SEED_API_BASE=http://127.0.0.1:8788/api/v1。
 *
 * 下载 → 压缩（logo 128px/128KB, QR 1024px/1MB）→ 通过 API 上传 R2 → 写 D1
 *
 * 群组分布: 100已发布 + 10待审核 + 10已下架 + 10已拒绝 + 10回收站(状态=已拒绝) = 140
 * 所有140个群都有头像（logo压缩）
 * 每种加群方式独立50%概率出现，但每组至少一种
 * 有qr_code的群，二维码图片与头像同源，尺寸策略不同（仅这些群额外压缩QR版本）
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUP_COUNT = 140;
const SQL_FILE = join(__dirname, "..", "seed-local.sql");
export const DEFAULT_SEED_API_BASE = "http://localhost:5173/api/v1";
export const API_BASE = resolveSeedApiBase();
const PERSIST_TO = process.env.WRANGLER_PERSIST_TO ?? resolve(__dirname, "..", ".wrangler/state");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

export function resolveSeedApiBase(env = process.env) {
  const configured = env.SEED_API_BASE?.trim();
  return (configured || DEFAULT_SEED_API_BASE).replace(/\/+$/, "");
}

export function validateSeedApiBase(apiBase) {
  let url;
  try {
    url = new URL(apiBase);
  } catch (error) {
    throw new Error(`SEED_API_BASE 不是有效的本地 API 地址：${apiBase}`, { cause: error });
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!/^https?:$/.test(url.protocol) || !["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(`seed 只能访问 loopback 本地 API；当前 SEED_API_BASE 为 ${apiBase}`);
  }

  return url;
}

export function formatSeedApiUnavailableError(apiBase, error) {
  const reason = error instanceof Error && error.message ? ` 原始错误：${error.message}` : "";
  return `无法连接本地 Seed API：${apiBase}。请先运行 pnpm dev，确认 http://localhost:5173 可访问；如果使用其他本地端口，请明确设置 loopback 的 SEED_API_BASE（例如 SEED_API_BASE=http://127.0.0.1:8788/api/v1）。${reason}`;
}

export async function requestSeedApi(
  path,
  options = {},
  { apiBase = API_BASE, fetchImpl = fetch } = {},
) {
  try {
    return await fetchImpl(`${apiBase}${path}`, options);
  } catch (error) {
    throw new Error(formatSeedApiUnavailableError(apiBase, error), { cause: error });
  }
}

function assertLocalSeedTarget() {
  validateSeedApiBase(API_BASE);
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

export async function assertApiReachable(apiBase = API_BASE, fetchImpl = fetch) {
  validateSeedApiBase(apiBase);
  try {
    const response = await requestSeedApi(
      "/health",
      {
        signal: AbortSignal.timeout(3000),
      },
      { apiBase, fetchImpl },
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("无法连接本地 Seed API")) {
      throw error;
    }
    throw new Error(formatSeedApiUnavailableError(apiBase, error), { cause: error });
  }
}

// ─── 压缩参数（与 shared/contracts/asset.ts 同步）─────────
const LOGO_MAX_DIM = 128;
const LOGO_MAX_BYTES = 128 * 1024;

const QR_MAX_DIM = 1024;
const QR_MAX_BYTES = 1024 * 1024;
export const QR_QUALITY_LADDER = Object.freeze([0.9, 0.8, 0.7]);

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
// 与 site.config.ts 的默认候选项保持一致；API 仍允许历史或自定义文本性质。
const KINDS = ["官方", "非官方", "社区", "活动", "关系"];
const TITLE_TEMPLATE_GROUP = {
  官方: "official",
  非官方: "interest",
  社区: "interest",
  活动: "interest",
  关系: "interest",
};

// ─── 图片压缩（logo 单次 PNG；QR 固定 JPEG quality ladder）────────
async function compressToSize(buf, w, h, opts) {
  const pipeline = sharp(buf).resize(w, h);
  if (opts.preserveAlpha) pipeline.ensureAlpha();
  else pipeline.flatten({ background: "#ffffff" });
  const encoded =
    opts.format === "jpeg"
      ? await pipeline.jpeg({ quality: Math.round(opts.quality * 100) }).toBuffer()
      : await pipeline.png().toBuffer();
  return encoded.length <= opts.maxBytes ? encoded : null;
}

// ─── 下载 + 处理图片（全部下载并压缩logo；QR压缩在后续按需进行）───
async function downloadAndProcess(count) {
  console.log(`下载 + 压缩 ${count} 张图片（logo）...`);
  const results = [];
  for (let i = 0; i < count; i++) {
    try {
      const res = await fetch("https://www.loliapi.com/acg/", { redirect: "manual" });
      const imgUrl = res.headers.get("location") || `https://picsum.photos/seed/lgqh-${i}/800/600`;
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

      // Logo 版本: 128px, 128KB, 保留 alpha，单次 PNG 编码
      const lw =
        Math.max(ow, oh) > LOGO_MAX_DIM ? Math.round((ow * LOGO_MAX_DIM) / Math.max(ow, oh)) : ow;
      const lh =
        Math.max(ow, oh) > LOGO_MAX_DIM ? Math.round((oh * LOGO_MAX_DIM) / Math.max(ow, oh)) : oh;
      const logoBuf = await compressToSize(buf, lw, lh, {
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
  const failed = results.findIndex((item) => !item);
  if (failed >= 0 || results.length !== count) {
    throw new Error(
      `图片处理失败：计划 ${count} 张，成功 ${results.filter(Boolean).length} 张（首个失败索引 ${failed}）。`,
    );
  }
  console.log(`  完成 ${results.length}/${count} 张（有效）`);
  return results;
}

// ─── 按需生成 QR 压缩版本 ──────────────────────────────────
async function compressQR(sourceBuf) {
  const meta = await sharp(sourceBuf).metadata();
  const ow = meta.width,
    oh = meta.height;
  const qw = Math.max(ow, oh) > QR_MAX_DIM ? Math.round((ow * QR_MAX_DIM) / Math.max(ow, oh)) : ow;
  const qh = Math.max(ow, oh) > QR_MAX_DIM ? Math.round((oh * QR_MAX_DIM) / Math.max(ow, oh)) : oh;
  for (const quality of QR_QUALITY_LADDER) {
    const jpeg = await compressToSize(sourceBuf, qw, qh, {
      maxBytes: QR_MAX_BYTES,
      preserveAlpha: false,
      format: "jpeg",
      quality,
    });
    if (jpeg) return jpeg;
  }
  throw new Error(`二维码 JPEG 在 quality ${QR_QUALITY_LADDER.join("、")} 下均超过 1MB。`);
}

// ─── 规划所有群组 ──────────────────────────────────────────
function planGroups(imageCount) {
  if (imageCount !== GROUP_COUNT) {
    throw new Error(`图片数量必须与计划一致：需要 ${GROUP_COUNT} 张，实际 ${imageCount} 张。`);
  }
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

    // 每个计划群组必须拥有独立成功处理的头像输入。
    const imageIndex = i;

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
  const res = await requestSeedApi("/admin/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: readAdminPassword() }),
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
  const contentType = purpose === "qr_code" ? "image/jpeg" : "image/png";
  const extension = purpose === "qr_code" ? "jpg" : "png";
  const b = Buffer.isBuffer(buffer) ? new Blob([buffer], { type: contentType }) : buffer;
  const form = new FormData();
  form.append("file", b, `${purpose}.${extension}`);
  form.append("purpose", purpose);
  const headers = { "X-CSRF-Token": csrfToken };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  const res = await requestSeedApi("/admin/assets", {
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

  // 所有 140 个群组必须有头像；二维码群组必须有二维码资源。
  const logoCount = groups.length;
  let qrCount = 0;
  for (const g of groups) {
    if (g.joinMethods.hasQrCode) qrCount++;
  }

  // 上传 logos
  let done = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const img = images[g.imageIndex];
    if (!img) throw new Error(`logo ${i + 1}/${logoCount} 缺少已处理图片。`);
    process.stdout.write(`  logo ${done + 1}/${logoCount}... `);
    const asset = await uploadViaApi(img.logoBuf, "logo");
    logos[i] = { ...asset, width: img.logoW, height: img.logoH, byteLength: img.logoBuf.length };
    console.log(`OK ${asset.id.slice(0, 8)}`);
    done++;
  }

  // 上传 QR codes（仅对有 qr_code 的群）
  done = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (!g.joinMethods.hasQrCode) continue;
    const img = images[g.imageIndex];
    if (!img) throw new Error(`QR ${i + 1}/${qrCount} 缺少已处理图片。`);
    process.stdout.write(`  QR ${done + 1}/${qrCount}... `);
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
  }

  console.log(
    `R2 上传: ${logos.filter(Boolean).length} logos + ${qrCodes.filter(Boolean).length} QRs`,
  );
  if (
    logos.some((asset) => !asset) ||
    groups.some((g, index) => g.joinMethods.hasQrCode && !qrCodes[index])
  ) {
    throw new Error("资源上传未完整完成，拒绝生成缺图 SQL。");
  }
  return { logos, qrCodes };
}

// ─── 生成 SQL ─────────────────────────────────────────────
/** 幂等写入 asset：空库插入，已存在（staged，来自上传接口）则原地升级为 ready */
function assetUpsertSql(a, purpose, t) {
  const contentType = purpose === "qr_code" ? "image/jpeg" : "image/png";
  return (
    `INSERT INTO assets (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count, created_at, updated_at) VALUES ('${a.id}', '${a.r2Key}', '${purpose}', '${contentType}', ${a.byteLength}, ${a.width}, ${a.height}, 'ready', 0, '${t}', '${t}') ` +
    `ON CONFLICT(id) DO UPDATE SET r2_key = excluded.r2_key, purpose = excluded.purpose, content_type = excluded.content_type, byte_length = excluded.byte_length, width = excluded.width, height = excluded.height, status = excluded.status, ref_count = 0, updated_at = excluded.updated_at;`
  );
}

function generateSQL(groups, { logos, qrCodes }) {
  const lines = [];
  lines.push("BEGIN TRANSACTION;");
  lines.push("");

  // Asset upserts（先插 logos，再插 QR codes）
  // 上传接口已把 asset 行写入 D1（status='staged'），此处把 staged 原地升级为 ready；
  // 空库时则直接插入。不能用普通 INSERT，否则与已有行主键冲突。
  const assetRefCounts = new Map();
  const logoAssetIds = new Array(groups.length).fill(null);
  const qrAssetIds = new Array(groups.length).fill(null);

  for (let i = 0; i < groups.length; i++) {
    const a = logos[i];
    if (a) {
      const t = now();
      lines.push(assetUpsertSql(a, "logo", t));
      logoAssetIds[i] = a.id;
    }
  }
  for (let i = 0; i < groups.length; i++) {
    const a = qrCodes[i];
    if (a) {
      const t = now();
      lines.push(assetUpsertSql(a, "qr_code", t));
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

    let title = pick(TITLES[TITLE_TEMPLATE_GROUP[kind]])
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

export { generateSQL };

function executeLocalSqlJson(command) {
  const output = execSync(
    `${NPX} wrangler d1 execute lgqh-dev --local --persist-to "${PERSIST_TO}" --command "${command}" --json`,
    { cwd: resolve(__dirname, ".."), encoding: "utf-8", timeout: 30000, stdio: "pipe" },
  );
  const ansiEscape = String.fromCharCode(27);
  const normalized = output.replace(new RegExp(`${ansiEscape}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
  const jsonStart = normalized.indexOf("[");
  if (jsonStart < 0) throw new Error("无法解析 seed D1 验收结果。");
  const payload = JSON.parse(normalized.slice(jsonStart));
  return payload[0]?.results ?? [];
}

async function verifySeedState(groups, assets) {
  const expectedQrCount = groups.filter((group) => group.joinMethods.hasQrCode).length;
  const expectedAssetCount = GROUP_COUNT + expectedQrCount;
  const [stats] = executeLocalSqlJson(`
    SELECT
      (SELECT COUNT(*) FROM groups) AS groups,
      (SELECT COUNT(*) FROM groups WHERE logo_r2_key IS NOT NULL AND logo_url IS NOT NULL) AS logo_references,
      (SELECT COUNT(*) FROM assets) AS assets,
      (SELECT COUNT(*) FROM assets WHERE purpose = 'logo' AND content_type = 'image/png' AND status = 'ready') AS ready_logos,
      (SELECT COUNT(*) FROM assets WHERE purpose = 'qr_code' AND content_type = 'image/jpeg' AND status = 'ready') AS ready_qrs,
      (SELECT COUNT(*) FROM join_methods WHERE type = 'qr_code') AS qr_methods,
      (SELECT COUNT(*) FROM join_methods WHERE type = 'qr_code' AND asset_id IS NOT NULL) AS qr_references,
      (SELECT COUNT(*) FROM assets WHERE ref_count = 0) AS orphan_assets,
      (SELECT COUNT(*) FROM assets a WHERE a.ref_count !=
        (SELECT COUNT(*) FROM groups g WHERE g.logo_r2_key = a.r2_key) +
        (SELECT COUNT(*) FROM join_methods jm WHERE jm.asset_id = a.id)) AS ref_count_mismatches,
      (SELECT COUNT(*) FROM assets WHERE (purpose = 'logo' AND r2_key NOT LIKE 'logo/%.png') OR (purpose = 'qr_code' AND r2_key NOT LIKE 'qr_code/%.jpg')) AS wrong_keys
  `);
  const expected = {
    groups: GROUP_COUNT,
    logo_references: GROUP_COUNT,
    assets: expectedAssetCount,
    ready_logos: GROUP_COUNT,
    ready_qrs: expectedQrCount,
    qr_methods: expectedQrCount,
    qr_references: expectedQrCount,
    orphan_assets: 0,
    ref_count_mismatches: 0,
    wrong_keys: 0,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (Number(stats?.[key]) !== expectedValue) {
      throw new Error(
        `seed D1 验收失败：${key} 期望 ${expectedValue}，实际 ${String(stats?.[key])}。`,
      );
    }
  }

  const persistedAssets = [...assets.logos, ...assets.qrCodes].filter(Boolean);
  for (const asset of persistedAssets) {
    const response = await fetch(asset.publicUrl);
    if (!response.ok) throw new Error(`seed R2 验收失败：${asset.r2Key} HTTP ${response.status}。`);
    const expectedType = asset.r2Key.startsWith("qr_code/") ? "image/jpeg" : "image/png";
    const responseType = response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase();
    if (responseType !== expectedType) {
      throw new Error(
        `seed MIME 验收失败：${asset.r2Key} 期望 ${expectedType}，实际 ${responseType}。`,
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.byteLength !== asset.byteLength) {
      throw new Error(`seed 字节验收失败：${asset.r2Key} 元数据与对象大小不一致。`);
    }
    const metadata = await sharp(body).metadata();
    if (metadata.format !== (expectedType === "image/jpeg" ? "jpeg" : "png")) {
      throw new Error(`seed 格式验收失败：${asset.r2Key}。`);
    }
    if (metadata.width !== asset.width || metadata.height !== asset.height) {
      throw new Error(`seed 尺寸验收失败：${asset.r2Key} 元数据与对象尺寸不一致。`);
    }
    if (expectedType === "image/png" && metadata.hasAlpha !== true) {
      throw new Error(`seed alpha 验收失败：${asset.r2Key} 不是带 alpha 通道的 PNG。`);
    }
  }
  console.log(
    `✅ seed 验收通过：${GROUP_COUNT} groups, ${GROUP_COUNT} logos, ${expectedQrCount} QRs；D1/R2 数据保留。`,
  );
}

// ─── 主流程 ────────────────────────────────────────────────
export async function main() {
  console.log("═══ 全链路种子数据生成 ═══\n");
  console.log(`API: ${API_BASE}`);
  await assertApiReachable();
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
  if (assets.logos.length !== GROUP_COUNT || assets.logos.some((asset) => !asset)) {
    throw new Error(
      `seed 头像验收失败：需要 ${GROUP_COUNT} 个，实际 ${assets.logos.filter(Boolean).length} 个。`,
    );
  }
  const expectedQrCount = groups.filter((group) => group.joinMethods.hasQrCode).length;
  if (assets.qrCodes.filter(Boolean).length !== expectedQrCount) {
    throw new Error(
      `seed 二维码验收失败：需要 ${expectedQrCount} 个，实际 ${assets.qrCodes.filter(Boolean).length} 个。`,
    );
  }

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
    await verifySeedState(groups, assets);
  } catch (err) {
    console.error("❌ 执行失败:", err.stderr?.slice(0, 200) || err.message);
    console.log(`SQL 文件保留: ${SQL_FILE}`);
    process.exitCode = 1;
  }
}
export async function runSeedCli() {
  try {
    await main();
  } catch (error) {
    console.error(`❌ seed 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(__dirname, "seed-local.mjs");
if (isMainModule) await runSeedCli();
