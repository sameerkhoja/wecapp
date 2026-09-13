import React from "react";
import { View, Text, Pressable } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
export default function Scanner({
  onScan,
}: {
  onScan: (code: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  if (!permission) return <Text>Checking camera access…</Text>;
  if (!permission.granted)
    return (
      <View style={{ gap: 18 }}>
        <Text>
          Allow camera access to scan a guest’s booking pass. You can also enter
          their short confirmation code.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={requestPermission}
          style={{ padding: 18, backgroundColor: "#DC572E" }}
        >
          <Text style={{ color: "#FAF7F0", fontWeight: "700" }}>
            Allow camera
          </Text>
        </Pressable>
      </View>
    );
  return (
    <View style={{ height: 340, overflow: "hidden" }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => onScan(data)}
      />
    </View>
  );
}
