export async function readSession() {
  return sessionStorage.getItem("wecapp.session");
}
export async function writeSession(value: string | null) {
  if (value) sessionStorage.setItem("wecapp.session", value);
  else sessionStorage.removeItem("wecapp.session");
}
