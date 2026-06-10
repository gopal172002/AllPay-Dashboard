import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AdminDataProvider } from "../../context/AdminDataContext";
import { useAuth } from "../../context/AuthContext";
import { Box, CircularProgress } from "@mui/material";

export function AdminProtectedLayout() {
  const { user, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname, portal: "admin" }} />;
  }

  if (!user.adminId) {
    return <Navigate to="/login" replace state={{ from: location.pathname, portal: "admin" }} />;
  }

  return (
    <AdminDataProvider>
      <Outlet />
    </AdminDataProvider>
  );
}
