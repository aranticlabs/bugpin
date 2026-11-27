const MB = 1024 * 1024;

// Highest per-file limits the settings validators accept for videos and for images.
const MAX_VIDEO_UPLOAD_LIMIT_MB = 100;
const MAX_IMAGE_UPLOAD_LIMIT_MB = 50;

const MULTIPART_OVERHEAD_MB = 6;
const MAX_IMAGES_PER_SUBMISSION_BUDGET = 3;

// Bun rejects bodies above this size with a bare 413 before the app runs, so it must sit above
// any submission the per-file checks accept; those checks answer with structured errors instead.
// The budget is one maximum-size video plus three maximum-size images and multipart framing.
export const MAX_SUBMISSION_REQUEST_BODY_SIZE =
  (MAX_VIDEO_UPLOAD_LIMIT_MB +
    MAX_IMAGES_PER_SUBMISSION_BUDGET * MAX_IMAGE_UPLOAD_LIMIT_MB +
    MULTIPART_OVERHEAD_MB) *
  MB;

export const MAX_MESSAGE_FILES = 5;
export const MESSAGE_BODY_OVERHEAD_BYTES = 64 * 1024;
const MAX_MESSAGE_REQUEST_BODY_SIZE =
  MAX_MESSAGE_FILES * MAX_VIDEO_UPLOAD_LIMIT_MB * MB + MESSAGE_BODY_OVERHEAD_BYTES;

export const MAX_REQUEST_BODY_SIZE = Math.max(
  MAX_SUBMISSION_REQUEST_BODY_SIZE,
  MAX_MESSAGE_REQUEST_BODY_SIZE
);
