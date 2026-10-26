import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
export function createDecartBridge(options: {
  apiKey?: string;
  model?: string;
  allowedOrigins?: string[];
  allowRemote?: boolean;
  directSocket?: boolean;
  authorizeSession?: (idToken: string) => Promise<boolean>;
  tokenEndpoint?: string;
  streamEndpoint?: string;
  /** Seconds per session; null (default) runs until the user stops. */
  maxSessionSeconds?: number | null;
  speed?: 'standard' | 'fast';
}): {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  close(): Promise<void>;
};
