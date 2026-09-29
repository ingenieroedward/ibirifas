import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { subscribeToRaffle } from "@/lib/realtime";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream for one raffle. It sends a tiny "changed" event
 * whenever a number is sold, collected or released; the browser then fetches
 * the details itself. The comment line every 25s keeps proxies from closing an
 * idle connection.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true } });
  const tenantId = tenantIdFor(user);
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let send: (chunk: string) => void = () => {};
  let cleanup = () => {};

  // Subscribe before building the response so that a full raffle gets a proper
  // 429. A dropped socket would make the browser retry every 3s indefinitely.
  const unsubscribe = subscribeToRaffle(id, (change) => send(`event: changed\ndata: ${JSON.stringify(change)}\n\n`));
  if (!unsubscribe) {
    return NextResponse.json({ error: "Demasiadas conexiones abiertas" }, { status: 429 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      send = (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      };
      req.signal.addEventListener("abort", cleanup);

      // `retry` tells the browser how long to wait before reconnecting.
      send("retry: 3000\n\n: connected\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops compression from buffering the stream; the header
      // below does the same for nginx-style proxies.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
