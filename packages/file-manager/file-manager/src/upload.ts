/** Bounded request-body consumption for the streaming upload route. */
import { StewardError } from './types.ts'

/**
 * Read upload bytes without exceeding the caller's accepted body size.
 * @param request - Fetch request whose body has not been consumed.
 * @param maximumBytes - Maximum accepted upload size in bytes.
 * @returns The complete body; oversized or failed streams perform no file writes.
 */
export async function readUploadBody(request: Request, maximumBytes: number): Promise<Buffer> {
  const reader = request.body?.getReader()
  if (reader === undefined) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) return Buffer.concat(chunks, size)
      size += part.value.byteLength
      if (size > maximumBytes) {
        await reader.cancel()
        throw new StewardError('UPLOAD_TOO_LARGE', 'upload exceeds the 512 MB limit', 413)
      }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
}
