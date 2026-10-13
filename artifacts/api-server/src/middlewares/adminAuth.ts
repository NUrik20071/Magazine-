import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  if (adminEmails.size === 0) {
    res.status(403).json({ error: "Administrator access has not been configured." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const hasVerifiedAdminEmail = user.emailAddresses.some(
      (address) =>
        address.verification?.status === "verified" &&
        adminEmails.has(address.emailAddress.trim().toLowerCase()),
    );

    if (!hasVerifiedAdminEmail) {
      res.status(403).json({ error: "Administrator access required." });
      return;
    }

    next();
  } catch (error) {
    req.log.error({ err: error }, "Unable to verify administrator identity");
    res.status(503).json({ error: "Unable to verify administrator identity." });
  }
};
