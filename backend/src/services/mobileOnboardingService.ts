import { createHash, randomBytes, randomInt } from "node:crypto";
import dayjs from "dayjs";
import jwt from "jsonwebtoken";
import { Employee, MobileOnboardingSession } from "../models";
import { employeeIdIsAssigned } from "../utils/employeeSerialId";
import { findEmployeeByInviteCode, normalizeInviteCode } from "../utils/inviteCode";

const JWT_SECRET = process.env.JWT_SECRET || "allpay_super_secret";
const SESSION_HOURS = 24;
const OTP_MINUTES = 10;
const COMPANY_NAME = process.env.COMPANY_NAME || "AllPay";

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function issueOnboardingToken(sessionId: string): string {
  return jwt.sign({ typ: "mobile_onboarding", sessionId }, JWT_SECRET, { expiresIn: "24h" });
}

export function resolveOnboardingSessionId(authHeader?: string, bodyToken?: string): string | null {
  const bearer = authHeader?.split(" ")[1]?.trim();
  const raw = bearer || bodyToken?.trim();
  if (!raw) return null;
  try {
    const decoded = jwt.verify(raw, JWT_SECRET) as { typ?: string; sessionId?: string };
    if (decoded.typ === "mobile_onboarding" && decoded.sessionId) {
      return decoded.sessionId;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadActiveSession(sessionId: string) {
  const session = await MobileOnboardingSession.findOne({ id: sessionId }).exec();
  if (!session || session.completed) return null;
  if (dayjs(session.expiresAt).isBefore(dayjs())) return null;
  return session;
}

function profilePayload(emp: InstanceType<typeof Employee>) {
  return {
    name: emp.name,
    email: emp.email,
    department: emp.department,
    employeeId: employeeIdIsAssigned(emp) ? emp.id : null,
    idAssigned: employeeIdIsAssigned(emp),
    phone: emp.phone || null,
    companyName: COMPANY_NAME,
  };
}

function generateOtp(): string {
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development") {
    return "123456";
  }
  return String(randomInt(100000, 999999));
}

async function deliverOtp(email: string, phone: string | undefined, otp: string, employeeId: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[AllPay mobile OTP] Employee ${employeeId} — email ${email}${phone ? `, phone ${phone}` : ""}: ${otp}`
    );
  }
  // Hook for SMS/email provider in production (Twilio, SendGrid, Gmail SMTP, etc.)
}

/** Step 1 — mobile app enters invite code; returns employee profile from dashboard DB. */
export async function verifyMobileInviteCode(inviteCodeRaw: string) {
  const inviteCode = normalizeInviteCode(inviteCodeRaw);
  if (!inviteCode) {
    return { ok: false as const, status: 400, message: "Invite code is required." };
  }

  const emp = await findEmployeeByInviteCode(inviteCode);
  if (!emp) {
    return { ok: false as const, status: 404, message: "Invalid invite code. Ask your admin for a new one." };
  }

  const sessionId = `mob-onb-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const now = dayjs();
  await MobileOnboardingSession.create({
    id: sessionId,
    inviteCode,
    employeeId: emp.id,
    step: "profile",
    otpVerified: false,
    completed: false,
    expiresAt: now.add(SESSION_HOURS, "hour").toISOString(),
    createdAt: now.toISOString(),
  });

  return {
    ok: true as const,
    onboardingToken: issueOnboardingToken(sessionId),
    step: "profile" as const,
    nextStep: "otp" as const,
    inviteCode,
    companyName: COMPANY_NAME,
    profile: profilePayload(emp),
  };
}

/** Step 2 — verify profile (mobile app sends email, fullName, phone). */
export async function confirmMobileProfile(
  sessionId: string,
  updates?: { phone?: string; name?: string; email?: string }
) {
  const session = await loadActiveSession(sessionId);
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      message: "Session expired. Enter your invite code again.",
    };
  }

  const emp = await Employee.findOne({ id: session.employeeId, active: true }).exec();
  if (!emp) {
    return { ok: false as const, status: 404, message: "Employee record not found." };
  }

  const emailIn = updates?.email?.trim().toLowerCase();
  if (emailIn && emailIn !== emp.email.toLowerCase()) {
    const byEmail = await Employee.findOne({ email: emailIn, active: true }).exec();
    if (!byEmail) {
      return {
        ok: false as const,
        status: 404,
        message: "Ask your admin to invite you first.",
      };
    }
    if (byEmail.inviteCode && normalizeInviteCode(byEmail.inviteCode) !== normalizeInviteCode(session.inviteCode)) {
      return {
        ok: false as const,
        status: 400,
        message: "This email does not match the invite code. Use the code your admin shared with you.",
      };
    }
    session.employeeId = byEmail.id;
    await session.save();
    return confirmMobileProfile(sessionId, {
      phone: updates?.phone,
      name: updates?.name,
      email: byEmail.email,
    });
  }

  const phone = updates?.phone?.trim();
  const name = updates?.name?.trim();
  if (!phone) {
    return { ok: false as const, status: 400, message: "Phone number is required." };
  }

  const activeEmp = await Employee.findOne({ id: session.employeeId, active: true }).exec();
  if (!activeEmp) {
    return { ok: false as const, status: 404, message: "Employee record not found." };
  }

  activeEmp.phone = phone;
  session.phone = phone;
  if (name && name.length >= 2) {
    activeEmp.name = name;
  }
  await activeEmp.save();

  session.step = "otp";
  await session.save();

  return {
    ok: true as const,
    step: "otp" as const,
    nextStep: "otp" as const,
    companyName: COMPANY_NAME,
    profile: profilePayload(activeEmp),
  };
}

