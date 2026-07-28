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

  /**
   * 处理图片文件 → WebP
   * @param file 输入文件 (JPG/PNG/WebP)
   * @param maxBytes 最大字节数
   * @param quality WebP 质量 0-1
   */
  async function process(
    file: File,
    maxBytes = 100 * 1024,
    quality = 0.8,
  ): Promise<ProcessResult | null> {
    loading.value = true;
    error.value = "";

    try {
      // 读取文件
      const dataUrl = await readAsDataURL(file);
      const img = await loadImage(dataUrl);

      // Canvas 绘制
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.drawImage(img, 0, 0);

      // 转换为 WebP blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error("Conversion failed"));
          },
          "image/webp",
          quality,
        );
      });

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
        width: img.width,
        height: img.height,
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

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
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
      reject(new Error("Failed to load image"));
    };
    img.src = src;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
