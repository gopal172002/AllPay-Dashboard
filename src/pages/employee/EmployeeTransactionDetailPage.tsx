import { Box, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useEmployeeData } from "../../context/EmployeeDataContext";

export function EmployeeTransactionDetailPage() {
  const { id } = useParams();
  const { transactions } = useEmployeeData();
  const transaction = useMemo(() => transactions.find((t) => t.id === id), [id, transactions]);

  if (!transaction) {
    return <Typography>Transaction not found.</Typography>;
  }

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Transaction detail
              </Typography>
              <Typography color="text.secondary">ID: {transaction.id}</Typography>
            </Box>
            <Chip label={transaction.status} color={transaction.status === "flagged" ? "warning" : "default"} />
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Captured fields
          </Typography>
          <Stack spacing={0.5}>
            <Typography>Merchant: {transaction.merchantName}</Typography>
            <Typography>Category: {transaction.category}</Typography>
            <Typography>MCC: {transaction.mcc}</Typography>
            <Typography>UPI app: {transaction.upiApp}</Typography>
            <Typography>UPI ref: {transaction.upiRefId}</Typography>
            <Typography>Amount: Rs.{transaction.amount.toLocaleString("en-IN")}</Typography>
            <Typography>Date: {dayjs(transaction.dateTime).format("DD MMM YYYY HH:mm")}</Typography>
            <Typography>Admin decision: {transaction.adminDecision || "Pending finance review"}</Typography>
          </Stack>
          {transaction.flags.length > 0 ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2 }}>
              {transaction.flags.map((f) => (
                <Chip key={f.id} label={f.reason} size="small" color="warning" />
              ))}
            </Stack>
          ) : null}
          {transaction.receiptUrl ? (
            <Box sx={{ mt: 2 }}>
              <img src={transaction.receiptUrl} alt="Receipt" style={{ maxWidth: "100%", borderRadius: 8 }} />
            </Box>
          ) : null}
        </CardContent>
      </Card>
    </Stack>
  );
}
