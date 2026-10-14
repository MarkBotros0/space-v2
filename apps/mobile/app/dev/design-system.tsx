/**
 * Counterpart of v1 src/app/dev/design-system/ (page.tsx, swatches.ts,
 * form.tsx, modal-demo.tsx, identity-demo.tsx): the same sections in the
 * same order with the same sample content, built from design/ui. Like v1's
 * page it renders outside the app shell. Hidden unless the build sets
 * EXPO_PUBLIC_SHOW_DEV_ROUTES=1.
 * Native differences: the Motion section's stagger-in animation is static.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Redirect } from "expo-router";
import { Bell, FileText, Inbox, Plus, Search, Sparkles } from "lucide-react-native";
import type { ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { ScrollView, Text as RNText, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { z } from "zod";

import { PageHeader } from "../../src/design/layout/page-header";
import { iconWithClassName } from "../../src/design/lib/icon";
import { shadowStyle } from "../../src/design/lib/shadow";
import {
  AttendancePill,
  Avatar,
  AvatarFallback,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FileUpload,
  Input,
  Label,
  Logo,
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  SkeletonCard,
  SkeletonText,
  SubmissionStatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  Textarea,
  ThemeToggle,
  toast,
} from "../../src/design/ui";
import { showDevRoutes } from "../../src/lib/app-config";

iconWithClassName(Bell, FileText, Inbox, Plus, Search, Sparkles);

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// Full class names so Tailwind's content scan generates every swatch.
const PALETTE: { name: string; classes: string[] }[] = [
  { name: "brand-navy", classes: ["bg-brand-navy-50", "bg-brand-navy-100", "bg-brand-navy-200", "bg-brand-navy-300", "bg-brand-navy-400", "bg-brand-navy-500", "bg-brand-navy-600", "bg-brand-navy-700", "bg-brand-navy-800", "bg-brand-navy-900", "bg-brand-navy-950"] },
  { name: "brand-teal", classes: ["bg-brand-teal-50", "bg-brand-teal-100", "bg-brand-teal-200", "bg-brand-teal-300", "bg-brand-teal-400", "bg-brand-teal-500", "bg-brand-teal-600", "bg-brand-teal-700", "bg-brand-teal-800", "bg-brand-teal-900", "bg-brand-teal-950"] },
  { name: "neutral", classes: ["bg-neutral-50", "bg-neutral-100", "bg-neutral-200", "bg-neutral-300", "bg-neutral-400", "bg-neutral-500", "bg-neutral-600", "bg-neutral-700", "bg-neutral-800", "bg-neutral-900", "bg-neutral-950"] },
  { name: "success", classes: ["bg-success-50", "bg-success-100", "bg-success-200", "bg-success-300", "bg-success-400", "bg-success-500", "bg-success-600", "bg-success-700", "bg-success-800", "bg-success-900", "bg-success-950"] },
  { name: "warning", classes: ["bg-warning-50", "bg-warning-100", "bg-warning-200", "bg-warning-300", "bg-warning-400", "bg-warning-500", "bg-warning-600", "bg-warning-700", "bg-warning-800", "bg-warning-900", "bg-warning-950"] },
  { name: "error", classes: ["bg-error-50", "bg-error-100", "bg-error-200", "bg-error-300", "bg-error-400", "bg-error-500", "bg-error-600", "bg-error-700", "bg-error-800", "bg-error-900", "bg-error-950"] },
  { name: "info", classes: ["bg-info-50", "bg-info-100", "bg-info-200", "bg-info-300", "bg-info-400", "bg-info-500", "bg-info-600", "bg-info-700", "bg-info-800", "bg-info-900", "bg-info-950"] },
];
const SEMANTIC = [
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
const ROLES = ["super", "admin", "leader", "mentor", "student"] as const;

interface DemoRow {
  id: number;
  name: string;
  role: "SUPER" | "ADMIN" | "LEADER" | "MENTOR" | "STUDENT";
  status: "PRESENT" | "ABSENT" | "LATE";
}
const demoRows: DemoRow[] = [
  { id: 1, name: "Alice Cohen", role: "STUDENT", status: "PRESENT" },
  { id: 2, name: "Ben Daniels", role: "STUDENT", status: "LATE" },
  { id: 3, name: "Carla Evans", role: "LEADER", status: "PRESENT" },
];
const demoColumns: DataTableColumn<DemoRow>[] = [
  { key: "name", header: "Name", cell: (r) => r.name },
  { key: "role", header: "Role", cell: (r) => <Badge role={r.role.toLowerCase() as "super"}>{r.role}</Badge> },
  { key: "status", header: "Attendance", cell: (r) => <AttendancePill status={r.status} /> },
];

function Section({ title, subtitle, first, children }: { title: string; subtitle?: string; first?: boolean; children: ReactNode }) {
  return (
    <View className={first ? "py-6" : "border-t border-border py-6"}>
      <View className="mb-4 flex-col gap-0.5">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {title}
        </Text>
        {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** grid-cols-N with gap: phone-width columns computed from the content width. */
