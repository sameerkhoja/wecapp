import * as SecureStore from "expo-secure-store";
export async function readSession() {
  return SecureStore.getItemAsync("wecapp.session");
}
export async function writeSession(value: string | null) {
  if (value) await SecureStore.setItemAsync("wecapp.session", value);
  else await SecureStore.deleteItemAsync("wecapp.session");
}
