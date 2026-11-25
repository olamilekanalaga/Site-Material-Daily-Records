import { AppError, assert, sniffImage, text } from "./core";
import { readBytes } from "./http";

export function staffEmail(value: unknown) {
  const email = text(value, 200, true).toLowerCase();
  assert(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    "Enter a valid email address.",
  );
  return email;
}

export function newPassword(value: unknown, confirmation: unknown) {
  assert(
    typeof value === "string" &&
      value.length >= 12 &&
      Buffer.byteLength(value, "utf8") <= 72,
    "Use at least 12 characters and at most 72 bytes.",
  );
  assert(value === confirmation, "Passwords do not match.");
  return value;
}

export async function photoForm(request: Request) {
  const contentType = request.headers.get("content-type");
  assert(
    contentType?.startsWith("multipart/form-data"),
    "Photograph form required",
    415,
  );
  const bytes = await readBytes(request, 3 * 1024 * 1024 + 16384);
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": contentType! },
    }).formData();
  } catch {
    throw new AppError(400, "Invalid photograph form.");
  }
}

export async function profilePhoto(form: FormData) {
  const file = form.get("file");
  assert(file instanceof File && file.size > 0, "Choose a profile picture.");
  assert(file.size <= 3 * 1024 * 1024, "Profile picture exceeds 3 MiB.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  assert(file.type === mime, "Photograph content does not match file type.");
  return { bytes, mime };
}
