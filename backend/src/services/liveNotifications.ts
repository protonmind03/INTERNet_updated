import type { Response } from "express";
import type { Pool, PoolClient } from "pg";

type Recipient = {
  role: "coordinator" | "student" | "supervisor";
  id: string;
};

type NotificationPayload = {
  id: number;
  title: string;
  message: string;
  type: string;
  created_at: string;
};

const streams = new Map<string, Set<Response>>();
const MAX_STREAMS_PER_ACCOUNT = 10;

function recipientKey(recipient: Recipient): string {
  return `${recipient.role}:${recipient.id}`;
}

export function registerNotificationStream(
  recipient: Recipient,
  response: Response
): () => void {
  const key = recipientKey(recipient);
  const current = streams.get(key) || new Set<Response>();
  // One account needs a stream per open tab or device, not dozens. The
  // oldest goes first; a tab that is still open reconnects by itself.
  while (current.size >= MAX_STREAMS_PER_ACCOUNT) {
    const oldest = current.values().next().value;
    if (!oldest) break;
    current.delete(oldest);
    oldest.end();
  }
  current.add(response);
  streams.set(key, current);
  response.write(`event: connected\ndata: {}\n\n`);

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(": keep-alive\n\n");
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    current.delete(response);
    if (current.size === 0) streams.delete(key);
  };
}

export function closeNotificationStreams(recipient: Recipient): void {
  const key = recipientKey(recipient);
  const listeners = streams.get(key);
  if (!listeners) return;
  for (const response of listeners) {
    response.end();
  }
  streams.delete(key);
}

export function publishNotification(
  recipient: Recipient,
  payload: NotificationPayload
): void {
  const listeners = streams.get(recipientKey(recipient));
  if (!listeners) return;

  const event = `event: notification\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of listeners) {
    if (response.writableEnded || response.destroyed) {
      listeners.delete(response);
      continue;
    }
    response.write(event);
  }
}

export function startPostgresNotificationListener(pool: Pool): void {
  let client: PoolClient | undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let connecting = false;

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      reconnect();
    }, 5000);
  };

  const reconnect = () => {
    if (connecting || reconnectTimer) return;
    connecting = true;
    void pool
      .connect()
      .then(async (connection) => {
        client = connection;
        try {
          await connection.query("LISTEN internet_notifications");
        } catch (error) {
          connection.release(true);
          if (client === connection) client = undefined;
          throw error;
        }
        connecting = false;
        connection.on("notification", (event) => {
          if (event.channel !== "internet_notifications" || !event.payload) return;
          try {
            const message = JSON.parse(event.payload) as {
              recipient: Recipient;
              notification: NotificationPayload;
            };
            publishNotification(message.recipient, message.notification);
          } catch (error) {
            console.error("INVALID POSTGRES NOTIFICATION EVENT:", error);
          }
        });
        connection.on("error", (error) => {
          console.error("POSTGRES NOTIFICATION LISTENER ERROR:", error);
          connection.release(true);
          if (client === connection) client = undefined;
          scheduleReconnect();
        });
      })
      .catch((error: unknown) => {
        connecting = false;
        console.error("POSTGRES NOTIFICATION LISTENER START ERROR:", error);
        scheduleReconnect();
      });
  };

  reconnect();
}
