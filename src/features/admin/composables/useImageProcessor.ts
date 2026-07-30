import { ref } from "vue";

export interface ProcessResult {
  blob: Blob;
  width: number;
  height: number;
  byteLength: number;
  previewUrl: string;
}

export function useImageProcessor() {
  const loading = ref(false);
  const error = ref("");

  function revokePreview(url: string) {
    URL.revokeObjectURL(url);
  }

  async function process(
    file: File,
    maxBytes = 100 * 1024,
    targetBytes?: number,
    maxDimension?: number,
  ): Promise<ProcessResult | null> {
    loading.value = true;
    error.value = "";

    try {
      // 格式校验
      if (!file.type.startsWith("image/")) {
        error.value = "仅支持图片格式";
        loading.value = false;
        return null;
      }

      // 大小校验
      if (file.size > maxBytes) {
        error.value = `文件大小 ${formatBytes(file.size)} 超过限制 ${formatBytes(maxBytes)}`;
        loading.value = false;
        return null;
      }

      // 读取文件
      const dataUrl = await readAsDataURL(file);
      const img = await loadImage(dataUrl);

      let { width, height } = img;

      if (maxDimension && Math.max(width, height) > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Canvas 绘制
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 不可用");

      ctx.drawImage(img, 0, 0, width, height);

      // 转换为 WebP blob（QR codes use binary search for size target）
      let blob: Blob;
      if (targetBytes) {
        blob = await compressToTarget(canvas, targetBytes);
      } else {
        blob = await canvasToBlob(canvas);
      }

      const byteLength = blob.size;

      // 体积检查
      if (byteLength > maxBytes) {
        error.value = `图片过大（${formatBytes(byteLength)}），上限 ${formatBytes(maxBytes)}`;
        loading.value = false;
        return null;
      }

      const previewUrl = URL.createObjectURL(blob);

      const result: ProcessResult = {
        blob,
        width,
        height,
        byteLength,
        previewUrl,
      };

      loading.value = false;
      return result;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "图片处理失败";
      loading.value = false;
      return null;
    }
  }

  return { loading, error, process, revokePreview };
}

// ── helpers ──

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.8): Promise<Blob> {
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

/** Binary search quality (0.05–1.0) to fit within targetBytes */
async function compressToTarget(canvas: HTMLCanvasElement, targetBytes: number): Promise<Blob> {
  let bestWithinTarget: Blob | null = null;
  let lo = 0.05;
  let hi = 1.0;

  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mid);
    if (blob.size <= targetBytes) {
      if (!bestWithinTarget || blob.size > bestWithinTarget.size) {
        bestWithinTarget = blob;
      }
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!bestWithinTarget) {
    throw new Error(`图片压缩后仍超过 ${formatBytes(targetBytes)}`);
  }
  return bestWithinTarget;
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
