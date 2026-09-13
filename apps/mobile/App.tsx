import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Image,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
  useWindowDimensions,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Coffee,
  MapPin,
  Wifi,
  Plug,
  Heart,
  Check,
  ChevronDown,
  X,
  Clock,
  Volume2,
  ShieldCheck,
  CalendarDays,
  Search,
  SlidersHorizontal,
  Ticket,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Minus,
  Sun,
  Leaf,
  ExternalLink,
} from "lucide-react-native";
import { createClient } from "@supabase/supabase-js";
import Scanner from "../../src/Scanner";
import { api, setToken, loadToken, exportCSV } from "../../src/api";
import type {
  Venue,
  Slot,
  Booking,
  User,
  Config,
  AdminData,
  Template,
} from "../../src/types";
const C = {
  paper: "#FAF7F0",
  oat: "#EEE9DF",
  ink: "#171714",
  orange: "#DC572E",
  muted: "#6E6D65",
  line: "#D5D0C5",
  sage: "#536348",
};
const font = Platform.OS === "web" ? "DM Sans" : "System",
  display = Platform.OS === "web" ? "Space Grotesk" : "System";
const cash = (n: number) => `$${(n / 100).toFixed(n % 100 ? 2 : 0)}`;
const time = (s: string) =>
  new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
