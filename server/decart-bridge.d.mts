import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
export function createDecartBridge(options: {
  apiKey?: string;
  model?: string;
  allowedOrigins?: string[];
  allowRemote?: boolean;
  tokenEndpoint?: string;
  streamEndpoint?: string;
}): {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  close(): Promise<void>;
};
