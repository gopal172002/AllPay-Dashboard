import type { EmployeePayload } from "./employeeRequest";

declare global {
  namespace Express {
    interface Request {
      employeeUser?: EmployeePayload;
    }
  }
}

export {};
