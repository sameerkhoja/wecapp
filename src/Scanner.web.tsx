import React from "react";
import { Text } from "react-native";
export default function Scanner({
  onScan,
}: {
  onScan: (code: string) => void;
}) {
  return (
    <Text>
      Use the Wecapp mobile app to scan a QR pass, or enter the guest’s short
      code.
    </Text>
  );
}
