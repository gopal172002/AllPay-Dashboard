import { Box, Card, CardContent, Grid, Stack, Typography } from "@mui/material";
import { EmployeeNavButton } from "../../components/layout/EmployeeLayout";
import { useEmployeeData } from "../../context/EmployeeDataContext";

const fmt = (n: number) => `Rs.${n.toLocaleString("en-IN")}`;

export function EmployeeHomePage() {
  const { summary } = useEmployeeData();
  const s = summary ?? {
    pendingReview: 0,
    withFlags: 0,
    approvedThisMonth: 0,
    proofsAwaiting: 0,
    proofsAwaitingReview: 0,
  };

  const stats = [
    { label: "Pending review", value: String(s.pendingReview) },
    { label: "With flags", value: String(s.withFlags) },
    { label: "Approved (this month)", value: fmt(s.approvedThisMonth) },
    { label: "Proofs awaiting review", value: String(s.proofsAwaitingReview ?? s.proofsAwaiting) },
  ];

  const cards = [
    {
      title: "My transactions",
      body: "Read-only list and detail — admins approve or reject from the Transactions screen.",
      action: <EmployeeNavButton label="Open transactions" to="/employee/transactions" />,
    },
    {
      title: "Payment proof",
      body: "Upload a receipt or screenshot for bank transfer, cash, or other manual pay — then request approval from finance.",
      action: <EmployeeNavButton label="Submit proof" to="/employee/payment-proof" />,
    },
    {
      title: "My spend",
      body: "Category and daily trend for your transactions only (mirrors admin Analytics scope).",
      action: <EmployeeNavButton label="View spend" to="/employee/spend" variant="outlined" />,
    },
    {
      title: "Activity & flags",
      body: "Same fraud-style flags as admin Fraud & Audit, limited to your spend lines.",
      action: <EmployeeNavButton label="View activity" to="/employee/activity" variant="outlined" />,
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Grid container spacing={2}>
        {stats.map((item) => (
          <Grid key={item.label} item xs={12} sm={6} md={3}>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h5" fontWeight={800}>
                  {item.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid key={c.title} item xs={12} md={6}>
            <Card sx={{ borderRadius: 3, height: "100%" }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>
                  {c.title}
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 2, minHeight: 48 }}>
                  {c.body}
                </Typography>
                <Box>{c.action}</Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}
