import express, { type Express } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Keep the platform health check independent from optional authentication.
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
const allowedCorsOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

// Same-origin requests work without CORS. Cross-origin browser access is
// enabled only for explicitly configured origins.
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    callback(null, !origin || allowedCorsOrigins.has(origin));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.CLERK_SECRET_KEY?.trim()) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.warn(
    "CLERK_SECRET_KEY is not configured; public storefront routes remain available and admin routes are disabled.",
  );
}

app.use("/api", router);

// Serve the built React app from the same origin as the API in production.
if (process.env.NODE_ENV === "production") {
  const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../product-store/dist/public",
  );

  app.use(express.static(webRoot, { index: false, maxAge: "1h" }));

  app.get(
    /^(?!\/api(?:\/|$)|\/api\/__clerk(?:\/|$)).*/,
    (_req, res, next) => {
      res.sendFile(path.join(webRoot, "index.html"), (error) => {
        if (error) next(error);
      });
    },
  );
}

export default app;
