import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { MAX_SUBMISSION_REQUEST_BODY_SIZE } from '../utils/request-limits.js';

const payloadTooLarge = {
  success: false,
  error: 'PAYLOAD_TOO_LARGE',
  message: 'Request body is too large',
} as const;

export const requestBodyLimit: MiddlewareHandler = async (c, next) => {
  const request = c.req.raw;
  // Message uploads enforce their project limit after staff authentication.
  if (
    !request.body ||
    (request.method === 'POST' && /^\/api\/reports\/[^/]+\/reporter-messages$/.test(c.req.path))
  ) {
    return next();
  }
  if (Number(request.headers.get('content-length')) > MAX_SUBMISSION_REQUEST_BODY_SIZE) {
    return c.json(payloadTooLarge, 413);
  }
  const reader = request.body.getReader();
  let bytes = 0;
  let exceeded = false;
  const body = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          return;
        }
        bytes += chunk.value.byteLength;
        if (bytes > MAX_SUBMISSION_REQUEST_BODY_SIZE) {
          exceeded = true;
          throw new HTTPException(413, { message: payloadTooLarge.message });
        }
        controller.enqueue(chunk.value);
      },
    },
    { highWaterMark: 0 }
  );
  c.req.raw = new Request(request, { body });
  try {
    await next();
    if (exceeded) c.res = c.json(payloadTooLarge, 413);
  } finally {
    void reader.cancel().catch(() => undefined);
  }
};
