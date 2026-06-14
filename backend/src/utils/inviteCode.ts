import { randomInt } from "node:crypto";
import { Employee } from "../models";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeInviteCode(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Human-readable code for mobile app entry, e.g. ALLPAY7K3M2N */
export async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let suffix = "";
    for (let i = 0; i < 6; i += 1) {
      suffix += CODE_CHARS[randomInt(0, CODE_CHARS.length)]!;
    }
    const code = `ALLPAY${suffix}`;
    const exists = await Employee.findOne({ inviteCode: code }).select("_id").lean();
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

export async function findEmployeeByInviteCode(raw: string) {
  const code = normalizeInviteCode(raw);
  if (!code) return null;
  return Employee.findOne({ inviteCode: code, active: true }).exec();
}

export async function ensureEmployeeInviteCode(emp: {
  inviteCode?: string;
  save: () => Promise<unknown>;
}): Promise<string> {
  if (emp.inviteCode?.trim()) {
    return normalizeInviteCode(emp.inviteCode);
  }
  const code = await generateUniqueInviteCode();
  emp.inviteCode = code;
  await emp.save();
  return code;
}
