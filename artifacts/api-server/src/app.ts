
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

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

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