/** Step 3a — send OTP (logged in dev backend terminal; wire SMS/email in production). */
export async function sendMobileOnboardingOtp(sessionId: string) {
  const session = await loadActiveSession(sessionId);
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      message: "Session expired. Enter your invite code again.",
    };
  }

  const emp = await Employee.findOne({ id: session.employeeId, active: true }).exec();
  if (!emp) {
    return { ok: false as const, status: 404, message: "Employee record not found." };
  }

  const otp = generateOtp();
  const now = dayjs();
  session.otpHash = hashOtp(otp);
  session.otpExpiresAt = now.add(OTP_MINUTES, "minute").toISOString();
  session.otpVerified = false;
  session.step = "otp";
  await session.save();

  await deliverOtp(emp.email, session.phone || emp.phone, otp, emp.id);

  const maskedEmail = emp.email.replace(/^(.{2}).+(@.+)$/, "$1***$2");
  return {
    ok: true as const,
    message: `Verification code sent. Check ${maskedEmail}.`,
    expiresInSeconds: OTP_MINUTES * 60,
  };
}

/** Step 3b — verify OTP. */
export async function verifyMobileOnboardingOtp(sessionId: string, otpRaw: string) {
  const session = await loadActiveSession(sessionId);
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      message: "Session expired. Enter your invite code again.",
    };
  }

  const otp = String(otpRaw || "").trim();
  if (!otp) {
    return { ok: false as const, status: 400, message: "Verification code is required." };
  }
  if (!session.otpHash || !session.otpExpiresAt) {
    return { ok: false as const, status: 400, message: "Request a verification code first." };
  }
  if (dayjs(session.otpExpiresAt).isBefore(dayjs())) {
    return { ok: false as const, status: 400, message: "Verification code expired. Request a new one." };
  }
  if (session.otpHash !== hashOtp(otp)) {
    return { ok: false as const, status: 400, message: "Invalid verification code." };
  }

  session.otpVerified = true;
  session.step = "complete";
  await session.save();

  return {
    ok: true as const,
    step: "complete" as const,
    nextStep: "complete" as const,
  };
}

/** Step 4 — finish mobile onboarding and return employee JWT. */
export async function completeMobileOnboarding(sessionId: string) {
  const session = await MobileOnboardingSession.findOne({ id: sessionId }).exec();
  if (!session || session.completed) {
    return {
      ok: false as const,
      status: 401,
      message: "Session expired. Enter your invite code again.",
    };
  }
  if (dayjs(session.expiresAt).isBefore(dayjs())) {
    return { ok: false as const, status: 401, message: "Session expired. Enter your invite code again." };
  }
  if (!session.otpVerified) {
    return {
      ok: false as const,
      status: 400,
      message: "Complete OTP verification before finishing onboarding.",
    };
  }

  const emp = await Employee.findOne({ id: session.employeeId, active: true }).exec();
  if (!emp) {
    return { ok: false as const, status: 404, message: "Employee record not found." };
  }

  if (!emp.inviteToken) {
    emp.inviteToken = randomBytes(24).toString("hex");
  }
  emp.onboarded = true;
  await emp.save();

  session.completed = true;
  session.step = "complete";
  await session.save();

  const token = jwt.sign({ typ: "employee", employeeId: emp.id }, JWT_SECRET, { expiresIn: "60d" });

  return {
    ok: true as const,
    token,
    employeeId: emp.id,
    profile: profilePayload(emp),
    message: "Onboarding complete. Welcome to AllPay!",
  };
}
