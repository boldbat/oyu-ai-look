import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
export function createLiveBridge(options: {
  apiOrigin?: string;
  allowedOrigins?: string[];
  ticketTtlMs?: number;
}): {
  handleRequest(req: IncomingMessage, res: ServerResponse): boolean;
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean;
  close(): Promise<void>;
};
