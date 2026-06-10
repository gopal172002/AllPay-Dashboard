import CloudUpload from "@mui/icons-material/CloudUpload";
import History from "@mui/icons-material/History";
import {
  Alert,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useState } from "react";
import { useEmployeeData } from "../../context/EmployeeDataContext";

const PAYMENT_TYPES = [
  "Bank transfer / NEFT / RTGS",
  "Cash",
  "Cheque",
  "Other manual payment",
];

const SUCCESS_MESSAGE = "Submitted for finance approval.";

export function EmployeePaymentProofPage() {
  const { paymentProofs, submitPaymentProof } = useEmployeeData();
  const [tab, setTab] = useState(0);
  const [paymentType, setPaymentType] = useState(PAYMENT_TYPES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const canSubmit = amount.trim() && description.trim() && Number(amount) > 0;

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setFile(null);
    setTab(1);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const fd = new FormData();
      fd.append("paymentType", paymentType);
      fd.append("amount", amount);
      fd.append("description", description);
      if (file) fd.append("receipt", file);
      await submitPaymentProof(fd);
      setMessage(SUCCESS_MESSAGE);
      resetForm();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Payment proof
          </Typography>
          <Typography color="text.secondary">
            Submit manual payments for finance review. A pending transaction is created for admins to approve.
          </Typography>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 2 }}>
            <Tab icon={<CloudUpload />} iconPosition="start" label="New request" />
            <Tab icon={<History />} iconPosition="start" label="My submissions" />
          </Tabs>
        </CardContent>
      </Card>

      {tab === 0 ? (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack spacing={2} maxWidth={520}>
              {error ? <Alert severity="error">{error}</Alert> : null}
              {message ? <Alert severity="success">{message}</Alert> : null}
              <FormControl fullWidth size="small">
                <InputLabel>Payment type</InputLabel>
                <Select label="Payment type" value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
                  {PAYMENT_TYPES.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Amount (INR)"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="Description for finance"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
                multiline
                minRows={3}
                size="small"
              />
              <Button variant="outlined" component="label" startIcon={<CloudUpload />}>
                Attach screenshot / receipt (image)
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              {file ? (
                <Typography variant="caption" color="text.secondary">
                  {file.name}
                </Typography>
              ) : null}
              <Button
                variant="contained"
                disabled={!canSubmit || loading}
                onClick={() => void handleSubmit()}
                sx={{ bgcolor: "#5A58F2", textTransform: "none" }}
              >
                {loading ? "Submitting…" : "Submit for approval"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentProofs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{dayjs(p.createdAt).format("DD MMM YYYY")}</TableCell>
                    <TableCell>{p.paymentType}</TableCell>
                    <TableCell>Rs.{p.amount.toLocaleString("en-IN")}</TableCell>
                    <TableCell>{p.status}</TableCell>
                    <TableCell>{p.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