function Grid({ cols, gap, children }: { cols: number; gap: number; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const cell = (width - 32 - gap * (cols - 1)) / cols;
  return (
    <View className="flex-row flex-wrap" style={{ gap }}>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <View key={i} style={{ width: cell }}>
              {c}
            </View>
          ))
        : children}
    </View>
  );
}

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["ADMIN", "LEADER", "MENTOR", "STUDENT"]),
  notes: z.string().max(500).optional(),
});
type FormValues = z.infer<typeof formSchema>;

function DesignSystemForm() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", role: "STUDENT", notes: "" },
  });
  const onSubmit = async () => {
    await new Promise((r) => setTimeout(r, 600));
  };
  return (
    <View className="gap-4">
      <Field>
        <Label>Name</Label>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Jane Doe" aria-invalid={errors.name ? true : undefined} />
          )}
        />
        <FieldError>{errors.name?.message}</FieldError>
      </Field>
      <Field>
        <Label>Email</Label>
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="jane@example.com"
              aria-invalid={errors.email ? true : undefined}
            />
          )}
        />
        <FieldDescription>We never share your email.</FieldDescription>
        <FieldError>{errors.email?.message}</FieldError>
      </Field>
      <Field>
        <Label>Role</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(v) => field.onChange(v as FormValues["role"])}>
              <SelectTrigger accessibilityLabel="Role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="LEADER">Leader</SelectItem>
                <SelectItem value="MENTOR">Mentor</SelectItem>
                <SelectItem value="STUDENT">Student</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <FieldError>{errors.role?.message}</FieldError>
      </Field>
      <Field>
        <Label>Notes</Label>
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Textarea value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} placeholder="Optional notes…" aria-invalid={errors.notes ? true : undefined} />
          )}
        />
        <FieldError>{errors.notes?.message}</FieldError>
      </Field>
      <View className="flex-row justify-end gap-2">
        <Button variant="ghost">Cancel</Button>
        <Button onPress={handleSubmit(onSubmit)} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </View>
    </View>
  );
}

/** v1's inline <code>: inherits the surrounding colour (nested text does too). */
function Code({ children }: { children: string }) {
  return (
    <RNText className="bg-muted text-xs" style={{ fontFamily: "GeistMono_400Regular" }}>
      {children}
    </RNText>
  );
}

export default function DesignSystem() {
  if (!showDevRoutes()) return <Redirect href="/" />;
  return <Showcase />;
}

