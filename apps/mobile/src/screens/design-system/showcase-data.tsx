/** The design-system showcase's sample content (v1 swatches.ts and the demo table). */
import { AttendancePill, Badge, type DataTableColumn } from "../../design/ui";

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// Full class names so Tailwind's content scan generates every swatch.
export const PALETTE: { name: string; classes: string[] }[] = [
  {
    name: "brand-navy",
    classes: [
      "bg-brand-navy-50",
      "bg-brand-navy-100",
      "bg-brand-navy-200",
      "bg-brand-navy-300",
      "bg-brand-navy-400",
      "bg-brand-navy-500",
      "bg-brand-navy-600",
      "bg-brand-navy-700",
      "bg-brand-navy-800",
      "bg-brand-navy-900",
      "bg-brand-navy-950",
    ],
  },
  {
    name: "brand-teal",
    classes: [
      "bg-brand-teal-50",
      "bg-brand-teal-100",
      "bg-brand-teal-200",
      "bg-brand-teal-300",
      "bg-brand-teal-400",
      "bg-brand-teal-500",
      "bg-brand-teal-600",
      "bg-brand-teal-700",
      "bg-brand-teal-800",
      "bg-brand-teal-900",
      "bg-brand-teal-950",
    ],
  },
  {
    name: "neutral",
    classes: [
      "bg-neutral-50",
      "bg-neutral-100",
      "bg-neutral-200",
      "bg-neutral-300",
      "bg-neutral-400",
      "bg-neutral-500",
      "bg-neutral-600",
      "bg-neutral-700",
      "bg-neutral-800",
      "bg-neutral-900",
      "bg-neutral-950",
    ],
  },
  {
    name: "success",
    classes: [
      "bg-success-50",
      "bg-success-100",
      "bg-success-200",
      "bg-success-300",
      "bg-success-400",
      "bg-success-500",
      "bg-success-600",
      "bg-success-700",
      "bg-success-800",
      "bg-success-900",
      "bg-success-950",
    ],
  },
  {
    name: "warning",
    classes: [
      "bg-warning-50",
      "bg-warning-100",
      "bg-warning-200",
      "bg-warning-300",
      "bg-warning-400",
      "bg-warning-500",
      "bg-warning-600",
      "bg-warning-700",
      "bg-warning-800",
      "bg-warning-900",
      "bg-warning-950",
    ],
  },
  {
    name: "error",
    classes: [
      "bg-error-50",
      "bg-error-100",
      "bg-error-200",
      "bg-error-300",
      "bg-error-400",
      "bg-error-500",
      "bg-error-600",
      "bg-error-700",
      "bg-error-800",
      "bg-error-900",
      "bg-error-950",
    ],
  },
  {
    name: "info",
    classes: [
      "bg-info-50",
      "bg-info-100",
      "bg-info-200",
      "bg-info-300",
      "bg-info-400",
      "bg-info-500",
      "bg-info-600",
      "bg-info-700",
      "bg-info-800",
      "bg-info-900",
      "bg-info-950",
    ],
  },
];
export const SEMANTIC = [
  ["background", "bg-background"],
  ["foreground", "bg-foreground"],
  ["card", "bg-card"],
  ["primary", "bg-primary"],
  ["secondary", "bg-secondary"],
  ["muted", "bg-muted"],
  ["accent", "bg-accent"],
  ["destructive", "bg-destructive"],
  ["border", "bg-border"],
  ["ring", "bg-ring"],
] as const;
export const ROLES = ["super", "admin", "leader", "mentor", "student"] as const;

export interface DemoRow {
  id: number;
  name: string;
  role: "SUPER" | "ADMIN" | "LEADER" | "MENTOR" | "STUDENT";
  status: "PRESENT" | "ABSENT" | "LATE";
}
export const demoRows: DemoRow[] = [
  { id: 1, name: "Alice Cohen", role: "STUDENT", status: "PRESENT" },
  { id: 2, name: "Ben Daniels", role: "STUDENT", status: "LATE" },
  { id: 3, name: "Carla Evans", role: "LEADER", status: "PRESENT" },
];
export const demoColumns: DataTableColumn<DemoRow>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  {
    key: "role",
    header: "Role",
    cell: (r) => <Badge role={r.role.toLowerCase() as "super"}>{r.role}</Badge>,
  },
  { key: "status", header: "Attendance", cell: (r) => <AttendancePill status={r.status} /> },
];
