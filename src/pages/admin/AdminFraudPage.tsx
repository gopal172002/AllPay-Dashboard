import ContentCopy from "@mui/icons-material/ContentCopy";

import Timeline from "@mui/icons-material/Timeline";

import WarningAmber from "@mui/icons-material/WarningAmber";

import {

  Box,

  Button,

  Card,

  CardContent,

  Chip,

  Divider,

  Stack,

  Table,

  TableBody,

  TableCell,

  TableHead,

  TableRow,

  Tooltip,

  Typography,

} from "@mui/material";

import dayjs from "dayjs";

import { useEffect } from "react";

import { useAdminData } from "../../context/AdminDataContext";

import type { Transaction } from "../../types";



function fraudTierChip(tx: Transaction) {

  const score = tx.receiptFraudScore;

  const tier = tx.receiptFraudTier;

  if (score == null && !tier) return null;

  const label =

    tier === "high_risk"

      ? `High Risk (${score ?? "?"})`

      : tier === "manual_review"

        ? `Manual Review (${score ?? "?"})`

        : tier === "safe"

          ? `Safe (${score ?? "?"})`

          : `Score ${score ?? "?"}`;

  const color =

    tier === "high_risk" ? "error" : tier === "manual_review" ? "warning" : "success";

  return <Chip size="small" color={color} label={label} />;

}



export const AdminFraudPage = () => {

  const { transactions, refreshTransactions } = useAdminData();



  useEffect(() => {

    void refreshTransactions().catch(() => {

      /* AdminDataContext already surfaces bootstrap errors */

    });

  }, [refreshTransactions]);



  const flagged = transactions.filter(

    (item) =>

      item.flags.length > 0 ||

      item.status === "flagged" ||

      item.receiptFraudTier === "manual_review" ||

      item.receiptFraudTier === "high_risk"

  );



  return (

    <Stack spacing={2.5}>

      <Card sx={{ borderRadius: 3 }}>

        <CardContent>

          <Stack direction="row" spacing={1} alignItems="center">

            <WarningAmber color="warning" />

            <Typography variant="h5" fontWeight={800}>

              Automated Fraud Detection Flags

            </Typography>

          </Stack>

          <Typography color="text.secondary" sx={{ mt: 1 }}>

            Receipt upload pipeline: metadata check → Sightengine AI → OCR extraction → ELA image

            forensics. Fraud score: 0–30 safe, 31–70 manual review, 71–100 high risk.

          </Typography>

        </CardContent>

      </Card>



      <Card sx={{ borderRadius: 3 }}>

        <CardContent>

          <Typography variant="h6" fontWeight={700}>

            Flagged transactions ({flagged.length})

          </Typography>

          <Table size="small">

            <TableHead>

              <TableRow>

                <TableCell>ID</TableCell>

                <TableCell>Employee</TableCell>

                <TableCell>Merchant</TableCell>

                <TableCell>Amount</TableCell>

                <TableCell>Fraud score</TableCell>

                <TableCell>Triggered rules</TableCell>

              </TableRow>

            </TableHead>

            <TableBody>

              {flagged.slice(0, 80).map((tx) => (

                <TableRow key={tx.id}>

                  <TableCell>{tx.id}</TableCell>

                  <TableCell>{tx.employeeName}</TableCell>

                  <TableCell>{tx.merchantName}</TableCell>

                  <TableCell>Rs.{tx.amount.toLocaleString("en-IN")}</TableCell>

                  <TableCell>{fraudTierChip(tx) ?? "—"}</TableCell>

                  <TableCell>

                    <Stack direction="row" spacing={0.6} flexWrap="wrap">

                      {tx.flags.map((flag) => (

                        <Chip key={flag.id} label={flag.reason} size="small" color="warning" />

                      ))}

                    </Stack>

                  </TableCell>

                </TableRow>

              ))}

            </TableBody>

          </Table>

        </CardContent>

      </Card>



      <Card sx={{ borderRadius: 3 }}>

        <CardContent>

          <Typography variant="h6" fontWeight={700} mb={1}>

            Audit timeline preview

          </Typography>

          {transactions.slice(0, 1).map((tx) => (

            <Box key={tx.id}>

              <Stack direction="row" spacing={1.2} alignItems="center">

                <Typography variant="subtitle1" fontWeight={700}>

                  {tx.id}

                </Typography>

                <Tooltip title="Copy UPI ref">

                  <Button size="small" startIcon={<ContentCopy />} onClick={() => navigator.clipboard.writeText(tx.upiRefId)}>

                    {tx.upiRefId}

                  </Button>

                </Tooltip>

              </Stack>

              <Divider sx={{ my: 1 }} />

              {tx.timeline.map((event) => (

                <Stack key={event.id} direction="row" spacing={1} alignItems="center" mb={1}>

                  <Timeline color="primary" fontSize="small" />

                  <Typography variant="body2">

                    {event.action} by {event.actor} at {dayjs(event.timestamp).format("DD MMM HH:mm:ss")}

                  </Typography>

                </Stack>

              ))}

            </Box>

          ))}

        </CardContent>

      </Card>

    </Stack>

  );

};


