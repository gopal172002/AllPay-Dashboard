import CloudUpload from "@mui/icons-material/CloudUpload";
import ContentCopy from "@mui/icons-material/ContentCopy";
import GroupOutlined from "@mui/icons-material/GroupOutlined";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useAdminData } from "../../context/AdminDataContext";

export const AdminEmployeesPage = () => {
  const {
    employees,
    addEmployeesFromCsv,
    inviteEmployee,
    assignEmployeeId,
    generateEmployeeInviteCode,
    resetEmployeeLogin,
    manageDepartment,
    isSaving,
    errorMessage,
  } = useAdminData();
  const [csv, setCsv] = useState("employee ID,name,email,department,role\nemp5,New User,new.user@allpay.in,Finance,employee");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDepartment, setInviteDepartment] = useState("Finance");
  const [department, setDepartment] = useState("New Department");
  const [departmentNext, setDepartmentNext] = useState("Renamed Department");
  const [info, setInfo] = useState("");
  const [assignedBanner, setAssignedBanner] = useState("");
  const [tableFeedback, setTableFeedback] = useState<{ severity: "success" | "error"; text: string } | null>(
    null
  );

  const departments = useMemo(() => Array.from(new Set(employees.map((emp) => emp.department))), [employees]);
  const pendingEmployees = useMemo(
    () => employees.filter((emp) => emp.active && emp.idAssigned === false),
    [employees]
  );

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setInfo(`Copied ${label} to clipboard.`);
    } catch {
      setInfo(`${label}: ${text}`);
    }
  };

  const copyId = async (id: string) => copyText("Employee ID", id);
  const copyInviteCode = async (code: string) => copyText("Invite code", code);

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center">
            <GroupOutlined color="primary" />
            <Typography variant="h5" fontWeight={800}>
              Employee Management
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Invite or import employees, assign serial IDs (emp1, emp2, …), and manage departments.
          </Typography>
        </CardContent>
      </Card>

      {pendingEmployees.length > 0 ? (
        <Card sx={{ borderRadius: 3, border: "1px solid #fde68a", bgcolor: "#fffbeb" }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700} mb={1}>
              Pending Employee ID ({pendingEmployees.length})
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              These employees registered or were invited but cannot log in until you assign an ID. Share the ID with them
              after assignment.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingEmployees.map((emp) => (
                  <TableRow key={emp.email}>
                    <TableCell>{emp.name}</TableCell>
                    <TableCell>{emp.email}</TableCell>
                    <TableCell>{emp.department}</TableCell>
                    <TableCell align="right">
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isSaving}
                        onClick={async () => {
                          const { employeeId, inviteCode } = await assignEmployeeId(emp.email);
                          const codeNote = inviteCode ? ` Mobile invite code: ${inviteCode}.` : "";
                          setAssignedBanner(
                            `Assigned ${employeeId} to ${emp.name}. Share it so they can log in.${codeNote}`
                          );
                          setInfo("");
                        }}
                        sx={{ textTransform: "none" }}
                      >
                        Assign ID
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {assignedBanner ? (
        <Alert
          severity="success"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                const match = assignedBanner.match(/Assigned (emp\d+)/);
                if (match?.[1]) void copyId(match[1]);
              }}
            >
              Copy ID
            </Button>
          }
        >
          {assignedBanner}
        </Alert>
      ) : null}

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={1}>
            Bulk import via CSV
          </Typography>
          <TextField
            multiline
            minRows={4}
            fullWidth
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
          />
          <Stack direction="row" spacing={1} mt={1.2} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              startIcon={<CloudUpload />}
              disabled={isSaving}
              onClick={async () => {
                const count = await addEmployeesFromCsv(csv);
                setInfo(`Imported ${count} employees successfully. Rows without an ID column stay pending until you assign one.`);
              }}
            >
              Import CSV
            </Button>
            <TextField size="small" label="Invite email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
            <TextField size="small" label="Department" value={inviteDepartment} onChange={(event) => setInviteDepartment(event.target.value)} />
            <Button
              variant="outlined"
              disabled={isSaving || !inviteEmail}
              onClick={async () => {
                const inviteCode = await inviteEmployee(inviteEmail, inviteDepartment);
                const codeNote = inviteCode
                  ? ` Mobile invite code: ${inviteCode} (share for app onboarding).`
                  : "";
                setInfo(
                  `Invited ${inviteEmail}. Assign an Employee ID when they register or are ready to log in.${codeNote}`
                );
                setInviteEmail("");
              }}
            >
              Invite employee
            </Button>
          </Stack>
          {info ? <Alert sx={{ mt: 1.2 }}>{info}</Alert> : null}
          {errorMessage ? <Alert severity="error" sx={{ mt: 1.2 }}>{errorMessage}</Alert> : null}
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={1}>
            Department controls
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Department" value={department} onChange={(event) => setDepartment(event.target.value)} />
            <TextField size="small" label="Rename to" value={departmentNext} onChange={(event) => setDepartmentNext(event.target.value)} />
            <Button variant="outlined" onClick={() => manageDepartment("create", department)}>
              Create
            </Button>
            <Button variant="outlined" onClick={() => manageDepartment("rename", department, departmentNext)}>
              Rename
            </Button>
            <Button variant="outlined" color="error" onClick={() => manageDepartment("delete", department)}>
              Delete
            </Button>
          </Stack>
          <Stack direction="row" spacing={1} mt={1.2} flexWrap="wrap">
            {departments.map((dep) => (
              <Chip key={dep} label={dep} />
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700}>
            Employee onboarding status
          </Typography>
          {tableFeedback ? (
            <Alert severity={tableFeedback.severity} sx={{ mb: 1.5 }} onClose={() => setTableFeedback(null)}>
              {tableFeedback.text}
            </Alert>
          ) : null}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Mobile invite</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Onboarding</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.slice(0, 80).map((emp) => (
                <TableRow key={emp.email}>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      <span>{emp.idAssigned === false ? "—" : emp.id}</span>
                      {emp.idAssigned !== false ? (
                        <Tooltip title="Copy ID">
                          <IconButton size="small" onClick={() => void copyId(emp.id)}>
                            <ContentCopy fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell>{emp.name}</TableCell>
                  <TableCell>{emp.email}</TableCell>
                  <TableCell>{emp.department}</TableCell>
                  <TableCell>
                    {emp.inviteCode ? (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <Chip size="small" label={emp.inviteCode} variant="outlined" />
                        <Tooltip title="Copy invite code">
                          <IconButton size="small" onClick={() => void copyInviteCode(emp.inviteCode!)}>
                            <ContentCopy fontSize="inherit" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Button
                        size="small"
                        variant="text"
                        disabled={isSaving}
                        onClick={async () => {
                          setTableFeedback(null);
                          const result = await generateEmployeeInviteCode(emp.email);
                          setTableFeedback({
                            severity: result.ok ? "success" : "error",
                            text: result.ok
                              ? `Invite code ${result.inviteCode} ready for ${emp.name}.`
                              : result.message || "Could not generate invite code.",
                          });
                        }}
                        sx={{ textTransform: "none" }}
                      >
                        Generate
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={emp.active ? "success" : "default"} label={emp.active ? "Active" : "Deactivated"} />
                  </TableCell>
                  <TableCell>
                    {emp.idAssigned === false ? (
                      <Chip size="small" color="warning" label="Pending ID" />
                    ) : (
                      <Chip size="small" color={emp.onboarded ? "primary" : "warning"} label={emp.onboarded ? "Completed" : "Pending"} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {emp.idAssigned !== false ? (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={isSaving}
                        onClick={async () => {
                          setTableFeedback(null);
                          const result = await resetEmployeeLogin(emp.email, emp.id);
                          setTableFeedback({
                            severity: result.ok ? "success" : "error",
                            text: result.message || "Reset login failed.",
                          });
                        }}
                        sx={{ textTransform: "none" }}
                      >
                        Reset login
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
};
