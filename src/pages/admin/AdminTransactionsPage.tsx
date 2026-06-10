import CheckCircle from "@mui/icons-material/CheckCircle";
import FilterList from "@mui/icons-material/FilterList";
import Refresh from "@mui/icons-material/Refresh";
import WarningAmber from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useAdminData } from "../../context/AdminDataContext";
import { isExpensePaymentVerified } from "../../types";

const fmt = (value: number) => `Rs.${value.toLocaleString("en-IN")}`;

export const AdminTransactionsPage = () => {
  const {
    employees,
    transactions,
    filteredTransactions,
    filters,
    setFilters,
    resetFilters,
    approveTransaction,
    rejectTransaction,
    bulkDecision,
    flaggedOnly,
    setFlaggedOnly,
    dashboardLoadMs,
    errorMessage,
    isSaving,
  } = useAdminData();
  const [selected, setSelected] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState("Missing supporting bill");
  const [partialAmount, setPartialAmount] = useState<Record<string, string>>({});

  const totalDailySpend = useMemo(
    () =>
      transactions
        .filter((tx) => dayjs(tx.dateTime).isSame(dayjs(), "day"))
        .reduce((acc, tx) => acc + tx.amount, 0),
    [transactions],
  );
  const filteredTotal = filteredTransactions.reduce((acc, tx) => acc + tx.amount, 0);

  const toggleSelected = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  return (
    <Stack spacing={2.5}>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="h5" fontWeight={800}>
                Real-time Transaction Dashboard
              </Typography>
              <Typography color="text.secondary">
                Auto-refresh every 30s | Current load: {dashboardLoadMs}ms
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip color="primary" icon={<Refresh />} label="Auto refresh: 30 sec" />
              <Chip color="success" label={`Total daily spend ${fmt(totalDailySpend)}`} />
            </Stack>
          </Stack>
          <LinearProgress
            sx={{ mt: 2, borderRadius: 999 }}
            variant="determinate"
            value={Math.max(20, Math.min(100, (3000 - dashboardLoadMs) / 30))}
            color={dashboardLoadMs <= 3000 ? "success" : "warning"}
          />
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} alignItems={{ md: "center" }}>
              <FilterList color="action" />
              <Typography fontWeight={700}>Advanced Filters and Search</Typography>
              <Button onClick={() => setFlaggedOnly(!flaggedOnly)} variant={flaggedOnly ? "contained" : "outlined"}>
                {flaggedOnly ? "Flagged Only" : "All Transactions"}
              </Button>
              <Button variant="text" onClick={resetFilters}>
                Reset filters
              </Button>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Employee</InputLabel>
                <Select
                  label="Employee"
                  value={filters.employeeId}
                  onChange={(event) => setFilters({ employeeId: event.target.value })}
                >
                  <MenuItem value="">All</MenuItem>
                  {employees.map((emp) => (
                    <MenuItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Department"
                value={filters.department}
                onChange={(event) => setFilters({ department: event.target.value })}
              />
              <TextField size="small" label="MCC category" value={filters.mcc} onChange={(event) => setFilters({ mcc: event.target.value })} />
              <TextField size="small" label="UPI app" value={filters.upiApp} onChange={(event) => setFilters({ upiApp: event.target.value })} />
              <TextField size="small" label="Status" value={filters.status} onChange={(event) => setFilters({ status: event.target.value })} />
              <TextField size="small" label="Search name/merchant/ref" value={filters.search} onChange={(event) => setFilters({ search: event.target.value })} />
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
              <TextField size="small" type="date" label="Start date" InputLabelProps={{ shrink: true }} value={filters.startDate} onChange={(event) => setFilters({ startDate: event.target.value })} />
              <TextField size="small" type="date" label="End date" InputLabelProps={{ shrink: true }} value={filters.endDate} onChange={(event) => setFilters({ endDate: event.target.value })} />
              <TextField size="small" type="number" label="Min amount" value={filters.minAmount} onChange={(event) => setFilters({ minAmount: event.target.value })} />
              <TextField size="small" type="number" label="Max amount" value={filters.maxAmount} onChange={(event) => setFilters({ maxAmount: event.target.value })} />
            </Stack>
            <Alert severity="info">
              Filtered results: {filteredTransactions.length} records | Total amount: {fmt(filteredTotal)}
            </Alert>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} mb={1}>
            <Button disabled={!selected.length} variant="contained" onClick={() => bulkDecision(selected, "approved")}>
              Bulk approve ({selected.length})
            </Button>
            <Button disabled={!selected.length} color="error" variant="outlined" onClick={() => bulkDecision(selected, "rejected", rejectReason)}>
              Bulk reject
            </Button>
            <TextField
              size="small"
              label="Rejection reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value.slice(0, 300))}
            />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell />
                <TableCell>Employee</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Merchant</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date / Time</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Payment</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTransactions.slice(0, 80).map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>
                    <Checkbox checked={selected.includes(tx.id)} onChange={() => toggleSelected(tx.id)} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {tx.isNew ? (
                        <Box sx={{ width: 10, height: 10, borderRadius: 99, bgcolor: "success.main", animation: "pulse 1s infinite" }} />
                      ) : null}
                      <Box>
                        <Typography variant="body2">{tx.employeeName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {tx.upiRefId}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>
                  <TableCell>{tx.department}</TableCell>
                  <TableCell>{tx.merchantName}</TableCell>
                  <TableCell>{tx.category}</TableCell>
                  <TableCell>{fmt(tx.amount)}</TableCell>
                  <TableCell>{dayjs(tx.dateTime).format("DD MMM, HH:mm")}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={tx.status === "approved" ? "success" : tx.status === "rejected" ? "error" : tx.status === "flagged" ? "warning" : "default"}
                      icon={tx.status === "flagged" ? <WarningAmber /> : tx.status === "approved" ? <CheckCircle /> : undefined}
                      label={tx.status}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={
                        tx.paymentStatus === "payment_captured"
                          ? "success"
                          : tx.paymentStatus
                            ? "warning"
                            : "default"
                      }
                      label={tx.paymentStatus ?? "legacy"}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Button component={RouterLink} to={`/admin/transaction/${tx.id}`} size="small">
                        View
                      </Button>
                      {(tx.status === "pending" || tx.status === "flagged") && (
                        <>
                          <Button
                            size="small"
                            color="success"
                            disabled={isSaving || !isExpensePaymentVerified(tx)}
                            onClick={() => approveTransaction(tx.id, Number(partialAmount[tx.id] || tx.claimedAmount))}
                          >
                            Approve
                          </Button>
                          <Button size="small" color="error" onClick={() => rejectTransaction(tx.id, rejectReason)}>
                            Reject
                          </Button>
                        </>
                      )}
                      {(tx.status === "pending" || tx.status === "flagged") && (
                        <TextField
                          size="small"
                          type="number"
                          sx={{ width: 95 }}
                          label="Partial"
                          value={partialAmount[tx.id] || tx.claimedAmount}
                          onChange={(event) =>
                            setPartialAmount((prev) => ({ ...prev, [tx.id]: event.target.value }))
                          }
                        />
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
};
