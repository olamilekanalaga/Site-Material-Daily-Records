export const deliveryPhotoLimit = 500_000;

export async function prepareDeliveryPhoto(photo: File) {
  const bytes = new Uint8Array(await photo.slice(0, 16).arrayBuffer());
  const valid =
    (photo.type === "image/png" &&
      photo.size > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, i) => bytes[i] === byte,
      )) ||
    (photo.type === "image/jpeg" &&
      photo.size > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255) ||
    (photo.type === "image/webp" &&
      photo.size > 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
  if (!valid) throw new Error("Choose a valid JPEG, PNG or WebP image.");
  if (photo.size <= deliveryPhotoLimit) return photo;

  const source = URL.createObjectURL(photo);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image processing is unavailable.");
    for (const maxEdge of [1600, 1200, 900, 640]) {
      const scale = Math.min(
        1,
        maxEdge / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.68]) {
        const compressed = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (
          compressed?.type === "image/jpeg" &&
          compressed.size <= deliveryPhotoLimit
        ) {
          return new File(
            [compressed],
            photo.name.replace(/\.[^.]+$/, "") + ".jpg",
            {
              type: "image/jpeg",
            },
          );
        }
      }
    }
  } catch {
    throw new Error(
      "This photo could not be processed. Choose another JPEG, PNG or WebP image.",
    );
  } finally {
    URL.revokeObjectURL(source);
  }
  throw new Error(
    "This photo could not be reduced to 500 KB. Choose another image.",
  );
}
