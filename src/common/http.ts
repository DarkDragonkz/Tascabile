import type { Request } from '@paperback/types'

export async function fetchText(request: Request): Promise<string> {
  const [response, buffer] = await Application.scheduleRequest(request)

  if (response.status >= 400) {
    throw new Error(`Request failed with status ${response.status}`)
  }

  return Application.arrayBufferToUTF8String(buffer)
}
