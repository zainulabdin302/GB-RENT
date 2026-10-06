import path from "node:path";
export const uploadDirectory = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "public", "uploads");
export const uploadNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*\.(?:jpg|jpeg|png|webp|gif)$/;
export function validImageUrls(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  if (!value.every((v) => typeof v === "string" && v.startsWith("/uploads/") && uploadNamePattern.test(v.slice(9)))) return null;
  return [...new Set(value as string[])];
}
