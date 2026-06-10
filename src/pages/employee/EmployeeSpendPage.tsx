import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { employeeApi, type EmployeeSpendResponse } from "../../api/employeeApi";
import { useEmployeeData } from "../../context/EmployeeDataContext";
import { computeEmployeeSpendFromTransactions } from "../../utils/employeeSpend";

const fmt = (n: number) => `Rs.${n.toLocaleString("en-IN")}`;
const BAR_COLOR = "#4F5BD5";
const CHART_CATEGORIES = ["Fuel", "Office Supplies", "Travel", "Lodging", "Bars/Alcohol", "Meals"];

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
};

function CategoryTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.[0] || label == null) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        boxShadow: "0 4px 14px rgba(15,23,42,0.08)",
        minWidth: 120,
      }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: 13, color: "#0f172a", mb: 0.25 }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, color: "#335CFF" }}>value : {fmt(value)}</Typography>
    </Box>
  );
}

export function EmployeeSpendPage() {
  const { transactions, isBootstrapping } = useEmployeeData();
  const [range, setRange] = useState(30);
  const [data, setData] = useState<EmployeeSpendResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const loadFromTransactions = () => {
      if (!cancelled) {
        setData(computeEmployeeSpendFromTransactions(transactions, range));
        setLoading(false);
      }
    };

    employeeApi
      .getSpend(range)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled && transactions.length > 0) {
          loadFromTransactions();
        } else if (!cancelled) {
          setError("Could not load spend data. Restart the backend and refresh.");
          setLoading(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, transactions]);

  const chartData = useMemo(() => {
    const fromApi = data?.byCategory ?? [];
    return CHART_CATEGORIES.map((name) => {
      const row = fromApi.find((c) => c.category === name);
      return { name, value: row?.total ?? 0 };
    });
  }, [data]);

  const showLoader = (loading || isBootstrapping) && !data;

  return (
    <Card
      sx={{
        borderRadius: 3,
        border: "1px solid #e8edf2",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: "#0f172a", mb: 0.75 }}>
              My spend
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Same metrics style as admin Analytics, scoped to your transactions only.
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 148, flexShrink: 0 }}>
            <Select
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              sx={{
                borderRadius: 2,
                bgcolor: "#fff",
                fontSize: 14,
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "#d1d9e0" },
              }}
            >
              <MenuItem value={7}>Last 7 days</MenuItem>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}

        {data && !showLoader ? (
          <Stack direction="row" spacing={3} flexWrap="wrap" sx={{ mt: 2.5, mb: 2.5 }}>
            <Typography variant="body2" sx={{ color: "#0f172a" }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                Approved
              </Box>{" "}
              in range: {fmt(data.approvedInRange)}
            </Typography>
            <Typography variant="body2" sx={{ color: "#0f172a" }}>
              <Box component="span" sx={{ fontWeight: 700 }}>
                Pending
              </Box>{" "}
              in range: {fmt(data.pendingInRange)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.transactionCount} transactions
            </Typography>
          </Stack>
        ) : null}

        <Divider sx={{ borderColor: "#e8edf2", mb: 2.5 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#0f172a", mb: 2 }}>
          By category
        </Typography>

        {showLoader ? (
          <Stack alignItems="center" py={6}>
            <CircularProgress size={32} />
          </Stack>
        ) : data ? (
          <Box sx={{ width: "100%", height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 16, left: 4, bottom: 8 }}
                barCategoryGap="12%"
                barGap={2}
              >
                <CartesianGrid
                  vertical={false}
                  horizontal
                  stroke="#e8edf2"
                  strokeWidth={1}
                  syncWithTicks
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d1d9e0", strokeWidth: 1 }}
                  interval={0}
                  height={52}
                />
                <YAxis
                  type="number"
                  orientation="left"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickLine={{ stroke: "#d1d9e0", strokeWidth: 1 }}
                  axisLine={{ stroke: "#d1d9e0", strokeWidth: 1 }}
                  domain={[0, 12000]}
                  ticks={[0, 3000, 6000, 9000, 12000]}
                  allowDecimals={false}
                  allowDataOverflow
                  width={56}
                />
                <Tooltip content={<CategoryTooltip />} cursor={{ fill: "rgba(148,163,184,0.2)" }} />
                <Bar
                  dataKey="value"
                  fill={BAR_COLOR}
                  radius={[4, 4, 0, 0]}
                  barSize={88}
                  maxBarSize={96}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
