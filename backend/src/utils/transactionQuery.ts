import dayjs from "dayjs";
type TxFilter = Record<string, unknown>;

const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

function parseIntSafe(v: unknown, d: number, max: number) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n) || n < 1) return d;
  return Math.min(n, max);
}

export type ParsedTransactionListQuery = {
  page: number;
  limit: number;
  skip: number;
  filter: TxFilter;
};

function one(
  q: Record<string, string | string[] | undefined>,
  k: string
): string | undefined {
  const v = q[k];
  return (Array.isArray(v) ? v[0] : v) as string | undefined;
}

export function parseTransactionQuery(
  q: Record<string, string | string[] | undefined>
): ParsedTransactionListQuery {
  const page = parseIntSafe(q.page, 1, 1_000_000);
  const limit = parseIntSafe(q.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;

  const and: object[] = [];

  const since = one(q, "since");
  if (since) {
    and.push({ dateTime: { $gt: since } });
  }

  const startDate = one(q, "startDate");
  const endDate = one(q, "endDate");
  if (startDate || endDate) {
    const d: { $gte?: string; $lte?: string } = {};
    if (startDate) d.$gte = dayjs(startDate).startOf("day").toISOString();
    if (endDate) d.$lte = dayjs(endDate).endOf("day").toISOString();
    and.push({ dateTime: d });
  }

  if (one(q, "flagged") === "1" || one(q, "flagged") === "true" || one(q, "flaggedOnly") === "1") {
    and.push({ status: "flagged" });
  } else {
    const status = one(q, "status");
    if (status) and.push({ status });
  }

  const employeeId = one(q, "employeeId");
  if (employeeId) and.push({ employeeId });

  const department = one(q, "department");
  if (department) and.push({ department });

  const category = one(q, "category") || one(q, "mcc");
  if (category) and.push({ category });

  const upiApp = one(q, "upiApp");
  if (upiApp) and.push({ upiApp });

  const minAmount = one(q, "minAmount");
  const maxAmount = one(q, "maxAmount");
  if (minAmount != null && minAmount !== "" || maxAmount != null && maxAmount !== "") {
    const amt: { $gte?: number; $lte?: number } = {};
    if (minAmount != null && minAmount !== "") amt.$gte = Number(minAmount);
    if (maxAmount != null && maxAmount !== "") amt.$lte = Number(maxAmount);
    and.push({ amount: amt });
  }

  const search = (one(q, "search") || one(q, "q") || "").trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    and.push({ $or: [{ employeeName: rx }, { merchantName: rx }, { upiRefId: rx }] });
  }

  const filter: TxFilter =
    and.length === 0 ? {} : and.length === 1 ? (and[0] as TxFilter) : { $and: and };

  return { page, limit, skip, filter };
}

export function getDefaultBootstrapTxLimit() {
  return 350;
}
