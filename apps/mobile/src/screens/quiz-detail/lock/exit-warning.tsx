import { TriangleAlert } from "lucide-react-native";
import { View } from "react-native";

import { iconWithClassName } from "../../../design/lib/icon";
import {
  Button,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "../../../design/ui";

iconWithClassName(TriangleAlert);

/** Never a count: how many exits are left is the server's, and saying it would invite using them. */
const EXIT_WARNING_TITLE = "You left the quiz";
const EXIT_WARNING_BODY = "Leaving the quiz isn't allowed and has been recorded. Leaving again may end your attempt.";

/** Shown on return from each exit the server didn't end the attempt on. One way out: back to the quiz. */
export function ExitWarning({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <ModalContent dismissible={false}>
        <ModalHeader className="pr-0">
          <View className="flex-row items-center gap-2">
            <TriangleAlert size={20} className="text-bad" accessibilityElementsHidden importantForAccessibility="no" />
            <ModalTitle className="flex-1">{EXIT_WARNING_TITLE}</ModalTitle>
          </View>
          <ModalDescription>{EXIT_WARNING_BODY}</ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <Button onPress={onClose}>Back to the quiz</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
