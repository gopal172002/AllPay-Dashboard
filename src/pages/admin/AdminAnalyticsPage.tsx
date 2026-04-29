import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "../../api/adminApi";
import { useAdminData } from "../../context/AdminDataContext";

const colors = ["#335CFF", "#5B8CFF", "#94B3FF", "#4ADE80", "#F59E0B", "#EC4899"];

export const AdminAnalyticsPage = () => {
  const { filteredTransactions } = useAdminData();
  const [range, setRange] = useState("30");
  const [drillKey, setDrillKey] = useState("");
  const [agg, setAgg] = useState<Awaited<ReturnType<typeof adminApi.getAnalyticsAggregated>> | null>(null);
  const [today, setToday] = useState<Awaited<ReturnType<typeof adminApi.getDailySpend>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const rangeStart = useMemo(() => dayjs().subtract(Number(range), "day"), [range]);
  const inRange = useMemo(
    () => filteredTransactions.filter((tx) => dayjs(tx.dateTime).isAfter(rangeStart)),
    [filteredTransactions, rangeStart],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError("");
    const end = dayjs();
    const start = end.subtract(Number(range), "day");
    const ymd = end.format("YYYY-MM-DD");
    Promise.all([
      adminApi.getDailySpend(ymd),
      adminApi.getAnalyticsAggregated({
        startDate: start.format("YYYY-MM-DD"),
        endDate: end.format("YYYY-MM-DD"),
        timelineBucket: "daily",
      }),
    ])
      .then(([d, data]) => {
        if (!cancelled) {
          setToday(d);
          setAgg(data);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError((e as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const byCategory = useMemo(
    () =>
      (agg?.byCategory ?? []).map((c) => ({
        name: c.category,
        value: c.total,
      })),
    [agg],
  );

  const byEmployee = useMemo(
    () =>
      (agg?.byEmployee ?? [])
        .slice(0, 10)
        .map((e) => ({
          name: e.employeeName,
          value: e.total,
        })),
    [agg],
  );

  const daily = useMemo(
    () =>
      (agg?.timeline ?? []).map((t) => ({
        day: t.period,
        value: t.total,
      })),
    [agg],
  );

  const kpis = agg?.kpis;
  const approvedSpend = kpis?.approvedSpend ?? 0;
  const pendingAmount = kpis?.pendingSpend ?? 0;
  const rejectedSaved = kpis?.rejectedAmount ?? 0;
  const flaggedCount = kpis?.flaggedCount ?? 0;

  const drilled = inRange.filter((tx) => !drillKey || tx.category === drillKey || tx.employeeName === drillKey);

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1.2} justifyContent="space-between" alignItems="center">
            <Typography variant="h5" fontWeight={800}>
              Spend Analytics by Category and Employee
            </Typography>
            <TextField select size="small" value={range} onChange={(e) => setRange(e.target.value)}>
              <MenuItem value="7">Last 7 days</MenuItem>
              <MenuItem value="30">Last 30 days</MenuItem>
              <MenuItem value="90">Last 90 days</MenuItem>
            </TextField>
          </Stack>
          <Typography color="text.secondary">
            Charts and KPIs are aggregated on the server for the selected window. Drill-down below still uses loaded
            transactions in the browser.
          </Typography>
        </CardContent>
      </Card>

      {loadError ? (
        <Alert severity="error">{loadError}</Alert>
      ) : null}

      {today && !loadError ? (
        <Card sx={{ borderRadius: 3, bgcolor: "#f0f4ff" }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">
              Today ({today.date}) — daily spend summary
            </Typography>
            <Typography variant="h6">
              Rs.{today.totalSpend.toLocaleString("en-IN")} · {today.transactionCount} tx
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {today.byCategory.length
                ? `Top category: ${today.byCategory[0]!.category} (Rs.${today.byCategory[0]!.total.toLocaleString("en-IN")})`
                : "No spend recorded today in range."}
            </Typography>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Stack alignItems="center" py={3}>
          <CircularProgress />
        </Stack>
      ) : null}

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption">Approved Spend</Typography>
            <Typography variant="h6">Rs.{approvedSpend.toLocaleString("en-IN")}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption">Pending</Typography>
            <Typography variant="h6">Rs.{pendingAmount.toLocaleString("en-IN")}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption">Rejected (amount)</Typography>
            <Typography variant="h6">Rs.{rejectedSaved.toLocaleString("en-IN")}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography variant="caption">Flagged</Typography>
            <Typography variant="h6">{flaggedCount}</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography fontWeight={700}>Donut: spend by MCC category</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  onClick={(entry) => setDrillKey((entry as { name: string }).name)}
                >
                  {byCategory.map((item, index) => (
                    <Cell key={item.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent>
            <Typography fontWeight={700}>Bar: spend per employee</Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byEmployee}>
                <XAxis dataKey="name" hide />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="value"
                  fill="#335CFF"
                  onClick={(entry) => setDrillKey((entry as { name: string }).name)}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Stack>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography fontWeight={700}>Line: daily spend trend</Typography>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily}>
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
          <Typography variant="body2" color="text.secondary">
            Drilldown {drillKey ? `active for "${drillKey}"` : "inactive"} | Matching transactions in view:{" "}
            {drilled.length}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
};
