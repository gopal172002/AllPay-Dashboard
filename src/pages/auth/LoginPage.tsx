import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
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
import AdminPanelSettingsOutlined from "@mui/icons-material/AdminPanelSettingsOutlined";
import BadgeOutlined from "@mui/icons-material/BadgeOutlined";
import { AnnouncementBar } from "../../components/marketing/AnnouncementBar";
import { MarketingHeader } from "../../components/marketing/MarketingHeader";
import { useAuth } from "../../context/AuthContext";
import type { LoginPortal } from "../../types/auth";

export function LoginPage() {
  const { signIn, user, isReady } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string; portal?: LoginPortal } | null;
  const initialPortal: LoginPortal = state?.portal === "employee" ? "employee" : "admin";

  const [portal, setPortal] = useState<LoginPortal>(initialPortal);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isReady || !user) return;
    if (user.portal === "employee" || user.employeeId && !user.adminId) {
      navigate("/employee", { replace: true });
      return;
    }
    if (user.adminId) {
      navigate("/admin/transactions", { replace: true });
    }
  }, [isReady, user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password, portal);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const from = state?.from;
    if (portal === "employee") {
      navigate(from?.startsWith("/employee") ? from : "/employee", { replace: true });
    } else {
      navigate(from?.startsWith("/admin") ? from : "/admin/transactions", { replace: true });
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#fff" }}>
      <AnnouncementBar />
      <MarketingHeader />
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper elevation={0} sx={{ p: { xs: 3, sm: 5 }, border: "1px solid #eef2f6", borderRadius: 3 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Log in to allpay
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Choose your workspace — admin finance console or employee self-service.
          </Typography>

          <Tabs
            value={portal}
            onChange={(_, v) => setPortal(v as LoginPortal)}
            sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab value="admin" icon={<AdminPanelSettingsOutlined />} iconPosition="start" label="Admin" />
            <Tab value="employee" icon={<BadgeOutlined />} iconPosition="start" label="Employee" />
          </Tabs>

          {portal === "admin" ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Finance, HR, and auditors — approve transactions, policies, and exports.
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              View your spend, submit payment proofs, and track flags. You cannot approve expenses here.
            </Typography>
          )}

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Work email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                autoComplete="email"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ textTransform: "none", mt: 1, bgcolor: "#5A58F2" }}
              >
                {loading ? "Signing in…" : portal === "admin" ? "Log in as Admin" : "Log in as Employee"}
              </Button>
            </Stack>
          </Box>
          {portal === "employee" ? (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
              Demo: employee@demo.allpay.local / password123
            </Typography>
          ) : (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
              Demo admin: test@example.com / password123
            </Typography>
          )}
          <Typography sx={{ mt: 3 }} color="text.secondary">
            New to allpay?{" "}
            <Link component={RouterLink} to="/signup" fontWeight={700}>
              Sign up your company
            </Link>
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
