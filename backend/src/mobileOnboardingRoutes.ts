import type { Router } from "express";
import {
  completeMobileOnboarding,
  confirmMobileProfile,
  resolveOnboardingSessionId,
  sendMobileOnboardingOtp,
  verifyMobileInviteCode,
  verifyMobileOnboardingOtp,
} from "./services/mobileOnboardingService";

function pickInviteCode(body: Record<string, unknown>): string {
  return String(body.inviteCode ?? body.code ?? body.companyInviteCode ?? "").trim();
}

function pickOtp(body: Record<string, unknown>): string {
  return String(body.otp ?? body.verificationCode ?? body.code ?? "").trim();
}

function pickProfileFields(body: Record<string, unknown>) {
  const email = typeof body.email === "string" ? body.email : undefined;
  const phone =
    typeof body.phone === "string"
      ? body.phone
      : typeof body.mobile === "string"
        ? body.mobile
        : undefined;
  const name =
    typeof body.fullName === "string"
      ? body.fullName
      : typeof body.name === "string"
        ? body.name
        : undefined;
  return { email, phone, name };
}

function profileHandler() {
  return async (req: import("express").Request, res: import("express").Response) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const sessionId = resolveOnboardingSessionId(req.headers.authorization, pickOnboardingToken(body));
      if (!sessionId) return fail(res, 401, "onboardingToken is required.");
      const fields = pickProfileFields(body);
      const result = await confirmMobileProfile(sessionId, fields);
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  };
}

function pickOnboardingToken(body: Record<string, unknown>): string | undefined {
  const t = body.onboardingToken ?? body.sessionToken;
  return typeof t === "string" ? t : undefined;
}

function fail(res: import("express").Response, status: number, message: string) {
  return res.status(status).json({ ok: false, message });
}

/** Mobile app onboarding — invite code → profile → OTP → complete. */
export function registerMobileOnboardingRoutes(router: Router) {
  const verifyInviteHandler = async (req: import("express").Request, res: import("express").Response) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const result = await verifyMobileInviteCode(pickInviteCode(body));
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  };

  router.post("/mobile/onboarding/verify-invite", verifyInviteHandler);
  router.post("/mobile/onboarding/company-invite", verifyInviteHandler);

  const handleProfile = profileHandler();
  router.post("/mobile/onboarding/confirm-profile", handleProfile);
  router.post("/mobile/onboarding/verify-profile", handleProfile);

  router.post("/mobile/onboarding/send-otp", async (req, res) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const sessionId = resolveOnboardingSessionId(req.headers.authorization, pickOnboardingToken(body));
      if (!sessionId) return fail(res, 401, "onboardingToken is required.");
      const result = await sendMobileOnboardingOtp(sessionId);
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  });

  router.post("/mobile/onboarding/verify-otp", async (req, res) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const sessionId = resolveOnboardingSessionId(req.headers.authorization, pickOnboardingToken(body));
      if (!sessionId) return fail(res, 401, "onboardingToken is required.");
      const result = await verifyMobileOnboardingOtp(sessionId, pickOtp(body));
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  });

  router.post("/mobile/onboarding/complete", async (req, res) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const sessionId = resolveOnboardingSessionId(req.headers.authorization, pickOnboardingToken(body));
      if (!sessionId) return fail(res, 401, "onboardingToken is required.");
      const result = await completeMobileOnboarding(sessionId);
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  });

  router.post("/mobile/onboarding/complete-onboarding", async (req, res) => {
    try {
      const body = (req.body as Record<string, unknown>) || {};
      const sessionId = resolveOnboardingSessionId(req.headers.authorization, pickOnboardingToken(body));
      if (!sessionId) return fail(res, 401, "onboardingToken is required.");
      const result = await completeMobileOnboarding(sessionId);
      if (!result.ok) return fail(res, result.status, result.message);
      res.json(result);
    } catch (error) {
      res.status(500).json({ ok: false, message: (error as Error).message });
    }
  });
}