const dateLabel = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const dayPlus = (n: number) => {
  const d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const readable = (s: string) => s.replace(/_/g, " ");
function T({ children, style, ...p }: any) {
  return (
    <Text {...p} style={[s.text, style]}>
      {children}
    </Text>
  );
}
function Button({
  children,
  onPress,
  kind = "primary",
  disabled = false,
  icon: Icon,
  style,
}: any) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        s.button,
        kind === "primary"
          ? { backgroundColor: C.orange }
          : kind === "dark"
            ? { backgroundColor: C.ink }
            : kind === "outline"
              ? {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: C.line,
                }
              : { backgroundColor: C.oat },
        (pressed || hovered) && { opacity: 0.82 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <T
        style={{
          fontWeight: "700",
          color: ["primary", "dark"].includes(kind) ? C.paper : C.ink,
          fontSize: 13,
        }}
      >
        {children}
      </T>
      {Icon && (
        <Icon
          size={16}
          color={["primary", "dark"].includes(kind) ? C.paper : C.ink}
        />
      )}
    </Pressable>
  );
}
function Badge({ children, color = C.sage }: any) {
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <T style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, color }}>
        {children}
      </T>
    </View>
  );
}
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secureTextEntry = false,
}: any) {
  return (
    <View style={{ gap: 8, flex: 1 }}>
      <T style={s.label}>{label}</T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        style={[
          s.input,
          multiline && { height: 100, textAlignVertical: "top" },
        ]}
        autoCapitalize="none"
      />
    </View>
  );
}
function Sheet({ visible, title, onClose, children }: any) {
  if (!visible) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View
            style={[
              s.row,
              {
                justifyContent: "space-between",
                padding: 24,
                borderBottomWidth: 1,
                borderColor: C.line,
              },
            ]}
          >
            <T style={{ fontSize: 23, fontWeight: "700", fontFamily: display }}>
              {title}
            </T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              onPress={onClose}
              style={s.iconButton}
            >
              <X size={22} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 24, gap: 22 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function AppContent() {
  const { width } = useWindowDimensions(),
    wide = width >= 900;
  const [config, setConfig] = useState<Config | null>(null),
    [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("discover");
  const [venues, setVenues] = useState<Venue[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [ops, setOps] = useState<Venue[]>([]),
    [admin, setAdmin] = useState<AdminData | null>(null);
  const [date, setDate] = useState(today()),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All spaces"),
    [sort, setSort] = useState("Recommended"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [detail, setDetail] = useState<Venue | null>(null),
    [selected, setSelected] = useState<Slot | null>(null),
    [checkout, setCheckout] = useState(false),
    [agree, setAgree] = useState(false),
    [promo, setPromo] = useState(""),
    [pass, setPass] = useState<Booking | null>(null),
    [login, setLogin] = useState(false),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [application, setApplication] = useState(false),
    [cafeName, setCafeName] = useState(""),
    [cafeAddress, setCafeAddress] = useState(""),
    [cafeNeighborhood, setCafeNeighborhood] = useState("Mission District");
  const [datePicker, setDatePicker] = useState(false),
    [filters, setFilters] = useState(false),
    [menu, setMenu] = useState(false),
    [report, setReport] = useState<Booking | null>(null),
    [reason, setReason] = useState("Seat unavailable"),
    [notes, setNotes] = useState(""),
    [rating, setRating] = useState(5),
    [feedback, setFeedback] = useState<Booking | null>(null),
    [code, setCode] = useState(""),
    [opVenue, setOpVenue] = useState(""),
    [editSlot, setEditSlot] = useState<Slot | null>(null),
    [capacity, setCapacity] = useState("6"),
    [blackout, setBlackout] = useState(false),
    [editTemplate, setEditTemplate] = useState<Template | null>(null),
    [price, setPrice] = useState("9"),
    [credit, setCredit] = useState("5"),
    [editVenue, setEditVenue] = useState<Venue | null>(null),
    [description, setDescription] = useState(""),
    [policy, setPolicy] = useState(""),
    [info, setInfo] = useState("");
  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const [v, b, o, a] = await Promise.all([
      api<Venue[]>("/api/venues?date=" + date),
      user ? api<Booking[]>("/api/bookings") : Promise.resolve([]),
      user && user.role !== "customer"
        ? api<Venue[]>("/api/operator?date=" + date)
        : Promise.resolve([]),
      user?.role === "admin"
        ? api<AdminData>("/api/admin")
        : Promise.resolve(null),
    ]);
    if (generation !== refreshGeneration.current) return;
    setVenues(v);
    setBookings(b);
    setOps(o);
    setAdmin(a);
  }, [date, user]);
  useEffect(() => {
    (async () => {
      try {
        setConfig(await api<Config>("/api/config"));
        if (await loadToken()) {
          try {
            setUser(await api<User>("/api/me"));
          } catch {
            await setToken(null);
          }
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (detail) {
      const fresh = venues.find((v) => v.id === detail.id);
      if (fresh) {
        setDetail(fresh);
        setSelected(
          (old) =>
            fresh.slots.find((s) => s.id === old?.id) ||
            fresh.slots.find((s) => s.available > 0) ||
            null,
        );
      }
    }
  }, [venues]);
  useEffect(() => {
    if (pass) {
      const fresh = bookings.find((b) => b.id === pass.id);
      if (fresh) setPass(fresh);
    }
  }, [bookings]);
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => refresh().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [refresh, user]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const say = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 6500);
  };
  const navigate = (p: string) => {
    setPage(p);
    setMenu(false);
    setDetail(null);
  };
  const needUser = () => {
    if (user) return true;
    setLogin(true);
    return false;
  };
  async function demoLogin(role: string) {
    await run(async () => {
      const r = await api<{ token: string; user: User }>(
        "/api/auth/demo",
        "POST",
        { role },
      );
      await setToken(r.token);
      refreshGeneration.current++;
      setVenues([]);
      setUser(r.user);
      setLogin(false);
      setPage(role === "customer" ? "discover" : role);
    });
  }
  async function signIn() {
    await run(async () => {
      if (!config?.supabaseUrl || !config.supabaseKey)
        throw new Error(
          "Email sign-in requires Supabase configuration. Use the local demo to explore.",
        );
      const client = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: { persistSession: false },
      });
      if (sent) {
        const { data, error } = await client.auth.verifyOtp({
          email,
          token: otp,
          type: "email",
        });
        if (error) throw error;
        await setToken(data.session?.access_token || null);
        setUser(await api<User>("/api/me"));
        setLogin(false);
      } else {
        const { error } = await client.auth.signInWithOtp({ email });
        if (error) throw error;
        setSent(true);
        say("Check your email for your sign-in code.");
      }
    });
  }
  async function reserve() {
    if (!selected || !detail || !needUser()) return;
    await run(async () => {
      const b = await api<Booking>(
        "/api/bookings",
        "POST",
        {
          slotId: selected.id,
          acceptedPolicy: agree,
          promo: promo.trim() || undefined,
        },
        `web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      setCheckout(false);
      setPass(b);
      setDetail(null);
      setPage("bookings");
      await refresh();
      const r = await api<{ url?: string; booking?: Booking }>(
        "/api/bookings/" + b.id + "/checkout",
        "POST",
      );
      if (r.url) await Linking.openURL(r.url);
      if (r.booking) {
        setPass(r.booking);
        say("Your seat is reserved. See you at the café.");
      }
      await refresh();
    });
  }
  const save = (v: Venue) => {
    if (needUser())
      run(async () => {
        await api("/api/saved/" + v.id, "POST", { saved: !v.saved });
        await refresh();
      });
  };
  const openCafe = (v: Venue) => {
    setDetail(v);
    setSelected(v.slots.find((x) => x.available > 0) || null);
    setAgree(false);
    setPromo("");
  };
  const visible = venues
    .filter(
      (v) =>
        (page !== "saved" || v.saved) &&
        `${v.name} ${v.neighborhood} ${v.address}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter !== "Quiet spaces" || v.noise === "Quiet") &&
        (filter !== "Calls welcome" || !!v.calls) &&
        (filter !== "Step-free access" || !!v.accessible) &&
        (filter !== "Power at every seat" ||
          v.amenities.includes("Every seat")),
    )
    .sort((a, b) =>
      sort === "Lowest price"
        ? (a.slots[0]?.price || 0) - (b.slots[0]?.price || 0)
        : sort === "Nearest first"
          ? a.walk - b.walk
          : 0,
    );
  const currentOp = ops.find((v) => v.id === opVenue) || ops[0];
  const selectedDay =
    date === today()
      ? "Today"
      : date === dayPlus(1)
        ? "Tomorrow"
        : new Date(date + "T12:00Z").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
  const header = (
    <View style={[s.header, { paddingHorizontal: wide ? 48 : 20 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Wecapp home"
        onPress={() => navigate("discover")}
        style={s.row}
      >
        <View style={s.brandIcon}>
          <T
            style={{
              fontWeight: "900",
              fontSize: 25,
              color: C.paper,
              lineHeight: 28,
            }}
          >
            w
          </T>
        </View>
        <T style={s.logo}>
          wecapp<T style={{ color: C.orange }}>.</T>
        </T>
      </Pressable>
      {wide ? (
        <View style={[s.row, { gap: 32 }]}>
          {[
            ["discover", "FIND A SPACE"],
            ["bookings", "MY SESSIONS"],
            ["saved", "SAVED SPACES"],
          ].map(([p, label]) => (
            <Pressable
              key={p}
              accessibilityRole="button"
              onPress={() => navigate(p)}
            >
              <T style={[s.nav, page === p && { color: C.orange }]}>{label}</T>
            </Pressable>
          ))}
          {user?.role !== "customer" && user && (
            <Pressable onPress={() => navigate("operator")}>
              <T style={s.nav}>CAFÉ DASHBOARD</T>
            </Pressable>
          )}
          {user?.role === "admin" && (
            <Pressable onPress={() => navigate("admin")}>
              <T style={s.nav}>ADMIN</T>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          onPress={() => setMenu(!menu)}
          style={s.iconButton}
        >
          <Menu size={23} />
        </Pressable>
      )}
      {wide && (
        <Button
          kind="outline"
          onPress={() => (user ? setInfo("account") : setLogin(true))}
        >
          {user ? user.name.split(" ")[0] + " ↗" : "Sign in ↗"}
        </Button>
      )}
    </View>
  );
  const dateControl = (
    <Pressable
      accessibilityRole="button"
      onPress={() => setDatePicker(true)}
      style={s.searchCell}
    >
      <CalendarDays size={20} />
      <View style={{ flex: 1 }}>
        <T style={s.label}>WHEN</T>
        <T style={{ fontWeight: "600", marginTop: 4 }}>{selectedDay}</T>
      </View>
      <ChevronDown size={15} />
    </Pressable>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ flex: 1 }}>
        {header}
        {menu && (
          <View
            style={{
              padding: 20,
              gap: 10,
              borderBottomWidth: 1,
              borderColor: C.line,
            }}
          >
            {[
              "discover",
              "bookings",
              "saved",
              ...(user?.role !== "customer" && user ? ["operator"] : []),
              ...(user?.role === "admin" ? ["admin"] : []),
            ].map((p) => (
              <Button key={p} kind="ghost" onPress={() => navigate(p)}>
                {p === "discover"
                  ? "Find a space"
                  : p === "bookings"
                    ? "My sessions"
                    : readable(p)}
              </Button>
            ))}
            <Button
              onPress={() => {
                setMenu(false);
                user ? setInfo("account") : setLogin(true);
              }}
            >
              {user ? "My account" : "Sign in"}
            </Button>
          </View>
        )}
        <ScrollView
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        >
          {config?.demo && (
            <View style={s.demo}>
              <T style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>
                SHARED DEMO · SAMPLE DATA · NO REAL PAYMENTS
              </T>
            </View>
          )}
          {(page === "discover" || page === "saved") && !detail && (
            <>
              {page === "discover" && Platform.OS === "web" && (
                <View
                  style={[s.hero, { flexDirection: wide ? "row" : "column" }]}
                >
                  <View style={[s.heroCopy, { padding: wide ? 48 : 24 }]}>
                    <View style={s.row}>
                      <View style={s.dot} />
                      <T style={s.label}>GOOD WORK STARTS SOMEWHERE.</T>
                    </View>
                    <T
                      accessibilityRole="header"
                      style={[
                        s.headline,
                        {
                          fontSize: wide ? 76 : 48,
                          lineHeight: wide ? 77 : 50,
                        },
                      ]}
                    >
                      Your next{`\n`}good workday{`\n`}starts here
                      <T style={{ color: C.orange }}>.</T>
                    </T>
                    <T
                      style={{
                        fontSize: 16,
                        lineHeight: 26,
                        color: C.muted,
                        maxWidth: 365,
                      }}
                    >
                      A seat that’s yours. Coffee worth slowing down for. Find
                      your focus at an independent café.
                    </T>
                    <View
                      style={[
                        s.row,
                        { gap: 20, marginTop: 26, flexWrap: "wrap" },
                      ]}
                    >
                      <View style={s.row}>
                        <ShieldCheck size={15} color={C.sage} />
                        <T style={s.micro}>A real reserved seat</T>
                      </View>
                      <View style={s.row}>
                        <Coffee size={15} color={C.sage} />
                        <T style={s.micro}>A drink with every session</T>
                      </View>
                    </View>
                  </View>
                  <View style={[s.heroPhoto, { minHeight: wide ? 500 : 290 }]}>
                    <Image
                      accessibilityLabel="Warm neighborhood café with communal tables and natural light"
                      source={{
                        uri: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1500&q=90&sat=-100",
                      }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <View style={s.photoCaption}>
                      <T
                        style={{
                          color: C.paper,
                          fontSize: 10,
                          letterSpacing: 2,
                        }}
                      >
                        LESS SCROLLING. MORE SETTLING IN.
                      </T>
                      <ArrowUpRight color={C.paper} size={23} />
                    </View>
                    <View style={s.stamp}>
                      <Coffee size={28} color={C.paper} />
                      <T
                        style={{
                          color: C.paper,
                          fontWeight: "700",
                          fontSize: 11,
                          textAlign: "center",
                        }}
                      >
                        YOUR SEAT.{`\n`}YOUR PACE.
                      </T>
                    </View>
                  </View>
                </View>
              )}
              <View style={[s.section, { paddingHorizontal: wide ? 48 : 20 }]}>
                <View
                  style={[
                    s.searchBar,
                    { flexDirection: wide ? "row" : "column" },
                  ]}
                >
                  <View style={[s.searchCell, { flex: 1.5 }]}>
                    <MapPin size={21} />
                    <View style={{ flex: 1 }}>
                      <T style={s.label}>YOUR NEIGHBORHOOD</T>
                      <TextInput
                        accessibilityLabel="Search cafés or neighborhoods"
                        value={query}
                        onChangeText={setQuery}
                        placeholder="San Francisco, CA"
                        placeholderTextColor={C.ink}
                        style={{
                          fontFamily: font,
                          fontSize: 15,
                          paddingTop: 6,
                          paddingBottom: 2,
                          color: C.ink,
                        }}
                      />
                    </View>
                  </View>
                  {dateControl}
                  <View style={s.searchCell}>
                    <Clock size={20} />
                    <View>
                      <T style={s.label}>A LITTLE TIME FOR YOU</T>
                      <T style={{ fontWeight: "600", marginTop: 4 }}>
                        2-hour session
                      </T>
                    </View>
                  </View>
                  <Button
                    icon={ArrowRight}
                    onPress={() => run(refresh)}
                    style={{ minWidth: wide ? 168 : undefined, margin: 8 }}
                  >
                    Find my space
                  </Button>
                </View>
                <View
                  style={[
                    s.row,
                    {
                      justifyContent: "space-between",
                      marginTop: 40,
                      marginBottom: 24,
                      flexWrap: "wrap",
                    },
                  ]}
                >
                  <View>
                    <T style={s.label}>SAN FRANCISCO / THE NEIGHBORHOOD EDIT</T>
                    <T accessibilityRole="header" style={s.h2}>
                      {page === "saved"
                        ? "Your usual spots."
                        : "A change of scene."}
                    </T>
                  </View>
                  <T style={{ fontSize: 12, color: C.muted }}>
                    {visible.length} spaces to make your own
                  </T>
                </View>
                <View
                  style={[
                    s.row,
                    {
                      justifyContent: "space-between",
                      marginBottom: 26,
                      flexWrap: "wrap",
                    },
                  ]}
                >
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    {[
                      "All spaces",
                      "Quiet spaces",
                      "Power at every seat",
                      "Calls welcome",
                    ].map((f) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: filter === f }}
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[
                          s.chip,
                          filter === f && {
                            backgroundColor: C.ink,
                            borderColor: C.ink,
                          },
                        ]}
                      >
                        <T
                          style={{
                            fontSize: 12,
                            color: filter === f ? C.paper : C.ink,
                          }}
                        >
                          {f}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    kind="outline"
                    icon={SlidersHorizontal}
                    onPress={() => setFilters(true)}
                  >
                    Filters & sort
                  </Button>
                </View>
                {loading ? (
                  <ActivityIndicator color={C.orange} />
                ) : (
                  <View style={[s.grid, { gap: 24 }]}>
                    {visible.map((v, i) => (
                      <View
                        key={v.id}
                        style={{
                          width: wide
                            ? width >= 1200
                              ? "23.5%"
                              : "48%"
                            : "100%",
                          marginBottom: 12,
                        }}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`View ${v.name}`}
                          onPress={() => openCafe(v)}
                          style={s.cardImage}
                        >
                          <Image
                            source={{ uri: v.image }}
                            accessibilityLabel={`${v.name} café interior`}
                            style={StyleSheet.absoluteFillObject}
                          />
                          <View
                            style={{
                              position: "absolute",
                              top: 14,
                              left: 14,
                              backgroundColor: C.paper,
                              padding: 8,
                            }}
                          >
                            <T
                              style={{
                                fontSize: 9,
                                fontWeight: "700",
                                letterSpacing: 1,
                              }}
                            >
                              {v.slots.some((s) => s.available > 0) && !v.paused
                                ? "● SEATS AVAILABLE"
                                : "WAITLIST OPEN"}
                            </T>
                          </View>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${v.saved ? "Unsave" : "Save"} ${v.name}`}
                          onPress={() => save(v)}
                          style={[s.heart, { top: 12, right: 12 }]}
                        >
                          <Heart
                            size={19}
                            fill={v.saved ? C.orange : "transparent"}
                            color={v.saved ? C.orange : C.ink}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => openCafe(v)}
                          accessibilityRole="button"
                          style={{ paddingTop: 19 }}
                        >
                          <View
                            style={[s.row, { justifyContent: "space-between" }]}
                          >
                            <T style={s.cardTitle}>{v.name}</T>
                            <ArrowUpRight size={22} />
                          </View>
                          <T
                            style={{
                              fontSize: 12,
                              color: C.muted,
                              marginTop: 6,
                            }}
                          >
                            {v.neighborhood} · ~{v.walk} min walk*
                          </T>
                          <View
                            style={[
                              s.row,
                              { gap: 15, marginTop: 17, marginBottom: 20 },
                            ]}
                          >
                            <View style={s.row}>
                              <Wifi size={14} />
                              <T style={s.micro}>
                                {v.wifi > 0 ? "Fast Wi-Fi" : "Wi-Fi unverified"}
                              </T>
                            </View>
                            <View style={s.row}>
                              <Plug size={14} />
                              <T style={s.micro}>
                                {v.amenities.toLowerCase().includes("power")
                                  ? "Power"
                                  : "Ask about power"}
                              </T>
                            </View>
                            <View style={s.row}>
                              <Volume2 size={14} />
                              <T style={s.micro}>{v.noise}</T>
                            </View>
                          </View>
                          <View
                            style={[
                              s.row,
                              {
                                justifyContent: "space-between",
                                borderTopWidth: 1,
                                borderColor: C.line,
                                paddingTop: 15,
                              },
                            ]}
                          >
                            <T>
                              <T style={{ fontWeight: "700", fontSize: 20 }}>
                                {cash(
                                  v.slots[0]?.price || v.starting_price || 0,
                                )}
                              </T>
                              <T style={{ fontSize: 12, color: C.muted }}>
                                {" "}
                                / 2 hours
                              </T>
                            </T>
                            <T style={{ fontSize: 11, color: C.sage }}>
                              +{" "}
                              {cash(
                                v.slots[0]?.credit || v.starting_credit || 0,
                              )}{" "}
                              drink credit
                            </T>
                          </View>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {!visible.length && (
                  <View style={s.empty}>
                    <Coffee size={38} color={C.muted} />
                    <T style={s.h2}>
                      {page === "saved"
                        ? "Keep a good spot close."
                        : "No spaces match just yet."}
                    </T>
                    <T style={{ color: C.muted, textAlign: "center" }}>
                      {" "}
                      {page === "saved"
                        ? "Tap the heart on a café to save it for later."
                        : "Try another neighborhood or clear your filters."}
                    </T>
                    <Button
                      onPress={() => {
                        setQuery("");
                        setFilter("All spaces");
                        setPage("discover");
                      }}
                    >
                      Explore all spaces
                    </Button>
                  </View>
                )}
                <T style={{ fontSize: 10, color: C.muted, marginTop: 14 }}>
                  *Illustrative walking times from the Mission neighborhood
                  center. All session times are Pacific Time.
                </T>
              </View>
              {page === "discover" && Platform.OS === "web" && (
                <>
                  <View style={[s.how, { paddingHorizontal: wide ? 48 : 24 }]}>
                    <View style={{ flex: 1 }}>
                      <T style={s.label}>A SMALL CHANGE. A BETTER DAY.</T>
                      <T
                        style={[
                          s.h2,
                          { fontSize: wide ? 40 : 30, maxWidth: 340 },
                        ]}
                      >
                        Make yourself{`\n`}productive.
                      </T>
                    </View>
                    {[
                      [
                        Search,
                        "01",
                        "Find your kind of place",
                        "Quiet corner or a little café buzz. Choose what helps you focus.",
                      ],
                      [
                        Coffee,
                        "02",
                        "Book a seat. Get a coffee.",
                        "Pick your two-hour window. Your drink credit comes with it.",
                      ],
                      [
                        Sun,
                        "03",
                        "Arrive. Settle in. Do your thing.",
                        "Show your pass, grab your drink, and make the time yours.",
                      ],
                    ].map(([Icon, n, title, body]: any) => (
                      <View key={n} style={{ flex: 1, minWidth: 190, gap: 14 }}>
                        <View
                          style={[s.row, { justifyContent: "space-between" }]}
                        >
                          <Icon size={27} />
                          <T style={s.label}>{n}</T>
                        </View>
                        <T style={{ fontWeight: "700", fontSize: 17 }}>
                          {title}
                        </T>
                        <T
                          style={{
                            fontSize: 13,
                            color: C.muted,
                            lineHeight: 22,
                          }}
                        >
                          {body}
                        </T>
                      </View>
                    ))}
                  </View>
                  <View
                    style={[
                      s.partner,
                      {
                        margin: wide ? 48 : 20,
                        flexDirection: wide ? "row" : "column",
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 14 }}>
                      <T style={[s.label, { color: "#D5CFBE" }]}>
                        FOR THE NEIGHBORHOOD’S COFFEE PEOPLE
                      </T>
                      <T
                        style={{
                          fontSize: wide ? 38 : 30,
                          fontWeight: "700",
                          color: C.paper,
                          fontFamily: display,
                        }}
                      >
                        Your quiet hours.{`\n`}Someone’s best work.
                      </T>
                      <T style={{ color: "#C7C3B9", fontSize: 14 }}>
                        Turn a few open seats into a new reason to come back.
                      </T>
                    </View>
                    <Button
                      kind="primary"
                      icon={ArrowUpRight}
                      onPress={() => {
                        user && user.role !== "customer"
                          ? navigate("operator")
                          : setInfo("partner");
                      }}
                    >
                      Bring Wecapp to your café
                    </Button>
                  </View>
                </>
              )}
            </>
          )}
          {detail && (
            <View style={[s.section, { paddingHorizontal: wide ? 48 : 20 }]}>
              <Button
                kind="ghost"
                icon={ArrowLeft}
                style={{ alignSelf: "flex-start", marginBottom: 25 }}
                onPress={() => setDetail(null)}
              >
                Back to spaces
              </Button>
              <View
                style={[
                  s.row,
                  {
                    justifyContent: "space-between",
                    marginBottom: 24,
                    flexWrap: "wrap",
                  },
                ]}
              >
                <View>
                  <T style={s.label}>
                    {detail.neighborhood.toUpperCase()} / SAN FRANCISCO
                  </T>
                  <T style={[s.h2, { fontSize: wide ? 48 : 34 }]}>
                    {detail.name}
                  </T>
                  <T style={{ color: C.muted }}>{detail.address}</T>
                </View>
                <Button
                  kind="outline"
                  icon={Heart}
                  onPress={() => save(detail)}
                >
                  {venues.find((v) => v.id === detail.id)?.saved
                    ? "Saved"
                    : "Save café"}
                </Button>
              </View>
              <View style={{ flexDirection: wide ? "row" : "column", gap: 32 }}>
                <View style={{ flex: 1.6, gap: 24 }}>
                  <Image
                    source={{ uri: detail.image }}
                    style={{ width: "100%", height: wide ? 380 : 250 }}
                    accessibilityLabel={`${detail.name} interior`}
                  />
                  <T style={{ fontSize: 19, lineHeight: 30 }}>
                    {detail.description}
                  </T>
                  <View style={[s.row, { flexWrap: "wrap", gap: 12 }]}>
                    {detail.amenities.split(",").map((a) => (
                      <Badge key={a}>{a.toUpperCase()}</Badge>
                    ))}
                  </View>
                  <View style={s.ruleBox}>
                    <T style={s.h3}>Know before you go.</T>
                    <T style={{ lineHeight: 24, color: C.muted }}>
                      {detail.policy}
                    </T>
                    <T style={{ lineHeight: 24 }}>
                      Sound: {detail.noise} ·{" "}
                      {detail.calls
                        ? "Calls welcome at designated tables"
                        : "No calls"}{" "}
                      ·{" "}
                      {detail.accessible
                        ? "Step-free access"
                        : "Step-free access not available"}
                    </T>
                    <T style={s.micro}>
                      Operator-confirmed amenities · verified{" "}
                      {dateLabel(detail.verified_at)}
                    </T>
                  </View>
                  <Button
                    kind="outline"
                    icon={MapPin}
                    onPress={() =>
                      Linking.openURL(
                        "https://www.google.com/maps/search/?api=1&query=" +
                          encodeURIComponent(detail.address),
                      )
                    }
                  >
                    Get directions
                  </Button>
                </View>
                <View style={[s.bookingPanel, { flex: 1 }]}>
                  <T style={s.h3}>Find your window.</T>
                  {dateControl}
                  <T style={s.label}>2 HOURS · PACIFIC TIME · ONE SEAT</T>
                  <View style={[s.row, { flexWrap: "wrap" }]}>
                    {(
                      venues.find((v) => v.id === detail.id)?.slots ||
                      detail.slots
                    ).map((slot) => (
                      <Pressable
                        key={slot.id}
                        accessibilityRole="button"
                        onPress={() => setSelected(slot)}
                        style={[
                          s.slot,
                          selected?.id === slot.id && {
                            borderColor: C.orange,
                            backgroundColor: "#F7E4D9",
                          },
                        ]}
                      >
                        <T style={{ fontWeight: "700" }}>
                          {time(slot.start_at)}
                        </T>
                        <T
                          style={{ fontSize: 10, color: C.muted, marginTop: 5 }}
                        >
                          {slot.available > 0
                            ? `${slot.available} seats left`
                            : "Join waitlist"}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                  {!detail.slots.length && (
                    <T>No more sessions today. Choose another day.</T>
                  )}
                  {selected && (
                    <>
                      <View
                        style={[
                          s.row,
                          {
                            justifyContent: "space-between",
                            paddingVertical: 18,
                            borderTopWidth: 1,
                            borderColor: C.line,
                          },
                        ]}
                      >
                        <T style={{ fontSize: 30, fontWeight: "700" }}>
                          {cash(selected.price)}
                        </T>
                        <T style={{ fontSize: 12, color: C.sage }}>
                          {cash(selected.credit)} drink credit included
                        </T>
                      </View>
                      <Button
                        disabled={busy}
                        icon={ArrowRight}
                        onPress={() => {
                          if (!needUser()) return;
                          if (selected.available <= 0)
                            run(async () => {
                              const r = await api<{ message: string }>(
                                "/api/waitlist",
                                "POST",
                                { slotId: selected.id },
                              );
                              say(r.message);
                            });
                          else setCheckout(true);
                        }}
                      >
                        {selected.available > 0
                          ? "Reserve this seat"
                          : "Join waitlist"}
                      </Button>
                      <T
                        style={{
                          fontSize: 11,
                          lineHeight: 18,
                          color: C.muted,
                          textAlign: "center",
                        }}
                      >
                        Free cancellation up to 2 hours before your session.
                      </T>
                    </>
                  )}
                </View>
              </View>
            </View>
          )}
          {page === "bookings" && !detail && (
            <View style={[s.section, { paddingHorizontal: wide ? 48 : 20 }]}>
              <T style={s.label}>A LITTLE TIME, JUST FOR YOU</T>
              <T style={s.h2}>Your sessions.</T>
              {!user ? (
                <View style={s.empty}>
                  <Ticket size={40} />
                  <T>Sign in to see your reserved seats.</T>
                  <Button onPress={() => setLogin(true)}>Sign in</Button>
                </View>
              ) : !bookings.length ? (
                <View style={s.empty}>
                  <Coffee size={40} />
                  <T style={s.h3}>Your next good workday is waiting.</T>
                  <Button onPress={() => navigate("discover")}>
                    Find a space
                  </Button>
                </View>
              ) : (
                <View style={{ gap: 16, marginTop: 24 }}>
                  {bookings.map((b) => (
                    <View
                      key={b.id}
                      style={[
                        s.sessionCard,
                        { flexDirection: wide ? "row" : "column" },
                      ]}
                    >
                      <Image
                        source={{ uri: b.image }}
                        style={{ width: wide ? 170 : "100%", height: 140 }}
                      />
                      <View style={{ flex: 1, gap: 10 }}>
                        <Badge>{readable(b.status).toUpperCase()}</Badge>
                        <T style={s.h3}>{b.venue_name}</T>
                        <T>
                          {dateLabel(b.start_at)} · {time(b.start_at)} –{" "}
                          {time(b.end_at)} PT
                        </T>
                        <T style={{ color: C.muted, fontSize: 12 }}>
                          {cash(b.price)} · {cash(b.credit)} drink credit
                          included
                        </T>
                      </View>
                      <View style={{ gap: 8, justifyContent: "center" }}>
                        <Button kind="dark" onPress={() => setPass(b)}>
                          View booking pass
                        </Button>
                        {[
                          "cancelled",
                          "refunded",
                          "expired",
                          "completed",
                        ].includes(b.status) && (
                          <Button
                            kind="outline"
                            onPress={() => {
                              const v = venues.find((v) => v.id === b.venue_id);
                              if (v) openCafe(v);
                            }}
                          >
                            Book again
                          </Button>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
          {page === "operator" && !detail && (
            <View style={[s.section, { paddingHorizontal: wide ? 48 : 20 }]}>
              <View
                style={[
                  s.row,
                  { justifyContent: "space-between", flexWrap: "wrap" },
                ]}
              >
                <View>
                  <T style={s.label}>THE OTHER SIDE OF A GOOD WORKDAY</T>
                  <T accessibilityRole="header" style={s.h2}>
                    Behind the counter.
                  </T>
                </View>
                {dateControl}
              </View>
              {!currentOp ? (
                <View style={s.empty}>
                  <T>Sign in with an operator account to manage your cafés.</T>
                  <Button onPress={() => setLogin(true)}>Sign in</Button>
                </View>
              ) : (
                <>
                  <View
                    style={[s.row, { flexWrap: "wrap", marginVertical: 22 }]}
                  >
                    {ops.map((v) => (
                      <Button
                        key={v.id}
                        kind={currentOp.id === v.id ? "dark" : "outline"}
                        onPress={() => setOpVenue(v.id)}
                      >
                        {v.name}
                      </Button>
                    ))}
                  </View>
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", flexWrap: "wrap" },
                    ]}
                  >
                    <Badge>
                      {currentOp.paused
                        ? "INVENTORY PAUSED"
                        : "ACCEPTING RESERVATIONS"}
                    </Badge>
                    <Button
                      kind="outline"
                      onPress={() =>
                        run(async () => {
                          await api(
                            "/api/operator/venues/" + currentOp.id,
                            "PATCH",
                            { paused: !currentOp.paused },
                          );
                          await refresh();
                        })
                      }
                    >
                      {currentOp.paused
                        ? "Resume reservations"
                        : "Pause reservations"}
                    </Button>
                  </View>
                  <View style={s.stats}>
                    {[
                      ["Reservations", currentOp.arrivals.length],
                      [
                        "Checked in",
                        currentOp.arrivals.filter(
                          (b) => b.status === "checked_in",
                        ).length,
                      ],
                      [
                        "Estimated café gross",
                        cash(
                          currentOp.arrivals.reduce(
                            (n, b) => n + b.price - b.fee,
                            0,
                          ),
                        ),
                      ],
                    ].map(([label, value]) => (
                      <View key={label} style={s.stat}>
                        <T style={s.label}>{label}</T>
                        <T
                          style={{
                            fontSize: 38,
                            fontWeight: "700",
                            fontFamily: display,
                          }}
                        >
                          {value}
                        </T>
                      </View>
                    ))}
                  </View>
                  <T style={s.micro}>
                    Estimate before processing costs, refunds, and taxes.
                    Session date: {selectedDay}.
                  </T>
                  <View
                    style={[
                      s.row,
                      { alignItems: "flex-end", marginVertical: 24 },
                    ]}
                  >
                    <Field
                      label="CHECK IN A GUEST"
                      value={code}
                      onChangeText={setCode}
                      placeholder="Enter confirmation code or scanned QR token"
                    />
                    <Button
                      disabled={busy || !code}
                      onPress={() =>
                        run(async () => {
                          await api("/api/operator/check-in", "POST", { code });
                          setCode("");
                          say("Guest checked in.");
                          await refresh();
                        })
                      }
                    >
                      Check in
                    </Button>
                  </View>
                  {Platform.OS !== "web" && (
                    <Button kind="outline" onPress={() => setScanning(true)}>
                      Scan guest QR pass
                    </Button>
                  )}
                  <T style={s.h3}>Arrivals</T>
                  {currentOp.arrivals.length ? (
                    currentOp.arrivals.map((b) => (
                      <View key={b.id} style={s.tableRow}>
                        <View style={{ flex: 1 }}>
                          <T style={{ fontWeight: "700" }}>{b.customer}</T>
                          <T style={s.micro}>{b.code}</T>
                        </View>
                        <T>{time(b.start_at)}</T>
                        <Badge>{readable(b.status)}</Badge>
                      </View>
                    ))
                  ) : (
                    <View style={s.ruleBox}>
                      <T style={{ color: C.muted }}>
                        No arrivals for this day yet.
                      </T>
                    </View>
                  )}
                  <T style={[s.h3, { marginTop: 28 }]}>Today’s inventory</T>
                  {currentOp.slots.map((slot) => (
                    <View key={slot.id} style={s.tableRow}>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontWeight: "600" }}>
                          {time(slot.start_at)} – {time(slot.end_at)}
                        </T>
                        <T style={s.micro}>
                          {slot.reserved} / {slot.capacity} reserved ·{" "}
                          {slot.blackout ? "Blacked out" : cash(slot.price)}
                        </T>
                      </View>
                      <Button
                        kind="outline"
                        onPress={() => {
                          setEditSlot(slot);
                          setCapacity(String(slot.capacity));
                          setBlackout(!!slot.blackout);
                        }}
                      >
                        Adjust
                      </Button>
                    </View>
                  ))}
                  <View
                    style={[
                      s.row,
                      {
                        justifyContent: "space-between",
                        marginTop: 32,
                        flexWrap: "wrap",
                      },
                    ]}
                  >
                    <T style={s.h3}>Recurring session windows</T>
                    <Button
                      kind="outline"
                      onPress={() => {
                        setEditVenue(currentOp);
                        setDescription(currentOp.description);
                        setPolicy(currentOp.policy);
                      }}
                    >
                      Edit café & rules
                    </Button>
                  </View>
                  <T
                    style={{ color: C.muted, fontSize: 12, marginVertical: 12 }}
                  >
                    Changes apply to dates whose inventory has not been
                    generated yet. Use today’s inventory for existing sessions.
                  </T>
                  {currentOp.templates.map((t) => (
                    <View key={t.id} style={s.tableRow}>
                      <T style={{ flex: 1 }}>
                        {t.hour}:00 · 2 hours · {t.capacity} seats ·{" "}
                        {cash(t.price)}
                      </T>
                      <Button
                        kind="outline"
                        onPress={() => {
                          setEditTemplate(t);
                          setCapacity(String(t.capacity));
                          setPrice(String(t.price / 100));
                          setCredit(String(t.credit / 100));
                        }}
                      >
                        Edit window
                      </Button>
                    </View>
                  ))}
                  <Button
                    kind="dark"
                    style={{ alignSelf: "flex-start", marginTop: 24 }}
                    icon={ExternalLink}
                    onPress={() =>
                      run(async () => {
                        const r = await api<{ url: string }>(
                          "/api/operator/connect",
                          "POST",
                          { venueId: currentOp.id },
                        );
                        await Linking.openURL(r.url);
                      })
                    }
                  >
                    Set up café payouts
                  </Button>
                </>
              )}
            </View>
          )}
          {page === "admin" && !detail && (
            <View style={[s.section, { paddingHorizontal: wide ? 48 : 20 }]}>
              <T style={s.label}>KEEP EVERY SESSION DEPENDABLE</T>
              <T accessibilityRole="header" style={s.h2}>
                Marketplace desk.
              </T>
              {admin ? (
                <>
                  <View style={s.stats}>
                    {[
                      ["Cafés", admin.venues.length],
                      [
                        "Open cases",
                        admin.cases.filter((c) => c.status === "open").length,
                      ],
                      [
                        "Gross booking value",
                        cash(
                          admin.transactions
                            .filter((t) =>
                              ["confirmed", "checked_in", "completed"].includes(
                                t.status,
                              ),
                            )
                            .reduce((n, t) => n + t.price, 0),
                        ),
                      ],
                    ].map(([k, v]) => (
                      <View style={s.stat} key={k}>
                        <T style={s.label}>{k}</T>
                        <T style={{ fontSize: 36, fontWeight: "700" }}>{v}</T>
                      </View>
                    ))}
                  </View>
                  <T style={s.h3}>Support inbox</T>
                  {!admin.cases.length && (
                    <View style={s.ruleBox}>
                      <T>No support cases. A good kind of quiet.</T>
                    </View>
                  )}
                  {admin.cases.map((c) => (
                    <View key={c.id} style={s.ruleBox}>
                      <View
                        style={[s.row, { justifyContent: "space-between" }]}
                      >
                        <T style={s.h3}>{c.reason}</T>
                        <Badge>{readable(c.status)}</Badge>
                      </View>
                      <T>
                        {c.customer} · {c.venue_name}
                      </T>
                      <T style={{ color: C.muted }}>{c.notes}</T>
                      {c.status === "open" && (
                        <View style={s.row}>
                          <Button
                            onPress={() =>
                              run(async () => {
                                await api(
                                  "/api/admin/cases/" + c.id + "/resolve",
                                  "POST",
                                  { action: "refund" },
                                );
                                say("Refund requested and case updated.");
                                await refresh();
                              })
                            }
                          >
                            Refund booking
                          </Button>
                          <Button
                            kind="outline"
                            onPress={() =>
                              run(async () => {
                                await api(
                                  "/api/admin/cases/" + c.id + "/resolve",
                                  "POST",
                                  { action: "close" },
                                );
                                await refresh();
                              })
                            }
                          >
                            Close case
                          </Button>
                        </View>
                      )}
                    </View>
                  ))}
                  <T style={[s.h3, { marginTop: 30 }]}>Café approvals</T>
                  {admin.venues.map((v) => (
                    <View key={v.id} style={s.tableRow}>
                      <View style={{ flex: 1 }}>
                        <T style={{ fontWeight: "700" }}>{v.name}</T>
                        <T style={s.micro}>{v.status}</T>
                      </View>
                      <Button
                        kind="outline"
                        onPress={() =>
                          run(async () => {
                            await api("/api/admin/venues/" + v.id, "PATCH", {
                              status:
                                v.status === "approved"
                                  ? "suspended"
                                  : "approved",
                            });
                            await refresh();
                          })
                        }
                      >
                        {v.status === "approved" ? "Suspend" : "Approve"}
                      </Button>
                    </View>
                  ))}
                  <View
                    style={[
                      s.row,
                      { justifyContent: "space-between", marginVertical: 28 },
                    ]}
                  >
                    <T style={s.h3}>Transactions</T>
                    <Button
                      kind="dark"
                      onPress={() =>
                        run(async () => {
                          const csv = await exportCSV();
                          if (Platform.OS === "web") {
                            const url = URL.createObjectURL(
                              new Blob([csv], { type: "text/csv" }),
                            );
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = "wecapp-reconciliation.csv";
                            a.click();
                            URL.revokeObjectURL(url);
                          } else {
                            const { Share } = await import("react-native");
                            await Share.share({ message: csv });
                          }
                        })
                      }
                    >
                      Export CSV
                    </Button>
                  </View>
                  {admin.transactions.map((t) => (
                    <View key={t.id} style={s.tableRow}>
                      <View style={{ flex: 1 }}>
                        <T>{t.venue_name}</T>
                        <T style={s.micro}>
                          {t.customer} · {t.id.slice(0, 8)}
                        </T>
                      </View>
                      <T>{cash(t.price)}</T>
                      <Badge>{readable(t.status)}</Badge>
                    </View>
                  ))}
                  <T style={[s.h3, { marginTop: 30 }]}>Audit trail</T>
                  {admin.audit.slice(0, 20).map((a) => (
                    <View style={s.tableRow} key={a.id}>
                      <T style={{ flex: 1, fontSize: 12 }}>
                        {readable(a.action)}
                      </T>
                      <T style={s.micro}>
                        {dateLabel(a.created_at)} {time(a.created_at)}
                      </T>
                    </View>
                  ))}
                </>
              ) : (
                <Button onPress={() => setLogin(true)}>
                  Sign in as an administrator
                </Button>
              )}
            </View>
          )}
          {Platform.OS === "web" && (
            <View style={[s.footer, { paddingHorizontal: wide ? 48 : 20 }]}>
              <View>
                <T style={[s.logo, { fontSize: 26 }]}>wecapp.</T>
                <T style={{ fontSize: 11, color: C.muted, marginTop: 7 }}>
                  Good places. Better workdays.
                </T>
              </View>
              <View style={[s.row, { gap: 20, flexWrap: "wrap" }]}>
                {["How it works", "House rules", "Privacy"].map((label) => (
                  <Pressable
                    accessibilityRole="button"
                    key={label}
                    onPress={() => setInfo(label)}
                  >
                    <T style={{ fontSize: 11, color: C.muted }}>{label}</T>
                  </Pressable>
                ))}
              </View>
              <T style={{ fontSize: 10, color: C.muted }}>
                INDEPENDENT SPACES. SHARED POSSIBILITIES.
              </T>
            </View>
          )}
        </ScrollView>
        {Platform.OS !== "web" && (
          <View
            style={[
              s.row,
              {
                justifyContent: "space-around",
                borderTopWidth: 1,
                borderColor: C.line,
                backgroundColor: C.paper,
                paddingVertical: 10,
              },
            ]}
          >
            {[
              [Search, "discover", "Discover"],
              [Ticket, "bookings", "Sessions"],
              [Heart, "saved", "Saved"],
              [
                user?.role === "customer" || !user ? Coffee : LayoutDashboard,
                user?.role === "customer" || !user ? "account" : "operator",
                user?.role === "customer" || !user ? "Account" : "Café",
              ],
            ].map(([Icon, p, label]: any) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() =>
                  p === "account"
                    ? user
                      ? setInfo("account")
                      : setLogin(true)
                    : navigate(p)
                }
                style={{ alignItems: "center", gap: 5, padding: 8 }}
              >
                <Icon size={21} color={page === p ? C.orange : C.muted} />
                <T
                  style={{
                    fontSize: 10,
                    color: page === p ? C.orange : C.muted,
                  }}
                >
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
        )}
        {notice && (
          <View accessibilityLiveRegion="polite" style={s.toast}>
            <Check size={18} color={C.paper} />
            <T style={{ color: C.paper, flex: 1, fontSize: 13 }}>{notice}</T>
            <Pressable
              onPress={() => setNotice("")}
              accessibilityLabel="Dismiss notification"
            >
              <X size={18} color={C.paper} />
            </Pressable>
          </View>
        )}
        <Sheet
          visible={!!error}
          title="Let’s try that again."
          onClose={() => setError("")}
        >
          <T accessibilityRole="alert" style={{ lineHeight: 24 }}>
            {error}
          </T>
          <Button onPress={() => setError("")}>Got it</Button>
        </Sheet>
        <Sheet
          visible={login}
          title="A good day starts here."
          onClose={() => setLogin(false)}
        >
          <T style={{ color: C.muted, lineHeight: 24 }}>
            Sign in to save your favorite cafés and keep all your sessions in
            one place.
          </T>
          {config?.demo && (
            <View style={{ gap: 12 }}>
              <Badge>DEMO ACCOUNTS</Badge><T style={{fontSize:12,color:C.muted,lineHeight:20}}>This is a shared demonstration. Use fictional details only; other demo visitors can view test bookings and support cases.</T>
              <Button disabled={busy} onPress={() => demoLogin("customer")}>
                Explore as a customer
              </Button>
              <View style={s.row}>
                <Button
                  disabled={busy}
                  kind="outline"
                  style={{ flex: 1 }}
                  onPress={() => demoLogin("operator")}
                >
                  Café operator
                </Button>
                <Button
                  disabled={busy}
                  kind="outline"
                  style={{ flex: 1 }}
                  onPress={() => demoLogin("admin")}
                >
                  Support admin
                </Button>
              </View>
            </View>
          )}
          <Field
            label="EMAIL ADDRESS"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          {sent && (
            <Field
              label="EMAIL SIGN-IN CODE"
              value={otp}
              onChangeText={setOtp}
              placeholder="Enter your code"
            />
          )}
          <Button
            kind="dark"
            disabled={busy || !email.includes("@")}
            onPress={signIn}
          >
            {sent ? "Verify & sign in" : "Send sign-in code"}
          </Button>
        </Sheet>
        <Sheet
          visible={datePicker}
          title="Make a little time."
          onClose={() => setDatePicker(false)}
        >
          <T style={{ color: C.muted }}>
            Choose a day. All café times are in Pacific Time.
          </T>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            {Array.from({ length: 14 }, (_, n) => dayPlus(n)).map((d, n) => (
              <Button
                key={d}
                kind={date === d ? "dark" : "outline"}
                onPress={() => {
                  setDate(d);
                  setSelected(null);
                  setDatePicker(false);
                }}
              >
                {n === 0
                  ? "Today"
                  : n === 1
                    ? "Tomorrow"
                    : new Date(d + "T12:00Z").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
              </Button>
            ))}
          </View>
        </Sheet>
        <Sheet
          visible={filters}
          title="Find your kind of focus."
          onClose={() => setFilters(false)}
        >
          <T style={s.label}>WHAT MATTERS TO YOU</T>
          {[
            "All spaces",
            "Quiet spaces",
            "Power at every seat",
            "Calls welcome",
            "Step-free access",
          ].map((f) => (
            <Button
              key={f}
              kind={f === filter ? "dark" : "outline"}
              onPress={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
          <T style={s.label}>SORT SPACES</T>
          {["Recommended", "Lowest price", "Nearest first"].map((f) => (
            <Button
              key={f}
              kind={f === sort ? "dark" : "outline"}
              onPress={() => setSort(f)}
            >
              {f}
            </Button>
          ))}
          <Button onPress={() => setFilters(false)}>Show spaces</Button>
        </Sheet>
        <Sheet
          visible={checkout && !error && !login}
          title="Make it your seat."
          onClose={() => setCheckout(false)}
        >
          {detail && selected && (
            <>
              <T style={s.h3}>{detail.name}</T>
              <T>
                {dateLabel(selected.start_at)} · {time(selected.start_at)} –{" "}
                {time(selected.end_at)} PT
              </T>
              <View style={s.ruleBox}>
                <T>One reserved seat · 2 hours</T>
                <T>{cash(selected.credit)} drink credit included</T>
                <T style={{ color: C.muted, fontSize: 12, lineHeight: 20 }}>
                  {detail.policy}
                </T>
              </View>
              <Field
                label="PROMO CODE (OPTIONAL)"
                value={promo}
                onChangeText={setPromo}
                placeholder="Enter code"
              />
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <T style={s.h3}>Total before promo validation</T>
                <T style={s.h3}>{cash(selected.price)}</T>
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agree }}
                onPress={() => setAgree(!agree)}
                style={[s.row, { alignItems: "flex-start" }]}
              >
                <View style={[s.checkbox, agree && { backgroundColor: C.ink }]}>
                  {agree && <Check size={16} color={C.paper} />}
                </View>
                <T style={{ fontSize: 12, lineHeight: 21, flex: 1 }}>
                  I agree to the house rules and the 2-hour cancellation
                  deadline.
                </T>
              </Pressable>
              <Button
                disabled={!agree || busy}
                icon={ArrowRight}
                onPress={reserve}
              >
                {busy
                  ? "Reserving…"
                  : config?.demo && !config.payments
                    ? "Confirm demo reservation"
                    : "Continue to secure payment"}
              </Button>
              <T style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
                {config?.demo && !config.payments
                  ? "Demo checkout. No card needed and no money is charged."
                  : "Your seat is held for 30 minutes. Payment is confirmed by the payment provider."}
              </T>
            </>
          )}
        </Sheet>
        <Sheet
          visible={!!pass && !info && !error}
          title="Your little corner of the world."
          onClose={() => setPass(null)}
        >
          {pass && (
            <>
              <Badge>
                {readable(
                  bookings.find((b) => b.id === pass.id)?.status || pass.status,
                ).toUpperCase()}
              </Badge>
              <T
                style={{ fontSize: 30, fontWeight: "700", fontFamily: display }}
              >
                {pass.venue_name}
              </T>
              <T>
                {dateLabel(pass.start_at)} · {time(pass.start_at)} –{" "}
                {time(pass.end_at)} PT
              </T>
              {["confirmed", "checked_in"].includes(pass.status) && (
                <View
                  style={{
                    alignItems: "center",
                    padding: 15,
                    backgroundColor: "#FFF",
                    gap: 8,
                  }}
                >
                  <Image
                    source={{ uri: pass.qr }}
                    accessibilityLabel="Booking QR pass for café staff"
                    style={{ width: 220, height: 220 }}
                  />
                  <T
                    style={{
                      fontFamily: display,
                      fontSize: 24,
                      letterSpacing: 5,
                      fontWeight: "700",
                    }}
                  >
                    {pass.code}
                  </T>
                  <T style={s.micro}>
                    Show this pass to café staff when you arrive.
                  </T>
                </View>
              )}
              <T>{cash(pass.credit)} drink credit · Designated work seating</T>
              <T style={{ color: C.muted, lineHeight: 22 }}>{pass.address}</T>
              {pass.status === "checked_in" && (
                <T style={s.h3}>
                  {Math.max(
                    0,
                    Math.ceil((Date.parse(pass.end_at) - Date.now()) / 60000),
                  )}{" "}
                  minutes of your session left
                </T>
              )}
              <Button
                kind="dark"
                icon={MapPin}
                onPress={() =>
                  Linking.openURL(
                    "https://www.google.com/maps/search/?api=1&query=" +
                      encodeURIComponent(pass.address),
                  )
                }
              >
                Directions to your café
              </Button>
              {pass.status === "held" && (
                <Button
                  disabled={busy}
                  onPress={() =>
                    run(async () => {
                      const r = await api<{ url?: string; booking?: Booking }>(
                        "/api/bookings/" + pass.id + "/checkout",
                        "POST",
                      );
                      if (r.url) await Linking.openURL(r.url);
                      if (r.booking) setPass(r.booking);
                      await refresh();
                    })
                  }
                >
                  Finish checkout
                </Button>
              )}
              {["held", "confirmed"].includes(pass.status) && (
                <Button
                  kind="outline"
                  disabled={busy}
                  onPress={() => setInfo("cancel")}
                >
                  Cancel reservation
                </Button>
              )}
              <Button
                kind="outline"
                onPress={() => {
                  setReport(pass);
                  setPass(null);
                  setNotes("");
                }}
              >
                Report an issue
              </Button>
              {pass.status === "completed" && (
                <Button
                  kind="outline"
                  onPress={() => {
                    setFeedback(pass);
                    setPass(null);
                    setNotes("");
                  }}
                >
                  Leave feedback
                </Button>
              )}
              <T style={{ fontSize: 11, color: C.muted, lineHeight: 18 }}>
                {pass.policy}
              </T>
            </>
          )}
        </Sheet>
        <Sheet
          visible={!!report}
          title="Let’s make it right."
          onClose={() => setReport(null)}
        >
          <T>Tell us what happened at {report?.venue_name}.</T>
          <View style={[s.row, { flexWrap: "wrap" }]}>
            {[
              "Seat unavailable",
              "Café closed",
              "Missing drink credit",
              "Amenity issue",
              "Other",
            ].map((r) => (
              <Button
                kind={r === reason ? "dark" : "outline"}
                key={r}
                onPress={() => setReason(r)}
              >
                {r}
              </Button>
            ))}
          </View>
          <Field
            label="WHAT HAPPENED?"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Share a few details so we can help."
          />
          <Button
            disabled={busy || notes.trim().length < 5}
            onPress={() =>
              run(async () => {
                await api("/api/support", "POST", {
                  bookingId: report!.id,
                  reason,
                  notes,
                });
                setReport(null);
                say("Your issue has been sent to the support desk.");
                await refresh();
              })
            }
          >
            Send to support
          </Button>
        </Sheet>
        <Sheet
          visible={!!feedback}
          title="How was your workday?"
          onClose={() => setFeedback(null)}
        >
          <View style={s.row}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                kind={rating === n ? "dark" : "outline"}
                onPress={() => setRating(n)}
              >
                {n} ★
              </Button>
            ))}
          </View>
          <Field
            label="YOUR OBSERVATIONS"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <Button
            onPress={() =>
              run(async () => {
                await api("/api/feedback", "POST", {
                  bookingId: feedback!.id,
                  rating,
                  notes,
                });
                setFeedback(null);
                say("Thanks for helping make better workdays.");
              })
            }
          >
            Save feedback
          </Button>
        </Sheet>
        <Sheet
          visible={!!editSlot || !!editTemplate}
          title={editSlot ? "Adjust this session" : "Edit recurring window"}
          onClose={() => {
            setEditSlot(null);
            setEditTemplate(null);
          }}
        >
          <Field
            label="SEAT CAPACITY"
            value={capacity}
            onChangeText={setCapacity}
          />
          {editTemplate && (
            <>
              <Field
                label="SESSION PRICE (USD)"
                value={price}
                onChangeText={setPrice}
              />
              <Field
                label="DRINK CREDIT (USD)"
                value={credit}
                onChangeText={setCredit}
              />
            </>
          )}
          {editSlot && (
            <Button
              kind={blackout ? "dark" : "outline"}
              onPress={() => setBlackout(!blackout)}
            >
              {blackout
                ? "Blacked out — tap to reopen"
                : "Open — tap to black out"}
            </Button>
          )}
          <Button
            disabled={busy}
            onPress={() =>
              run(async () => {
                if (editSlot)
                  await api("/api/operator/slots/" + editSlot.id, "PATCH", {
                    capacity: Number(capacity),
                    blackout,
                  });
                else
                  await api(
                    "/api/operator/templates/" + editTemplate!.id,
                    "PATCH",
                    {
                      capacity: Number(capacity),
                      price: Math.round(Number(price) * 100),
                      credit: Math.round(Number(credit) * 100),
                    },
                  );
                setEditSlot(null);
                setEditTemplate(null);
                await refresh();
                say("Inventory updated.");
              })
            }
          >
            Save changes
          </Button>
        </Sheet>
        <Sheet
          visible={!!editVenue}
          title="Your café, your rules."
          onClose={() => setEditVenue(null)}
        >
          <Field
            label="CAFÉ DESCRIPTION"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          {editVenue && (
            <>
              <Field
                label="PHOTO URL (HTTPS)"
                value={editVenue.image}
                onChangeText={(image: string) =>
                  setEditVenue({ ...editVenue, image })
                }
              />
              <Field
                label="VERIFIED AMENITIES (COMMA SEPARATED)"
                value={editVenue.amenities}
                onChangeText={(amenities: string) =>
                  setEditVenue({ ...editVenue, amenities })
                }
              />
              <Field
                label="VERIFIED WI-FI SPEED (MBPS)"
                value={String(editVenue.wifi)}
                onChangeText={(wifi: string) =>
                  setEditVenue({ ...editVenue, wifi: Number(wifi) })
                }
              />
              <View style={[s.row, { flexWrap: "wrap" }]}>
                {["Quiet", "Low hum", "Lively"].map((noise) => (
                  <Button
                    key={noise}
                    kind={editVenue.noise === noise ? "dark" : "outline"}
                    onPress={() => setEditVenue({ ...editVenue, noise })}
                  >
                    {noise}
                  </Button>
                ))}
              </View>
              <Button
                kind="outline"
                onPress={() =>
                  setEditVenue({ ...editVenue, calls: editVenue.calls ? 0 : 1 })
                }
              >
                {editVenue.calls ? "Calls welcome" : "No calls"} — tap to change
              </Button>
              <Button
                kind="outline"
                onPress={() =>
                  setEditVenue({
                    ...editVenue,
                    accessible: editVenue.accessible ? 0 : 1,
                  })
                }
              >
                {editVenue.accessible
                  ? "Step-free access"
                  : "No step-free access"}{" "}
                — tap to change
              </Button>
            </>
          )}
          <Field
            label="HOUSE RULES"
            value={policy}
            onChangeText={setPolicy}
            multiline
          />
          <T style={s.micro}>
            Existing bookings retain the policy agreed to at purchase.
          </T>
          <Button
            disabled={busy}
            onPress={() =>
              run(async () => {
                await api("/api/operator/venues/" + editVenue!.id, "PATCH", {
                  description,
                  policy,
                  noise: editVenue!.noise,
                  calls: !!editVenue!.calls,
                  accessible: !!editVenue!.accessible,
                  ...(editVenue!.image ? { image: editVenue!.image } : {}),
                  amenities: editVenue!.amenities,
                  wifi: editVenue!.wifi,
                });
                setEditVenue(null);
                await refresh();
                say("Café profile updated.");
              })
            }
          >
            Save café profile
          </Button>
        </Sheet>
        <Sheet
          visible={scanning}
          title="Scan a booking pass."
          onClose={() => setScanning(false)}
        >
          <Scanner
            onScan={(value) => {
              setScanning(false);
              setCode(value);
              say("Pass scanned. Tap Check in to validate it.");
            }}
          />
        </Sheet>
        <Sheet
          visible={application}
          title="Bring your café to Wecapp."
          onClose={() => setApplication(false)}
        >
          <T style={{ color: C.muted, lineHeight: 23 }}>
            Start with a few protected seats during quieter hours. We’ll review
            your café before making it bookable.
          </T>
          <Field
            label="CAFÉ NAME"
            value={cafeName}
            onChangeText={setCafeName}
          />
          <Field
            label="STREET ADDRESS, CITY & STATE"
            value={cafeAddress}
            onChangeText={setCafeAddress}
          />
          <Field
            label="NEIGHBORHOOD"
            value={cafeNeighborhood}
            onChangeText={setCafeNeighborhood}
          />
          <Field
            label="TELL US ABOUT YOUR SPACE"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          <Button
            disabled={
              busy ||
              cafeName.length < 2 ||
              cafeAddress.length < 10 ||
              description.length < 20
            }
            onPress={() =>
              run(async () => {
                await api("/api/cafe-applications", "POST", {
                  name: cafeName,
                  address: cafeAddress,
                  neighborhood: cafeNeighborhood,
                  description,
                });
                setApplication(false);
                say(
                  "Application received. Your café is pending review by the marketplace team.",
                );
                await refresh();
              })
            }
          >
            Submit café for review
          </Button>
        </Sheet>
        <Sheet
          visible={!!info}
          title={
            info === "account"
              ? "Your Wecapp."
              : info === "partner"
                ? "A place for good work."
                : info === "cancel"
                  ? "Cancel this reservation?"
                  : info
          }
          onClose={() => setInfo("")}
        >
          {info === "account" ? (
            <>
              <T style={s.h3}>{user?.name}</T>
              <T>{user?.email}</T>
              <Badge>{user?.role}</Badge>
              <Button
                kind="outline"
                onPress={() =>
                  run(async () => {
                    await api("/api/auth/logout", "POST");
                    await setToken(null);
                    setUser(null);
                    setBookings([]);
                    setOps([]);
                    setAdmin(null);
                    setPass(null);
                    setPage("discover");
                    setInfo("");
                  })
                }
              >
                Sign out
              </Button>
              {config?.demo && (
                <Button
                  onPress={() => {
                    setInfo("");
                    setLogin(true);
                  }}
                >
                  Switch demo role
                </Button>
              )}
            </>
          ) : info === "cancel" ? (
            <>
              <T style={{ lineHeight: 25 }}>
                Your seat will be released. Confirmed sessions are eligible for
                a full refund until 2 hours before arrival. This action cannot
                be undone.
              </T>
              <Button
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    const b = await api<Booking>(
                      "/api/bookings/" + pass!.id + "/cancel",
                      "POST",
                    );
                    setPass(b);
                    setInfo("");
                    await refresh();
                    say("Reservation updated.");
                  })
                }
              >
                Confirm cancellation
              </Button>
            </>
          ) : info === "partner" ? (
            <>
              <T style={{ lineHeight: 26 }}>
                Wecapp lets you offer a protected number of seats for two-hour
                work sessions. You choose the inventory, drink credit, and house
                rules. Guests arrive with a paid booking pass.
              </T>
              <T style={{ lineHeight: 24, color: C.muted }}>
                The initial pilot uses assisted café onboarding. Explore the
                operator dashboard to configure session windows, pause
                inventory, check in guests, and review earnings.
              </T>
              <Button
                onPress={() => {
                  setInfo("");
                  if (needUser()) {
                    setDescription("");
                    setApplication(true);
                  }
                }}
              >
                Apply with your café
              </Button>
              {config?.demo && (
                <Button
                  kind="outline"
                  onPress={() => {
                    setInfo("");
                    setLogin(true);
                  }}
                >
                  Explore demo café dashboard
                </Button>
              )}
            </>
          ) : (
            <T style={{ lineHeight: 27, color: C.muted }}>
              {info === "Privacy"
                ? "Wecapp stores account information, bookings, saved cafés, and support records to provide the service. Card details are handled by hosted Stripe checkout and are never stored here. Search text stays on your device. In this local demo, data is stored in the project database. Production retention, account deletion, and privacy contact details must be configured before launch."
                : info === "House rules"
                  ? "Reserve one seat for the time shown. Respect the café’s noise and call policy, use headphones, and leave on time. Your booking includes the displayed drink credit. Free cancellation is available until two hours before arrival. If the café cannot honor your seat or drink credit, report an issue from your booking pass."
                  : "Find a café that fits your workday, choose a two-hour session, and reserve your seat. Show your booking pass when you arrive and redeem your drink credit. Every café controls its own workspace availability and house rules."}
            </T>
          )}
        </Sheet>
      </View>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  text: { fontFamily: font, color: C.ink, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 9 },
  header: {
    height: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
  },
  logo: {
    fontFamily: display,
    fontSize: 31,
    fontWeight: "700",
    letterSpacing: -1.5,
  },
  brandIcon: {
    backgroundColor: C.orange,
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    marginRight: 2,
  },
  nav: { fontSize: 10, letterSpacing: 1.1, fontWeight: "700" },
  button: {
    minHeight: 44,
    paddingHorizontal: 19,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  demo: {
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: "#F2EEE5",
  },
  hero: { backgroundColor: C.oat, minHeight: 500 },
  heroCopy: { flex: 1.03, justifyContent: "center" },
  heroPhoto: { flex: 1, overflow: "hidden", backgroundColor: "#BCB5A5" },
  headline: {
    fontFamily: display,
    fontWeight: "700",
    letterSpacing: -3.6,
    marginTop: 24,
    marginBottom: 26,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },
  label: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    color: C.muted,
  },
  micro: { fontSize: 11, color: C.muted },
  photoCaption: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,.55)",
    padding: 23,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stamp: {
    position: "absolute",
    right: 24,
    top: 24,
    width: 96,
    height: 96,
    backgroundColor: C.orange,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    transform: [{ rotate: "10deg" }],
  },
  section: {
    paddingVertical: 36,
    maxWidth: 1500,
    width: "100%",
    alignSelf: "center",
  },
  searchBar: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.paper,
    minHeight: 91,
  },
  searchCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 19,
    minWidth: 170,
  },
  h2: {
    fontFamily: display,
    fontWeight: "700",
    fontSize: 34,
    letterSpacing: -1.3,
    marginTop: 10,
  },
  h3: {
    fontFamily: display,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 24,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cardImage: { height: 245, overflow: "hidden", backgroundColor: C.oat },
  heart: {
    position: "absolute",
    width: 44,
    height: 44,
    backgroundColor: C.paper,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: display,
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  how: {
    paddingVertical: 42,
    backgroundColor: C.oat,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 36,
  },
  partner: {
    backgroundColor: C.ink,
    padding: 38,
    gap: 30,
    alignItems: "center",
    justifyContent: "space-between",
  },
  footer: {
    paddingVertical: 30,
    borderTopWidth: 1,
    borderColor: C.line,
    gap: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  badge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  bookingPanel: {
    backgroundColor: C.oat,
    padding: 24,
    gap: 20,
    alignSelf: "flex-start",
    width: "100%",
  },
  slot: { borderWidth: 1, borderColor: "#BBB5A8", padding: 14, minWidth: 115 },
  ruleBox: {
    padding: 24,
    borderWidth: 1,
    borderColor: C.line,
    gap: 14,
    marginVertical: 10,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 20 },
  sessionCard: { borderWidth: 1, borderColor: C.line, padding: 18, gap: 24 },
  stats: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    marginVertical: 22,
  },
  stat: {
    backgroundColor: C.oat,
    padding: 24,
    flex: 1,
    minWidth: 190,
    gap: 15,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: C.line,
    gap: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,15,12,.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 550,
    maxHeight: "92%",
    backgroundColor: C.paper,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 40,
    elevation: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    minHeight: 48,
    fontFamily: font,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.paper,
  },
  checkbox: {
    width: 23,
    height: 23,
    borderWidth: 1,
    borderColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    maxWidth: 560,
    alignSelf: "center",
    backgroundColor: C.ink,
    padding: 18,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
});
