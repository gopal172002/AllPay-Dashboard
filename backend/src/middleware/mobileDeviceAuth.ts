import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "allpay_super_secret";

export type MobileRequest = Request & {
  mobileEmployeeId?: string;
};

/**
 * Mobile devices may authenticate with either:
 * - Header `X-AllPay-Sync-Secret` matching `MOBILE_SYNC_SECRET`, or
 * - `Authorization: Bearer <token>` from POST /api/mobile/auth/employee-token
 *
 * If `MOBILE_SYNC_SECRET` is unset (typical local dev), requests are allowed
 * (employee JWT still enforced when present for employee-scoped routes).
 */
export function mobileDeviceAuth(req: MobileRequest, res: Response, next: NextFunction) {
  const configuredSecret = process.env.MOBILE_SYNC_SECRET;
  const headerSecret = req.headers["x-allpay-sync-secret"];
  const provided =
    typeof headerSecret === "string"
      ? headerSecret
      : Array.isArray(headerSecret)
        ? headerSecret[0]
        : undefined;

  if (configuredSecret && provided === configuredSecret) {
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        typ?: string;
        employeeId?: string;
      };
      if (decoded.typ === "employee" && decoded.employeeId) {
        req.mobileEmployeeId = decoded.employeeId;
        return next();
      }
    } catch {
      /* fall through */
    }
  }

  if (!configuredSecret) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[AllPay] MOBILE_SYNC_SECRET unset — mobile sync endpoints are open");
    }
    return next();
  }

  return res.status(401).json({
    ok: false,
    message: "Unauthorized: set X-AllPay-Sync-Secret or use a valid employee token"
  });
}
