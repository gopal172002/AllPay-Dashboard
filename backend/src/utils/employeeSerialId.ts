import { randomBytes } from "node:crypto";
import { Employee } from "../models";

const SERIAL_PATTERN = /^emp(\d+)$/i;

export function isSerialEmployeeId(id: string): boolean {
  return SERIAL_PATTERN.test(String(id || "").trim());
}

export function isPendingEmployeeId(id: string): boolean {
  return String(id || "").startsWith("PEND-");
}

export function normalizeSerialEmployeeId(id: string): string {
  const trimmed = String(id || "").trim();
  const match = SERIAL_PATTERN.exec(trimmed);
  if (match) return `emp${match[1]}`;
  return trimmed.toLowerCase();
}

export function makePendingEmployeeId(): string {
  return `PEND-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

export async function getNextEmployeeSerialId(): Promise<string> {
  const employees = await Employee.find({}).select("id").lean();
  let max = 0;
  for (const row of employees) {
    const match = SERIAL_PATTERN.exec(String(row.id || ""));
    if (match) max = Math.max(max, parseInt(match[1]!, 10));
  }
  return `emp${max + 1}`;
}

export function employeeIdIsAssigned(emp: { id: string; idAssigned?: boolean }): boolean {
  if (emp.idAssigned === true) return true;
  if (emp.idAssigned === false) return false;
  return !isPendingEmployeeId(emp.id);
}

/** Resolve active employee by work email (case-insensitive). */
export async function findActiveEmployeeByEmail(rawEmail: string) {
  const em = String(rawEmail || "").trim().toLowerCase();
  if (!em) return null;

  const exact = await Employee.findOne({ email: em, active: true }).exec();
  if (exact) return exact;

  const escaped = em.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Employee.findOne({
    email: { $regex: new RegExp(`^${escaped}$`, "i") },
    active: true,
  }).exec();
}

/** Resolve employee by login ID (emp1, emp0, legacy EMP-DEMO, case-insensitive serial). */
export async function findEmployeeByLoginId(rawId: string) {
  const trimmed = String(rawId || "").trim();
  if (!trimmed) return null;

  const lookupId = isSerialEmployeeId(trimmed) ? normalizeSerialEmployeeId(trimmed) : trimmed;
  let emp = await Employee.findOne({ id: lookupId, active: true }).exec();
  if (!emp && lookupId === "emp0") {
    emp = await Employee.findOne({ id: "EMP-DEMO", active: true }).exec();
  }
  if (!emp) {
    const escaped = lookupId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    emp = await Employee.findOne({ id: { $regex: new RegExp(`^${escaped}$`, "i") }, active: true }).exec();
  }
  return emp;
}