function Showcase() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="w-full px-4 py-6">
        <PageHeader title="Design System" description="Tokens, primitives, and patterns. Reference before building any new screen." />

        <Section title="Identity" subtitle="Logo, wordmark, and brand mark sizes">
          <View className="flex-col gap-8">
            <View className="flex-row flex-wrap items-end gap-6">
              <Logo size="sm" />
              <Logo size="md" />
              <Logo size="lg" />
            </View>
            <View className="flex-row flex-wrap items-center gap-6 rounded-2xl border border-border/60 bg-card p-4">
              <Logo size="md" showWordmark />
              <Logo size="lg" showWordmark />
            </View>
          </View>
        </Section>

        <Section title="Theme" subtitle="Light + dark via next-themes — tokens swap automatically">
          <Card>
            <CardHeader>
              <CardTitle>Light & dark mode</CardTitle>
              <CardDescription>
                Tokens auto-switch via <Code>next-themes</Code>. The toggle lives in the top bar — duplicate here for convenience.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeToggle size="icon" />
            </CardContent>
          </Card>
        </Section>

        <Section title="Motion" subtitle="framer-motion presets in src/lib/motion.ts">
          <View className="flex-col gap-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <Button>Replay reveal</Button>
              <Button variant="outline" onPress={() => toast.success("Toast queued.", { description: "Sonner is wired up app-wide." })}>
                Trigger toast
              </Button>
            </View>
            <View className="gap-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Card key={n} className="p-4">
                  <View className="flex-row items-center gap-2">
                    <View className="size-8 items-center justify-center rounded-full bg-brand-teal-100 dark:bg-brand-teal-900">
                      <Sparkles size={16} className="text-brand-teal-700 dark:text-brand-teal-200" />
                    </View>
                    <Text className="text-sm font-medium text-foreground">Card #{n}</Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        </Section>

        <Section title="Elevation" subtitle="Three sanctioned shadow tokens">
          <View className="gap-4">
            {(
              [
                ["soft", "Cards at rest"],
                ["pop", "Hover, popovers"],
                ["lift", "Modal, FAB"],
              ] as const
            ).map(([name, caption]) => (
              <View key={name} className="rounded-2xl border border-border/60 bg-card p-6" style={shadowStyle(name)}>
                <Text className="text-lg font-semibold tracking-tight">shadow-{name}</Text>
                <Text className="text-sm text-muted-foreground">{caption}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Palette" subtitle="Brand and semantic scales">
          <View className="flex-col gap-6">
            {PALETTE.map((scale) => (
              <View key={scale.name} className="flex-col gap-2">
                <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
                  {scale.name}
                </Text>
                <Grid cols={6} gap={8}>
                  {scale.classes.map((cls, i) => (
                    <View key={cls} className="flex-col gap-1">
                      <View accessibilityLabel={`${scale.name}-${STEPS[i]}`} className={`h-10 rounded-md border border-border ${cls}`} />
                      <Text className="text-[10px] text-muted-foreground">{STEPS[i]}</Text>
                    </View>
                  ))}
                </Grid>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Semantic aliases" subtitle="Re-pointed at brand scales">
          <Grid cols={2} gap={12}>
            {SEMANTIC.map(([name, cls]) => (
              <View key={name} className="flex-col gap-1">
                <View className={`h-12 rounded-md border border-border ${cls}`} />
                <Text className="text-xs text-muted-foreground">{name}</Text>
              </View>
            ))}
          </Grid>
        </Section>

        <Section title="Role colors" subtitle="Used by role badges">
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => (
              <Badge key={r} role={r}>
                {r.toUpperCase()}
              </Badge>
            ))}
          </View>
        </Section>

        <Section
          title="Typography"
          subtitle="Geist Sans for all UI and headings, Geist Mono for code, Fraunces reserved for the JPC Space wordmark"
        >
          <View className="flex-col gap-3">
            <Text className="text-4xl font-semibold tracking-tight">The work between</Text>
            <Text className="text-2xl font-semibold tracking-tight">Heading 2 — Geist Sans</Text>
            <Text className="text-xl font-semibold">Heading 3 — Geist Sans</Text>
            <Text className="text-lg font-medium">Heading 4 — Geist Sans</Text>
            <Text className="max-w-2xl text-base text-foreground">
              Body text — the primary reading size for paragraphs. Geist&apos;s stylistic alternates are on by default (<Code>ss01</Code>,{" "}
              <Code>ss03</Code>, <Code>cv11</Code>).
            </Text>
            <Text className="text-sm text-muted-foreground">Small text — secondary metadata and descriptions.</Text>
            <Text className="text-xs text-muted-foreground">Caption — timestamps and overflow labels.</Text>
            <Text className="font-mono text-sm text-foreground">const fontMono = &quot;Geist Mono&quot;;</Text>
          </View>
        </Section>

        <Section title="Buttons">
          <View className="flex-col gap-4">
            <View className="flex-row flex-wrap gap-2">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </View>
            <View className="flex-row flex-wrap items-end gap-2">
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button size="default">default</Button>
              <Button size="lg">lg</Button>
              <Button size="icon" accessibilityLabel="add">
                <Plus size={16} className="text-primary-foreground" />
              </Button>
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button disabled>Disabled</Button>
              <Button variant="outline" disabled>
                Disabled outline
              </Button>
            </View>
          </View>
        </Section>

        <Section title="Badges">
          <View className="flex-row flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="info">Info</Badge>
          </View>
        </Section>

        <Section title="Avatars">
          <View className="flex-col gap-4">
            <View className="flex-row items-end gap-3">
              <Avatar size="sm"><AvatarFallback>MB</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>JP</AvatarFallback></Avatar>
              <Avatar size="lg"><AvatarFallback>AS</AvatarFallback></Avatar>
              <Avatar size="xl"><AvatarFallback>XL</AvatarFallback></Avatar>
            </View>
            <AvatarGroup max={3}>
              <Avatar size="md"><AvatarFallback>AB</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>CD</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>EF</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>GH</AvatarFallback></Avatar>
              <Avatar size="md"><AvatarFallback>IJ</AvatarFallback></Avatar>
            </AvatarGroup>
          </View>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><Text className="text-sm text-muted-foreground">Overview content.</Text></TabsContent>
            <TabsContent value="members"><Text className="text-sm text-muted-foreground">Members content.</Text></TabsContent>
            <TabsContent value="activity"><Text className="text-sm text-muted-foreground">Activity content.</Text></TabsContent>
          </Tabs>
        </Section>

        <Section title="Progress">
          <View className="max-w-md flex-col gap-4">
            <Progress value={25} label="Quarter complete" showValue />
            <Progress value={60} label="In progress" showValue />
            <Progress value={100} label="Done" showValue />
          </View>
        </Section>

        <Section title="Attendance pills">
          <View className="flex-row flex-wrap gap-2">
            <AttendancePill status="PRESENT" />
            <AttendancePill status="ABSENT" />
            <AttendancePill status="LATE" />
          </View>
        </Section>

        <Section title="Submission status badges">
          <View className="flex-row flex-wrap gap-2">
            <SubmissionStatusBadge status="DRAFT" />
            <SubmissionStatusBadge status="SUBMITTED" />
            <SubmissionStatusBadge status="REVIEWED" />
            <SubmissionStatusBadge status="RETURNED" />
          </View>
        </Section>

        <Section title="File upload">
          <FileUpload accept="image/*,.pdf" maxSizeMb={10} />
        </Section>

        <Section title="Data table" subtitle="Becomes a card list at < md">
          <DataTable columns={demoColumns} rows={demoRows} rowKey={(r) => r.id} />
        </Section>

        <Section title="Cards">
          <View className="gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Plain card</CardTitle>
                <CardDescription>A simple card with a header and content.</CardDescription>
              </CardHeader>
              <CardContent>
                <Text className="text-sm text-muted-foreground">Body content goes here.</Text>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>With footer</CardTitle>
                <CardDescription>Actions live in the footer.</CardDescription>
              </CardHeader>
              <CardContent>
                <Text className="text-sm text-muted-foreground">Some body text describing the action below.</Text>
              </CardContent>
              <CardFooter>
                <Button size="sm">Confirm</Button>
                <Button size="sm" variant="ghost">Cancel</Button>
              </CardFooter>
            </Card>
          </View>
        </Section>

        <Section title="Form fields" subtitle="React Hook Form + Zod demo">
          <DesignSystemForm />
        </Section>

        <Section title="Modal" subtitle="Bottom sheet on mobile, centered dialog on md+">
          <Modal>
            <ModalTrigger>
              <Button className="self-start">Open modal</Button>
            </ModalTrigger>
            <ModalContent>
              <ModalHeader>
                <ModalTitle>Confirm action</ModalTitle>
                <ModalDescription>On mobile this slides up as a bottom sheet; on md+ it appears centered.</ModalDescription>
              </ModalHeader>
              <Text className="text-sm text-muted-foreground">Body content goes here — any form, table, or description.</Text>
              <ModalFooter>
                <ModalClose>
                  <Button variant="ghost">Cancel</Button>
                </ModalClose>
                <ModalClose>
                  <Button>Confirm</Button>
                </ModalClose>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </Section>

        <Section title="Empty states">
          <View className="gap-4">
            <EmptyState icon={Inbox} title="No items yet" description="When items are created, they will appear here." />
            <EmptyState
              icon={Search}
              title="No matches"
              description="Try a different search term."
              action={<Button size="sm" variant="outline">Clear filters</Button>}
            />
          </View>
        </Section>

        <Section title="Skeletons">
          <View className="gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </View>
          <Separator className="my-4" />
          <SkeletonText lines={4} />
        </Section>

        <Section title="Icons" subtitle="lucide-react">
          <View className="flex-row flex-wrap gap-3">
            <Bell size={20} className="text-muted-foreground" />
            <FileText size={20} className="text-muted-foreground" />
            <Inbox size={20} className="text-muted-foreground" />
            <Plus size={20} className="text-muted-foreground" />
            <Search size={20} className="text-muted-foreground" />
          </View>
        </Section>
      </View>
    </ScrollView>
  );
}
