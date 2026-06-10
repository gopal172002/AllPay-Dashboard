import PersonOutline from "@mui/icons-material/PersonOutline";
import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { useEmployeeData } from "../../context/EmployeeDataContext";

const profileFont = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ py: 1.1 }}>
      <Typography
        component="span"
        sx={{
          fontFamily: profileFont,
          fontSize: 15,
          fontWeight: 700,
          color: "#111827",
          lineHeight: 1.5,
        }}
      >
        {label}:
      </Typography>
      <Typography
        component="span"
        sx={{
          fontFamily: profileFont,
          fontSize: 15,
          fontWeight: 400,
          color: "#111827",
          lineHeight: 1.5,
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

export function EmployeeProfilePage() {
  const { user } = useAuth();
  const { employee } = useEmployeeData();

  const name = employee?.name ?? user?.fullName ?? "—";
  const email = employee?.email ?? user?.email ?? "—";
  const employeeId = employee?.id ?? user?.employeeId ?? "—";
  const department = employee?.department ?? user?.employeeDepartment ?? "—";
  const role = employee?.role ?? user?.employeeRole ?? "employee";

  return (
    <Stack spacing={2.5} maxWidth={720}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <PersonOutline sx={{ color: "#5A58F2", fontSize: 22 }} />
            <Typography
              sx={{
                fontFamily: profileFont,
                fontSize: 24,
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.3,
              }}
            >
              Directory profile
            </Typography>
          </Stack>
          <Typography
            sx={{
              fontFamily: profileFont,
              fontSize: 14,
              fontWeight: 400,
              color: "#6b7280",
              lineHeight: 1.55,
            }}
          >
            Same fields finance sees under admin{" "}
            <Box component="span" sx={{ fontWeight: 700, color: "#6b7280" }}>
              Employees
            </Box>{" "}
            (read-only here).
          </Typography>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <ProfileRow label="Name" value={name} />
          <Divider />
          <ProfileRow label="Email" value={email} />
          <Divider />
          <ProfileRow label="Employee id" value={employeeId} />
          <Divider />
          <ProfileRow label="Department" value={department} />
          <Divider />
          <ProfileRow label="Role in directory" value={role} />

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
            <Chip
              label="Active"
              sx={{
                fontFamily: profileFont,
                fontSize: 13,
                fontWeight: 400,
                bgcolor: "#22c55e",
                color: "#fff",
                height: 28,
                borderRadius: "999px",
              }}
            />
            {employee?.onboarded ? (
              <Chip
                label="Onboarding complete"
                sx={{
                  fontFamily: profileFont,
                  fontSize: 13,
                  fontWeight: 400,
                  bgcolor: "#5A58F2",
                  color: "#fff",
                  height: 28,
                  borderRadius: "999px",
                }}
              />
            ) : (
              <Chip
                label="Onboarding pending"
                variant="outlined"
                sx={{ fontFamily: profileFont, fontSize: 13, fontWeight: 400, height: 28 }}
              />
            )}
            {employee?.travelApproved ? (
              <Chip
                label="Travel approved"
                variant="outlined"
                sx={{
                  fontFamily: profileFont,
                  fontSize: 13,
                  fontWeight: 400,
                  color: "#64748b",
                  borderColor: "#d1d9e0",
                  bgcolor: "#fff",
                  height: 28,
                  borderRadius: "999px",
                }}
              />
            ) : (
              <Chip
                label="Travel not approved"
                variant="outlined"
                sx={{ fontFamily: profileFont, fontSize: 13, fontWeight: 400, height: 28 }}
              />
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
