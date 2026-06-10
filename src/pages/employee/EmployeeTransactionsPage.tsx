import FilterList from "@mui/icons-material/FilterList";
import WarningAmber from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
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
import { Link as RouterLink } from "react-router-dom";
import { useEmployeeData } from "../../context/EmployeeDataContext";

const fmt = (value: number) => `Rs.${value.toLocaleString("en-IN")}`;

export function EmployeeTransactionsPage() {
  const { filteredTransactions, transactions, statusFilter, setStatusFilter, search, setSearch, errorMessage } =
    useEmployeeData();
  const total = filteredTransactions.reduce((acc, tx) => acc + tx.amount, 0);

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            My transactions
          </Typography>
          <Typography color="text.secondary">
            Same fields as admin Transactions (merchant, MCC category, UPI app, amounts, status). You cannot approve or
            reject — finance does that in the admin workspace.
          </Typography>
        </CardContent>
      </Card>

      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }} sx={{ mb: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <FilterList color="action" />
              <Typography fontWeight={700}>Filters</Typography>
            </Stack>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="pending">pending</MenuItem>
                <MenuItem value="approved">approved</MenuItem>
                <MenuItem value="rejected">rejected</MenuItem>
                <MenuItem value="flagged">flagged</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              placeholder="Search merchant / ref / id"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
          </Stack>

          <Alert severity="info" sx={{ mb: 2 }}>
            Showing {filteredTransactions.length} of {transactions.length} records · Total amount {fmt(total)}
          </Alert>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Merchant</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTransactions.map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>
                    <Typography fontWeight={600}>{tx.merchantName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {tx.upiRefId}
                    </Typography>
                  </TableCell>
                  <TableCell>{tx.category}</TableCell>
                  <TableCell>{fmt(tx.amount)}</TableCell>
                  <TableCell>{dayjs(tx.dateTime).format("DD MMM YYYY, HH:mm")}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={tx.status}
                      color={tx.status === "flagged" ? "warning" : tx.status === "approved" ? "success" : "default"}
                      icon={tx.status === "flagged" ? <WarningAmber /> : undefined}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      component={RouterLink}
                      to={`/employee/transaction/${tx.id}`}
                      sx={{ color: "primary.main", fontWeight: 700, textDecoration: "none" }}
                    >
                      VIEW
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
