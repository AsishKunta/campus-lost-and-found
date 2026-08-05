const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function imageUploadOptions(storage) {
  return {
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    fileFilter(req, file, callback) {
      if (!ALLOWED_IMAGE_TYPES.has(String(file.mimetype || "").toLowerCase())) {
        const error = new Error("Only JPEG, PNG, or WebP images are allowed.");
        error.code = "UNSUPPORTED_IMAGE_TYPE";
        return callback(error);
      }
      return callback(null, true);
    },
  };
}

module.exports = { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, imageUploadOptions };
