import type { IncomingMessage, ServerResponse } from 'node:http';
export function createVoiceBridge(options: {
  apiKey?: string;
  /** An ElevenLabs model id; by default the newest one the account can use. */
  model?: string;
  /** Oyu's default voice; by default a warm female voice from the account. */
  voiceId?: string;
  allowedOrigins?: string[];
  allowRemote?: boolean;
  endpoint?: string;
  fetch?: typeof fetch;
}): {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
};
