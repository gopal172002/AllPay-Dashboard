import { useEffect, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import PersonAddOutlined from "@mui/icons-material/PersonAddOutlined";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { useAuth } from "../../context/AuthContext";

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

type RegisterMode = "new" | "complete";

export function EmployeeRegisterPage() {
  const { registerEmployee } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as {
    complete?: boolean;
    employeeId?: string;
    email?: string;
  } | null;
  const initialComplete = routeState?.complete === true;
  const [mode, setMode] = useState<RegisterMode>(initialComplete ? "complete" : "new");

  useEffect(() => {
    if (initialComplete) setMode("complete");
    if (routeState?.employeeId) setEmployeeId(routeState.employeeId);
    if (routeState?.email) setEmail(routeState.email);
  }, [initialComplete, routeState?.employeeId, routeState?.email]);
  const [email, setEmail] = useState(routeState?.email ?? "");
  const [employeeId, setEmployeeId] = useState(routeState?.employeeId ?? "");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [readyToLogin, setReadyToLogin] = useState(false);
  const [loginEmployeeId, setLoginEmployeeId] = useState("");
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError("");
    setSuccess("");
    setReadyToLogin(false);
    setLoginEmployeeId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (!emailOk(email)) {
      setError("Enter a valid work email.");
      return;
    }
    if (mode === "new" && fullName.trim().length < 2) {
      setError("Enter your full name.");
      return;
    }
    if (mode === "complete" && !employeeId.trim()) {
      setError("Enter the Employee ID your admin gave you (e.g. emp1).");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }
    setLoading(true);
    const result = await registerEmployee({
      email: email.trim().toLowerCase(),
      fullName: mode === "new" ? fullName.trim() : fullName.trim() || undefined,
      password,
      department: department.trim() || undefined,
      employeeId: mode === "complete" ? employeeId.trim() : undefined,
    });
    setLoading(false);
    if (!result.ok) {
      if (result.code === "COMPLETE_REGISTRATION" && result.employeeId) {
        setMode("complete");
        setEmployeeId(result.employeeId);
      }
      if (result.code === "ALREADY_REGISTERED" && result.employeeId) {
        setLoginEmployeeId(result.employeeId);
        setEmployeeId(result.employeeId);
        setReadyToLogin(true);
      }
      setError(result.message);
      return;
    }
    setSuccess(result.message);
    setReadyToLogin(Boolean(result.ready));
    if (result.employeeId) setLoginEmployeeId(result.employeeId);
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff" }}>
      <AnnouncementBar />
      <MarketingHeader />
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 }, border: "1px solid #eef2f6", borderRadius: 3 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Employee account
          </Typography>

          <Tabs
            value={mode}
            onChange={(_, v) => {
              setMode(v as RegisterMode);
              resetMessages();
            }}
            sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              value="new"
              icon={<PersonAddOutlined />}
              iconPosition="start"
              label="New joiner"
            />
            <Tab
              value="complete"
              icon={<BadgeOutlined />}
              iconPosition="start"
              label="I have my Employee ID"
            />
          </Tabs>

          {mode === "new" ? (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Register with your work email. Your admin will assign you an Employee ID (e.g. emp1) before you can log in.
            </Typography>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Your admin already gave you an ID (e.g. emp1). Enter it with your work email and choose a password to finish
              setup.
            </Typography>
          )}

          {error ? (
            <Alert severity={readyToLogin && loginEmployeeId ? "info" : "error"} sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          {success ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          ) : null}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {mode === "complete" ? (
                <TextField
                  label="Employee ID"
                  placeholder="e.g. emp1"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  fullWidth
                  disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
                />
              ) : null}
              <TextField
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
              />
              <TextField
                label={mode === "complete" ? "Full name (optional)" : "Full name"}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required={mode === "new"}
                fullWidth
                disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
              />
              {mode === "new" ? (
                <TextField
                  label="Department (optional)"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  fullWidth
                  disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
                />
              ) : null}
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
              />
              <TextField
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                fullWidth
                disabled={Boolean(success) || Boolean(readyToLogin && loginEmployeeId)}
              />
              {!success && !(readyToLogin && loginEmployeeId) ? (
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ textTransform: "none", bgcolor: "#5A58F2" }}
                >
                  {loading
                    ? "Saving…"
                    : mode === "complete"
                      ? "Complete registration"
                      : "Register"}
                </Button>
              ) : null}
              {success || (readyToLogin && loginEmployeeId) ? (
                <Button
                  variant="contained"
                  size="large"
                  onClick={() =>
                    navigate("/login", {
                      state: { portal: "employee", employeeId: loginEmployeeId || employeeId || undefined },
                    })
                  }
                  sx={{ textTransform: "none", bgcolor: "#5A58F2" }}
                >
                  Log in with {loginEmployeeId || employeeId || "Employee ID"}
                </Button>
              ) : null}
            </Stack>
          </Box>

          <Typography sx={{ mt: 3 }} color="text.secondary">
            Already set up?{" "}
            <Link component={RouterLink} to="/login" state={{ portal: "employee" }} fontWeight={700}>
              Log in with Employee ID
            </Link>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
