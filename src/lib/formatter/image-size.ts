// Minimal intrinsic-size readers for PNG / JPEG / GIF / BMP (to keep image aspect ratios in DOCX output).

export type ImgType = "png" | "jpg" | "gif" | "bmp";

export function imageTypeFromMime(mime: string): ImgType | null {
  const m = mime.toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/gif") return "gif";
  if (m === "image/bmp" || m === "image/x-ms-bmp") return "bmp";
  return null;
}

export function imageSize(buf: Uint8Array, type: ImgType): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  try {
    if (type === "png" && buf.length > 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (type === "gif" && buf.length > 10) return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (type === "bmp" && buf.length > 26) return { width: dv.getInt32(18, true), height: Math.abs(dv.getInt32(22, true)) };
    if (type === "jpg") {
      let off = 2;
      while (off < buf.length - 9) {
        if (buf[off] !== 0xff) return null;
        const marker = buf[off + 1]!;
        const len = dv.getUint16(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: dv.getUint16(off + 5), width: dv.getUint16(off + 7) };
        }
        off += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}
