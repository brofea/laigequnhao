/** SHA-256 哈希工具 */

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 对设备 ID 加 pepper 后哈希 */
export async function hashDeviceId(deviceId: string, pepper: string): Promise<string> {
  return sha256(`${deviceId}:${pepper}`);
}
