import WarningAmber from "@mui/icons-material/WarningAmber";
import {
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useMemo } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useEmployeeData } from "../../context/EmployeeDataContext";

const fmt = (n: number) => `Rs.${n.toLocaleString("en-IN")}`;

export function EmployeeActivityPage() {
  const { transactions } = useEmployeeData();
  const flagged = useMemo(
    () =>
      transactions
        .filter((tx) => {
          const visibleFlags = tx.flags.filter((f) => !f.adminOnly);
          if (visibleFlags.length > 0) return true;
          if (tx.status !== "flagged") return false;
          return tx.flags.every((f) => !f.adminOnly);
        })
        .map((tx) => ({
          ...tx,
          flags: tx.flags.filter((f) => !f.adminOnly),
        }))
        .sort((a, b) => dayjs(b.dateTime).valueOf() - dayjs(a.dateTime).valueOf()),
    [transactions]
  );

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <WarningAmber color="warning" />
            <Typography variant="h5" fontWeight={800}>
              My flagged activity
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Mirrors the idea behind admin <strong>Fraud &amp; Audit</strong>: automated rule hits on your lines only.
            Admins still investigate org-wide from their dashboard.
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>When</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Merchant</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Amount</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }}>Rules</TableCell>
                <TableCell sx={{ fontWeight: 700, color: "text.secondary" }} align="right">
                  Open
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flagged.map((tx) => (
                <TableRow key={tx.id} hover>
                  <TableCell>{dayjs(tx.dateTime).format("DD MMM YYYY HH:mm")}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{tx.merchantName}</TableCell>
                  <TableCell>{fmt(tx.amount)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
                      {tx.flags.map((flag) => (
                        <Chip
                          key={flag.id}
                          label={flag.reason}
                          size="small"
                          sx={{
                            bgcolor: "#f97316",
                            color: "#fff",
                            fontWeight: 600,
                            "& .MuiChip-label": { px: 1 },
                          }}
                        />
                      ))}
                      {tx.flags.length === 0 ? (
                        <Chip
                          label="flagged"
                          size="small"
                          sx={{ bgcolor: "#f97316", color: "#fff", fontWeight: 600 }}
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      component={RouterLink}
                      to={`/employee/transaction/${tx.id}`}
                      sx={{
                        color: "primary.main",
                        fontWeight: 800,
                        fontSize: 13,
                        letterSpacing: 0.5,
                        textDecoration: "none",
                      }}
                    >
                      DETAIL
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
