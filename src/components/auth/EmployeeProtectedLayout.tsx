import { Navigate, Outlet, useLocation } from "react-router-dom";
import { EmployeeDataProvider } from "../../context/EmployeeDataContext";
import { useAuth } from "../../context/AuthContext";
import { Box, CircularProgress } from "@mui/material";

export function EmployeeProtectedLayout() {
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
    return <Navigate to="/login" replace state={{ from: location.pathname, portal: "employee" }} />;
  }

  if (!user.employeeId) {
    return <Navigate to="/login" replace state={{ from: location.pathname, portal: "employee" }} />;
  }

  return (
    <EmployeeDataProvider>
      <Outlet />
    </EmployeeDataProvider>
  );
}
