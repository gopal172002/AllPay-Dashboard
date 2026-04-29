import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { runApiSmokeTest, type SmokeResult } from "../../dev/apiSmokeTest";
import { useSearchParams } from "react-router-dom";

export function ApiSmokePage() {
  const [searchParams] = useSearchParams();
  const auto = searchParams.get("auto") === "1";

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SmokeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const r = await runApiSmokeTest();
      setResults(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    if (auto) void run();
  }, [auto, run]);

  const pass = results?.filter((x) => x.ok).length ?? 0;
  const fail = results ? results.length - pass : 0;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h5" fontWeight={800}>
          API smoke (dev)
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Calls every <code>/api/…</code> route from the browser using the same base URL as the app. Admin calls use{" "}
          <code>test@example.com</code> / <code>password123</code>. Open with <code>?auto=1</code> to run on load.
        </Typography>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="contained" onClick={() => void run()} disabled={running}>
            {running ? "Running…" : "Run all API calls"}
          </Button>
          {results ? (
            <>
              <Chip label={`${pass} ok`} color="success" size="small" />
              <Chip label={`${fail} failed`} color={fail ? "error" : "default"} size="small" />
            </>
          ) : null}
        </Stack>

        {results ? (
          <Paper variant="outlined" sx={{ overflow: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Step</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Result</TableCell>
                  <TableCell>Detail</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell>
                      <Box component="code" sx={{ fontSize: 12 }}>
                        {r.path}
                      </Box>
                    </TableCell>
                    <TableCell>{r.status}</TableCell>
                    <TableCell>{r.ok ? "ok" : "fail"}</TableCell>
                    <TableCell sx={{ maxWidth: 360, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {r.detail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        ) : null}
      </Stack>
    </Container>
  );
}
