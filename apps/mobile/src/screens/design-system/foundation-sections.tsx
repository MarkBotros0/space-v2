/** The showcase's foundations: identity, theme, motion, elevation, palette, roles and type. */
import { Sparkles } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
import { shadowStyle } from "../../design/lib/shadow";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Logo,
  Text,
  ThemeToggle,
  toast,
} from "../../design/ui";
import { PALETTE, ROLES, SEMANTIC, STEPS } from "./showcase-data";
import { Code, Grid, Section } from "./showcase-kit";

iconWithClassName(Sparkles);

export function FoundationSections() {
  return (
    <>
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
              Tokens auto-switch via <Code>next-themes</Code>. The toggle lives in the top bar —
              duplicate here for convenience.
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
            <Button
              variant="outline"
              onPress={() =>
                toast.success("Toast queued.", { description: "Sonner is wired up app-wide." })
              }
            >
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
            <View
              key={name}
              className="rounded-2xl border border-border/60 bg-card p-6"
              style={shadowStyle(name)}
            >
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
                    <View
                      accessibilityLabel={`${scale.name}-${STEPS[i]}`}
                      className={`h-10 rounded-md border border-border ${cls}`}
                    />
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
            Body text — the primary reading size for paragraphs. Geist&apos;s stylistic alternates
            are on by default (<Code>ss01</Code>, <Code>ss03</Code>, <Code>cv11</Code>).
          </Text>
          <Text className="text-sm text-muted-foreground">
            Small text — secondary metadata and descriptions.
          </Text>
          <Text className="text-xs text-muted-foreground">
            Caption — timestamps and overflow labels.
          </Text>
          <Text className="font-mono text-sm text-foreground">
            const fontMono = &quot;Geist Mono&quot;;
          </Text>
        </View>
      </Section>
    </>
  );
}
