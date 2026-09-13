import Constants from "expo-constants";
const host = Constants.expoConfig?.hostUri?.split(":")[0] || "localhost";
export const apiBase = (
  process.env.EXPO_PUBLIC_WECAPP_API_URL || (__DEV__ ? `http://${host}:5174` : "https://wecapp.vercel.app")
).replace(/\/$/, "");
