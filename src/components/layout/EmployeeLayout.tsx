import Menu from "@mui/icons-material/Menu";
import MenuOpen from "@mui/icons-material/MenuOpen";
import HomeOutlined from "@mui/icons-material/HomeOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import CreditCardOutlined from "@mui/icons-material/CreditCardOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import BarChartOutlined from "@mui/icons-material/BarChartOutlined";
import WarningAmberOutlined from "@mui/icons-material/WarningAmberOutlined";
import PersonOutline from "@mui/icons-material/PersonOutline";
import ArrowForward from "@mui/icons-material/ArrowForward";
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEmployeeData } from "../../context/EmployeeDataContext";
import { useAuth } from "../../context/AuthContext";

const navItems = [
  { label: "Home", to: "/employee", icon: <HomeOutlined /> },
  { label: "My transactions", to: "/employee/transactions", icon: <CreditCardOutlined /> },
  { label: "Payment proof", to: "/employee/payment-proof", icon: <ReceiptLongOutlined /> },
  { label: "My spend", to: "/employee/spend", icon: <BarChartOutlined /> },
  { label: "Activity & flags", to: "/employee/activity", icon: <WarningAmberOutlined /> },
  { label: "Profile", to: "/employee/profile", icon: <PersonOutline /> },
];

const drawerWidthExpanded = 254;
const drawerWidthCollapsed = 82;

export const EmployeeLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isBootstrapping } = useEmployeeData();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const currentWidth = isDesktop ? (collapsed ? drawerWidthCollapsed : drawerWidthExpanded) : 0;

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f4f6f8" }}>
      <AppBar
        color="inherit"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${currentWidth}px)` },
          ml: { md: `${currentWidth}px` },
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        {isBootstrapping ? <LinearProgress /> : null}
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <IconButton
              color="primary"
              onClick={() => (isDesktop ? setCollapsed((p) => !p) : setMobileOpen((p) => !p))}
            >
              {collapsed ? <Menu /> : <MenuOpen />}
            </IconButton>
            <Avatar sx={{ width: 32, height: 32, bgcolor: "#0d9488", fontSize: 14 }}>D</Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                allpay · Employee
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Mirrors admin data for your user only
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", sm: "block" } }} noWrap>
              {user?.email}
            </Typography>
            <IconButton
              color="default"
              onClick={() => {
                signOut();
                navigate("/", { replace: true });
              }}
              aria-label="Log out"
            >
              <LogoutOutlined />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isDesktop ? "permanent" : "temporary"}
        open={isDesktop ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: currentWidth || drawerWidthExpanded,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: currentWidth || drawerWidthExpanded,
            boxSizing: "border-box",
            borderRight: "1px solid #e2e8f0",
          },
        }}
      >
        <Toolbar />
        <Box sx={{ px: collapsed ? 1.5 : 2, py: 1.2 }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#0d9488", textAlign: collapsed ? "center" : "left" }}>
            AP
          </Typography>
          {!collapsed ? (
            <Typography variant="caption" color="text.secondary">
              Employee
            </Typography>
          ) : null}
        </Box>
        <List sx={{ px: 1 }}>
          {navItems.map((item) => {
            const selected =
              item.to === "/employee"
                ? location.pathname === "/employee"
                : location.pathname.startsWith(item.to);
            return (
              <ListItemButton
                key={item.label}
                component={RouterLink}
                to={item.to}
                selected={selected}
                onClick={() => setMobileOpen(false)}
                sx={{ mb: 0.5, borderRadius: 2, minHeight: 42 }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>{item.icon}</ListItemIcon>
                {!collapsed ? <ListItemText primary={item.label} /> : null}
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 3 }, mt: 8 }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export function EmployeeNavButton({
  label,
  to,
  variant = "contained",
}: {
  label: string;
  to: string;
  variant?: "contained" | "outlined";
}) {
  const navigate = useNavigate();
  return (
    <Box
      component="button"
      type="button"
      onClick={() => navigate(to)}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: variant === "contained" ? "10px 16px" : "8px 14px",
        borderRadius: 8,
        fontWeight: 600,
        fontSize: 14,
        background: variant === "contained" ? "#5A58F2" : "transparent",
        color: variant === "contained" ? "#fff" : "#5A58F2",
        border: variant === "outlined" ? "1px solid #5A58F2" : "none",
      }}
    >
      {label}
      <ArrowForward sx={{ fontSize: 16 }} />
    </Box>
  );
}
