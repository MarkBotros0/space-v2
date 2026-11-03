/** The showcase's components: buttons through icons, in v1's order. */
import { Bell, FileText, Inbox, Plus, Search } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../design/lib/icon";
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
  EmptyState,
  FileUpload,
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Progress,
  Separator,
  SkeletonCard,
  SkeletonText,
  SubmissionStatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "../../design/ui";
import { demoColumns, demoRows } from "./showcase-data";
import { DesignSystemForm } from "./showcase-form";
import { Section } from "./showcase-kit";

iconWithClassName(Bell, FileText, Inbox, Plus, Search);

export function ComponentSections() {
  return (
    <>
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
            <Avatar size="sm">
              <AvatarFallback>MB</AvatarFallback>
            </Avatar>
            <Avatar size="md">
              <AvatarFallback>JP</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarFallback>AS</AvatarFallback>
            </Avatar>
            <Avatar size="xl">
              <AvatarFallback>XL</AvatarFallback>
            </Avatar>
          </View>
          <AvatarGroup max={3}>
            <Avatar size="md">
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar size="md">
              <AvatarFallback>CD</AvatarFallback>
            </Avatar>
            <Avatar size="md">
              <AvatarFallback>EF</AvatarFallback>
            </Avatar>
            <Avatar size="md">
              <AvatarFallback>GH</AvatarFallback>
            </Avatar>
            <Avatar size="md">
              <AvatarFallback>IJ</AvatarFallback>
            </Avatar>
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
          <TabsContent value="overview">
            <Text className="text-sm text-muted-foreground">Overview content.</Text>
          </TabsContent>
          <TabsContent value="members">
            <Text className="text-sm text-muted-foreground">Members content.</Text>
          </TabsContent>
          <TabsContent value="activity">
            <Text className="text-sm text-muted-foreground">Activity content.</Text>
          </TabsContent>
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
              <Text className="text-sm text-muted-foreground">
                Some body text describing the action below.
              </Text>
            </CardContent>
            <CardFooter>
              <Button size="sm">Confirm</Button>
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
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
              <ModalDescription>
                On mobile this slides up as a bottom sheet; on md+ it appears centered.
              </ModalDescription>
            </ModalHeader>
            <Text className="text-sm text-muted-foreground">
              Body content goes here — any form, table, or description.
            </Text>
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
          <EmptyState
            icon={Inbox}
            title="No items yet"
            description="When items are created, they will appear here."
          />
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try a different search term."
            action={
              <Button size="sm" variant="outline">
                Clear filters
              </Button>
            }
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
    </>
  );
}
