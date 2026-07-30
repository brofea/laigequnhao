import { ref } from "vue";

export interface ProcessResult {
  blob: Blob;
  width: number;
  height: number;
  byteLength: number;
  previewUrl: string;
}

export interface CompressOptions {
  maxDimension: number;
  maxBytes: number;
  startQuality: number;
  minQuality: number;
  qualityStep: number;
  /** 是否保留透明度（logo=true, qr_code=false） */
  preserveAlpha: boolean;
}

export function useImageProcessor() {
  const loading = ref(false);
  const error = ref("");

  function revokePreview(url: string) {
    URL.revokeObjectURL(url);
  }

  async function process(
    file: File,
    opts: CompressOptions,
  ): Promise<ProcessResult | null> {
    loading.value = true;
    error.value = "";

    try {
      if (!file.type.startsWith("image/")) {
        error.value = "仅支持图片格式";
        loading.value = false;
        return null;
      }

      // 原始文件上限 10MB 防呆
      if (file.size > 10 * 1024 * 1024) {
        error.value = `文件过大（${formatBytes(file.size)}），请选择小于 10MB 的图片`;
        loading.value = false;
        return null;
      }

      const dataUrl = await readAsDataURL(file);
      const img = await loadImage(dataUrl);

      let { width, height } = img;

      // 缩放
      if (Math.max(width, height) > opts.maxDimension) {
        const scale = opts.maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Canvas 绘制
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 不可用");

      // 不透明模式：铺白底
      if (!opts.preserveAlpha) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);

      // 质量递减压缩
      let blob: Blob | null = null;
      let q = opts.startQuality;
      while (q >= opts.minQuality) {
        const candidate = await canvasToBlob(canvas, q / 100);
        if (candidate.size <= opts.maxBytes) {
          blob = candidate;
          break;
        }
        q -= opts.qualityStep;
      }

      // 最后一次尝试：最低质量
      if (!blob) {
        const candidate = await canvasToBlob(canvas, opts.minQuality / 100);
        if (candidate.size <= opts.maxBytes) {
          blob = candidate;
        }
      }

      if (!blob) {
        error.value = `压缩失败：最低质量仍超过 ${formatBytes(opts.maxBytes)}`;
        loading.value = false;
        return null;
      }

      const previewUrl = URL.createObjectURL(blob);

      loading.value = false;
      return {
        blob,
        width,
        height,
        byteLength: blob.size,
        previewUrl,
      };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "图片处理失败";
      loading.value = false;
      return null;
    }
  }

  return { loading, error, process, revokePreview };
}

// ── helpers ──

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("图片转换失败"));
      },
      "image/webp",
      quality,
    );
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("文件读取失败"));
      }
    };
    reader.onerror = () => {
      reject(new Error("文件读取失败"));
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error("图片加载失败"));
    };
    img.src = src;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
