import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedLayout } from "./components/auth/ProtectedLayout";
import { AdminLayout } from "./components/layout/AdminLayout";
import { AuthProvider } from "./context/AuthContext";
import { AdminAlertsPage } from "./pages/admin/AdminAlertsPage";
import { AdminAnalyticsPage } from "./pages/admin/AdminAnalyticsPage";
import { AdminBillingPage } from "./pages/admin/AdminBillingPage";
import { AdminEmployeesPage } from "./pages/admin/AdminEmployeesPage";
import { AdminExportsPage } from "./pages/admin/AdminExportsPage";
import { AdminFraudPage } from "./pages/admin/AdminFraudPage";
import { AdminPoliciesPage } from "./pages/admin/AdminPoliciesPage";
import { AdminRolesPage } from "./pages/admin/AdminRolesPage";
import { AdminTransactionDetailPage } from "./pages/admin/AdminTransactionDetailPage";
import { AdminTransactionsPage } from "./pages/admin/AdminTransactionsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { ApiSmokePage } from "./pages/dev/ApiSmokePage";

const theme = createTheme({
  palette: {
    primary: { main: "#5A58F2" },
    secondary: { main: "#06B6D4" },
    background: { default: "#ffffff" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          {import.meta.env.DEV ? <Route path="/dev/api-smoke" element={<ApiSmokePage />} /> : null}

          <Route path="/admin" element={<ProtectedLayout />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Navigate to="transactions" replace />} />
              <Route path="transactions" element={<AdminTransactionsPage />} />
              <Route path="policies" element={<AdminPoliciesPage />} />
              <Route path="fraud" element={<AdminFraudPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="exports" element={<AdminExportsPage />} />
              <Route path="employees" element={<AdminEmployeesPage />} />
              <Route path="roles" element={<AdminRolesPage />} />
              <Route path="alerts" element={<AdminAlertsPage />} />
              <Route path="billing" element={<AdminBillingPage />} />
              <Route path="transaction/:id" element={<AdminTransactionDetailPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
