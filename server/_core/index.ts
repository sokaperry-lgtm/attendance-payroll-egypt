import "dotenv/config";
import { ensureEnterpriseSchema } from "../enterprise-schema";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { INTERNAL_SESSION_COOKIE } from "../../shared/const";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  try { await ensureEnterpriseSchema(); } catch (error) { console.warn("[Database] Enterprise schema bootstrap skipped:", error); }
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // Staff auth REST endpoints used by the web auth bootstrap/logout flow.
  // Keep these aligned with the tRPC auth procedures so a refresh after login
  // can recover and clear the same server-side session.
  app.get("/api/auth/me", async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const cookieToken = parseCookieHeader(req.headers.cookie ?? "")[INTERNAL_SESSION_COOKIE] ?? null;
    const staff = await db.getStaffBySessionToken(bearer || cookieToken);
    if (!staff) {
      res.status(401).json({ user: null });
      return;
    }
    res.json({
      user: {
        id: staff.id,
        openId: String(staff.id),
        name: staff.name,
        email: null,
        loginMethod: "staff",
        lastSignedIn: new Date().toISOString(),
      },
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;
    const cookieToken = parseCookieHeader(req.headers.cookie ?? "")[INTERNAL_SESSION_COOKIE] ?? null;
    await db.deleteStaffSession(bearer || cookieToken);
    res.clearCookie(INTERNAL_SESSION_COOKIE, getSessionCookieOptions(req));
    res.json({ success: true });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Serve the exported web build (from `expo export -p web`) so the whole
  // app (API + frontend) runs as a single service. The build lives at
  // <repo root>/dist-web. We resolve it from the current working directory
  // (not __dirname) because __dirname differs between `tsx` (dev, runs the
  // TS source in server/_core) and the esbuild bundle (prod, runs from
  // dist/index.js) — process.cwd() is the repo root in both cases since
  // that's where `npm run dev` / `npm start` are invoked from.
  const webBuildDir = path.resolve(process.cwd(), "dist-web");
  if (fs.existsSync(webBuildDir)) {
    app.use(express.static(webBuildDir, { extensions: ["html"] }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      const notFoundPath = path.join(webBuildDir, "+not-found.html");
      const indexPath = path.join(webBuildDir, "index.html");
      res.sendFile(fs.existsSync(notFoundPath) ? notFoundPath : indexPath);
    });
  } else {
    console.warn(
      `[web] dist-web not found at ${webBuildDir} — only the API will be served. Run "npm run build:web" to generate it.`,
    );
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  // In production (Railway, etc.) the platform tells us the exact port it
  // will route traffic to — we must bind that port directly, never fall
  // back to a different one or the platform's proxy won't find us.
  const port = process.env.NODE_ENV === "production"
    ? preferredPort
    : await findAvailablePort(preferredPort);

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
