import "react-native-gesture-handler/jestSetup";
import { configure } from "@testing-library/react-native";

// findBy*/waitFor default to 1s. Under a full parallel run the CPU-bound render
// of a data screen can take longer (same cause as testTimeout in jest.config.js),
// which made student-engagement-notes flake; the work is slow, not hung.
configure({ asyncUtilTimeout: 5000 });
