import ContentCopy from "@mui/icons-material/ContentCopy";
import Print from "@mui/icons-material/Print";
import UploadFile from "@mui/icons-material/UploadFile";
import { Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAdminData } from "../../context/AdminDataContext";

export const AdminTransactionDetailPage = () => {
  const { id } = useParams();
  const { transactions, uploadReceipt, isSaving, errorMessage } = useAdminData();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const transaction = useMemo(() => transactions.find((item) => item.id === id), [id, transactions]);

  if (!transaction) {
    return <Typography>Transaction not found.</Typography>;
  }

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Transaction Detail with Audit Trail
              </Typography>
              <Typography color="text.secondary">ID: {transaction.id}</Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button startIcon={<ContentCopy />} onClick={() => navigator.clipboard.writeText(transaction.upiRefId)}>
                Copy UPI Ref
              </Button>
              <Button variant="outlined" startIcon={<Print />} onClick={() => window.print()}>
                Print as PDF
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Captured fields
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Box>
              <Typography>Employee: {transaction.employeeName}</Typography>
              <Typography>Department: {transaction.department}</Typography>
              <Typography>Merchant: {transaction.merchantName}</Typography>
              <Typography>MCC: {transaction.mcc}</Typography>
              <Typography>UPI App: {transaction.upiApp}</Typography>
              <Typography>UPI Ref ID: {transaction.upiRefId}</Typography>
              <Typography>Status: {transaction.status}</Typography>
            </Box>
            <Box>
              <Typography>Captured amount: Rs.{transaction.amount.toLocaleString("en-IN")}</Typography>
              <Typography>Claimed amount: Rs.{transaction.claimedAmount.toLocaleString("en-IN")}</Typography>
              <Typography>Date: {dayjs(transaction.dateTime).format("DD MMM YYYY HH:mm:ss")}</Typography>
              <Typography>Decision: {transaction.adminDecision || "Pending"}</Typography>
              <Typography>Decision timestamp: {transaction.adminDecisionAt ? dayjs(transaction.adminDecisionAt).format("DD MMM YYYY HH:mm:ss") : "N/A"}</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Receipt and location
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <Box>
              {transaction.receiptUrl ? (
                <img src={transaction.receiptUrl} alt="Receipt" style={{ maxWidth: "100%", borderRadius: 8 }} />
              ) : (
                <Typography color="text.secondary" sx={{ py: 2 }}>
                  No receipt image on file. Upload a receipt image below.
                </Typography>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !id) return;
                  await uploadReceipt(id, file);
                }}
              />
              <Button
                variant="outlined"
                startIcon={<UploadFile />}
                disabled={isSaving}
                onClick={() => fileInputRef.current?.click()}
                sx={{ mt: 1 }}
              >
                {isSaving ? "Uploading…" : "Upload / replace receipt"}
              </Button>
              {errorMessage ? (
                <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                  {errorMessage}
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ minWidth: 280, p: 1.5, bgcolor: "#f4f6ff", borderRadius: 2 }}>
              <Typography fontWeight={700}>GPS map pin</Typography>
              <Typography variant="body2" color="text.secondary">
                GPS data is enabled for this demo account. Map pin data can be rendered from location coordinates in production.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Policy flags triggered
          </Typography>
          <Stack direction="row" spacing={0.8} flexWrap="wrap" mt={1}>
            {transaction.flags.length ? transaction.flags.map((flag) => <Chip key={flag.id} label={`${flag.rule}: ${flag.details}`} color="warning" />) : <Chip label="No flags" />}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Timeline
          </Typography>
          <Divider sx={{ my: 1 }} />
          {transaction.timeline.map((event) => (
            <Typography key={event.id} variant="body2" mb={1}>
              {dayjs(event.timestamp).format("DD MMM HH:mm:ss")} | {event.actor} | {event.action}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary">
            {"Expected sequence: captured -> submitted -> admin reviewed -> decision made"}
          </Typography>
        </CardContent>
      </Card>
    </Stack>
  );
};
