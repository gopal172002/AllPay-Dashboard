import type express from "express";
import { AdminUser } from "../models";

export type AdminPayload = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  twoFactor: boolean;
};

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminPayload;
    }
  }
}

function toPayload(doc: { toObject: () => Record<string, unknown> }): AdminPayload {
  const o = doc.toObject();
  return {
    id: String(o["id"] ?? ""),
    name: String(o["name"] ?? ""),
    email: String(o["email"] ?? ""),
    role: String(o["role"] ?? ""),
    active: Boolean(o["active"]),
    twoFactor: Boolean(o["twoFactor"])
  };
}

/** After JWT: resolve active AdminUser by auth email, or 403. */
export async function requireAdminUser(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const tokenUser = (req as express.Request & { user?: { email?: string } }).user;
  if (!tokenUser?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const email = String(tokenUser.email).trim().toLowerCase();
  const admin = await AdminUser.findOne({ email, active: true });
  if (!admin) {
    return res.status(403).json({ error: "Admin access required", code: "NOT_ADMIN" });
  }
  req.adminUser = toPayload(admin);
  next();
}

function isSuper(r: string) {
  return r === "super_admin";
}

/**
 * super_admin is always allowed; others must be in the allowlist.
 */
export function requireRoles(...allowed: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const a = req.adminUser;
    if (!a) return res.status(403).json({ error: "Admin access required" });
    if (isSuper(a.role) || allowed.includes(a.role)) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden for this role", code: "RBAC_FORBIDDEN", role: a.role, allowed });
  };
}
