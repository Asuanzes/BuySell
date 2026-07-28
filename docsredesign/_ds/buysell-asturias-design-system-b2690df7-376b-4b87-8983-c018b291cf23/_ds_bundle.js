/* @ds-bundle: {"format":3,"namespace":"BuySellAsturiasDesignSystem_b2690d","components":[{"name":"IconHorreo","sourcePath":"assets/brand-icons.tsx"},{"name":"IconHouseMark","sourcePath":"assets/brand-icons.tsx"},{"name":"IconPicos","sourcePath":"assets/brand-icons.tsx"},{"name":"IconChevron","sourcePath":"assets/brand-icons.tsx"},{"name":"IconTag","sourcePath":"assets/brand-icons.tsx"},{"name":"IconKey","sourcePath":"assets/brand-icons.tsx"},{"name":"IconPin","sourcePath":"assets/brand-icons.tsx"},{"name":"IconPortfolio","sourcePath":"assets/brand-icons.tsx"},{"name":"IconExchange","sourcePath":"assets/brand-icons.tsx"},{"name":"IconFoco","sourcePath":"assets/brand-icons.tsx"},{"name":"IconAscenso","sourcePath":"assets/brand-icons.tsx"},{"name":"IconPliegue","sourcePath":"assets/brand-icons.tsx"},{"name":"IconPortico","sourcePath":"assets/brand-icons.tsx"},{"name":"IconCruce","sourcePath":"assets/brand-icons.tsx"},{"name":"BRAND_ICONS","sourcePath":"assets/brand-icons.tsx"},{"name":"InmueblesAndroidScreen","sourcePath":"screens/tsx/mobile-android-inmuebles.tsx"},{"name":"InmueblesIOSScreen","sourcePath":"screens/tsx/mobile-ios-inmuebles.tsx"},{"name":"Sidebar","sourcePath":"screens/tsx/web-inmuebles.tsx"},{"name":"InmueblesPage","sourcePath":"screens/tsx/web-inmuebles.tsx"},{"name":"MobileAndroidInmuebles","sourcePath":"uploads/mobile-android-inmuebles.tsx"},{"name":"MobileIosInmuebles","sourcePath":"uploads/mobile-ios-inmuebles.tsx"},{"name":"WebInmuebles","sourcePath":"uploads/web-inmuebles.tsx"}],"sourceHashes":{"artifacts/lucide-shim.jsx":"6d0e3ef29ad4","artifacts/shell.jsx":"36c37572843a","assets/brand-icons.tsx":"b47480ffdd13","screens/design-canvas.jsx":"3b0e985041dd","screens/tsx/mobile-android-inmuebles.tsx":"aa50844ae600","screens/tsx/mobile-ios-inmuebles.tsx":"793206255893","screens/tsx/web-inmuebles.tsx":"9f606c3bdc60","ui_kits/web/components.jsx":"86837ec53b5c","ui_kits/web/screens.jsx":"8f3694628f62","uploads/mobile-android-inmuebles.tsx":"55b99538d133","uploads/mobile-ios-inmuebles.tsx":"e432bfc6e719","uploads/web-inmuebles.tsx":"2a39751059fb"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.BuySellAsturiasDesignSystem_b2690d = window.BuySellAsturiasDesignSystem_b2690d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// artifacts/lucide-shim.jsx
try { (() => {
/* Lucide-react shim — defines all icons used by the 3 BuySell artifacts as
   global React components. Load BEFORE any Babel script that references them.
   Each icon follows Lucide's API: { size, color, strokeWidth, ...svgProps }. */

const _I = paths => {
  const C = ({
    size = 24,
    color = "currentColor",
    strokeWidth = 2,
    ...rest
  }) => React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    ...rest
  }, ...paths.map((p, i) => typeof p === "string" ? React.createElement("path", {
    key: i,
    d: p
  }) : React.createElement(p.t || "path", {
    key: i,
    ...p
  })));
  C.displayName = "LucideIcon";
  return C;
};
const _c = (cx, cy, r) => ({
  t: "circle",
  cx,
  cy,
  r
});
const _r = (x, y, w, h, rx) => ({
  t: "rect",
  x,
  y,
  width: w,
  height: h,
  rx
});
const _l = (x1, y1, x2, y2) => ({
  t: "line",
  x1,
  y1,
  x2,
  y2
});
const _p = points => ({
  t: "polyline",
  points
});
Object.assign(window, {
  Building2: _I(["M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z", "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2", "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2", "M10 6h4", "M10 10h4", "M10 14h4", "M10 18h4"]),
  Search: _I([_c(11, 11, 8), "M21 21l-4.3-4.3"]),
  Sparkles: _I(["M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z", "M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z"]),
  LayoutDashboard: _I([_r(3, 3, 7, 9, 1), _r(14, 3, 7, 5, 1), _r(14, 12, 7, 9, 1), _r(3, 16, 7, 5, 1)]),
  Activity: _I(["M22 12h-4l-3 9L9 3l-3 9H2"]),
  Download: _I(["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", _p("7 10 12 15 17 10"), _l(12, 15, 12, 3)]),
  User: _I(["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", _c(12, 7, 4)]),
  Settings: _I([_c(12, 12, 3), "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"]),
  LogOut: _I(["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", _p("16 17 21 12 16 7"), _l(21, 12, 9, 12)]),
  ChevronDown: _I([_p("6 9 12 15 18 9")]),
  ChevronRight: _I([_p("9 18 15 12 9 6")]),
  Plus: _I([_l(12, 5, 12, 19), _l(5, 12, 19, 12)]),
  BedDouble: _I(["M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8", "M4 11V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5", _l(2, 20, 2, 17), _l(22, 20, 22, 17), _l(12, 12, 12, 4)]),
  Bath: _I(["M9 6 6.5 3.5", "M4 22v-3a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v3", _l(2, 15, 22, 15), "M20 15v-2a2 2 0 0 0-2-2H6", "M6 11V9a2 2 0 0 1 2-2"]),
  Maximize2: _I([_p("15 3 21 3 21 9"), _p("9 21 3 21 3 15"), _l(21, 3, 14, 10), _l(3, 21, 10, 14)]),
  Layers: _I(["M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.84Z", "M22 12.65l-8.58 3.9a2 2 0 0 1-1.66 0L2 12.65", "M22 17.65l-8.58 3.9a2 2 0 0 1-1.66 0L2 17.65"]),
  Filter: _I([{
    t: "polygon",
    points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
  }]),
  ArrowUpDown: _I(["M11 17l-4 4-4-4", "M7 21V9", "M21 7l-4-4-4 4", "M17 3v12"]),
  Wifi: _I(["M5 12.55a11 11 0 0 1 14.08 0", "M1.42 9a16 16 0 0 1 21.16 0", "M8.53 16.11a6 6 0 0 1 6.95 0", _l(12, 20, 12.01, 20)]),
  Signal: _I([_l(2, 20, 2, 16), _l(7, 20, 7, 13), _l(12, 20, 12, 9), _l(17, 20, 17, 5), _l(22, 20, 22, 2)]),
  Battery: _I([_r(1, 6, 18, 12, 2), _l(23, 13, 23, 11)]),
  BatteryFull: _I([_r(1, 6, 18, 12, 2), _l(23, 13, 23, 11), _r(4, 9, 12, 6, 0)]),
  Bell: _I(["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"]),
  Moon: _I(["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"]),
  Sun: _I([_c(12, 12, 5), _l(12, 1, 12, 3), _l(12, 21, 12, 23), _l(4.22, 4.22, 5.64, 5.64), _l(18.36, 18.36, 19.78, 19.78), _l(1, 12, 3, 12), _l(21, 12, 23, 12), _l(4.22, 19.78, 5.64, 18.36), _l(18.36, 5.64, 19.78, 4.22)]),
  ChevronLeft: _I([_p("15 18 9 12 15 6")]),
  MapPin: _I(["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", _c(12, 10, 3)]),
  Calendar: _I([_r(3, 4, 18, 18, 2), _l(16, 2, 16, 6), _l(8, 2, 8, 6), _l(3, 10, 21, 10)]),
  ExternalLink: _I(["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", _p("15 3 21 3 21 9"), _l(10, 14, 21, 3)]),
  ArrowUp: _I([_l(12, 19, 12, 5), _p("5 12 12 5 19 12")]),
  ArrowDown: _I([_l(12, 5, 12, 19), _p("19 12 12 19 5 12")]),
  Minus: _I([_l(5, 12, 19, 12)]),
  Pencil: _I(["M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"]),
  Share: _I([_c(18, 5, 3), _c(6, 12, 3), _c(18, 19, 3), _l(8.59, 13.51, 15.42, 17.49), _l(15.41, 6.51, 8.59, 10.49)]),
  Tag: _I(["M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42Z", _c(7.5, 7.5, 1)]),
  Flame: _I(["M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14 0-5.5 3-7 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.5-2.5 1.5-3.5L8 12c.37.5.5 1 .5 1.5l0 1z"]),
  Car: _I(["M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2", _c(6.5, 16.5, 2.5), _c(16.5, 16.5, 2.5)]),
  Ruler: _I(["M21.17 8.04l-5.21-5.21a2 2 0 0 0-2.83 0L2.29 13.67a2 2 0 0 0 0 2.83l5.21 5.21a2 2 0 0 0 2.83 0L21.17 10.87a2 2 0 0 0 0-2.83z", _l(7.04, 13.13, 10.17, 10)]),
  Home: _I(["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", _p("9 22 9 12 15 12 15 22")]),
  Zap: _I([{
    t: "polygon",
    points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2"
  }]),
  SquareArrowOutUpRight: _I(["M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6", _l(21, 3, 9, 15), _p("15 3 21 3 21 9")])
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "artifacts/lucide-shim.jsx", error: String((e && e.message) || e) }); }

// artifacts/shell.jsx
try { (() => {
/* BuySell shared shell — sidebar (web), rail (mobile), chrome, tokens, helpers.
   Load after lucide-shim.jsx and before any screen script.
   Supports light/dark mode via toggle in sidebar footer / rail footer. */

// ---- Theme tokens ----
const LIGHT = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  textInverse: "#FAFAF7",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  accent: "#C49A4D",
  successFg: "#2D6A4F",
  successBg: "#E8F1EC",
  warningFg: "#A86A17",
  warningBg: "#F7EFDE",
  dangerFg: "#A23E3E",
  dangerBg: "#F6E5E5",
  infoFg: "#2C7A8A",
  infoBg: "#E1EEF1",
  priceDownBg: "#F0F7F2",
  priceDownFg: "#2D6A4F",
  priceUpBg: "#FDF2F2",
  priceUpFg: "#A23E3E",
  shadow: "0 1px 2px rgba(20,20,18,0.04)",
  _isDark: false
};
const DARK = {
  bg: "#141413",
  surface: "#1E1E1C",
  surfaceMuted: "#272725",
  surfaceSunken: "#111110",
  border: "#333330",
  borderStrong: "#444440",
  text: "#E8E6E0",
  textMuted: "#9A9690",
  textSubtle: "#6B6862",
  textInverse: "#1A1A18",
  primary: "#6A9FD0",
  primaryHover: "#82B2DE",
  primarySoft: "#1A2A3A",
  primaryFg: "#E8E6E0",
  accent: "#D4AA5D",
  successFg: "#5CB88A",
  successBg: "#1A2D22",
  warningFg: "#D4992A",
  warningBg: "#2A2210",
  dangerFg: "#D06868",
  dangerBg: "#2A1818",
  infoFg: "#5AAABB",
  infoBg: "#182428",
  priceDownBg: "#1A2D22",
  priceDownFg: "#5CB88A",
  priceUpBg: "#2A1818",
  priceUpFg: "#D06868",
  shadow: "0 1px 2px rgba(0,0,0,0.2)",
  _isDark: true
};

// T is a mutable global — screens reference T.primary etc inline.
// When theme toggles, we Object.assign into T and dispatch an event to re-render.
const T = {
  ...LIGHT
};
function _setTheme(mode) {
  Object.assign(T, mode === "dark" ? DARK : LIGHT);
  window.dispatchEvent(new Event("themechange"));
}
function _toggleTheme() {
  _setTheme(T._isDark ? "light" : "dark");
}

// Hook — call at top of any shell to re-render children when theme changes
function useThemeListener() {
  const [, set] = React.useState(0);
  React.useEffect(() => {
    const h = () => set(n => n + 1);
    window.addEventListener("themechange", h);
    return () => window.removeEventListener("themechange", h);
  }, []);
}
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const TAB = {
  fontVariantNumeric: "tabular-nums"
};
const fmtEur = n => `${n.toLocaleString("es-ES")} €`;
function BrandKey({
  size = 20,
  color = "currentColor"
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12",
    r: "3.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "8",
    r: "0.85",
    fill: T.accent,
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.8 12 H17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 H21 V17 H20 V15.5 H18.5 V17 H17 Z",
    fill: T.accent
  }));
}

// ---- Theme toggle button ----
function ThemeToggle({
  size = 14
}) {
  const isDark = T._isDark;
  return /*#__PURE__*/React.createElement("button", {
    onClick: _toggleTheme,
    title: isDark ? "Modo claro" : "Modo oscuro",
    style: {
      display: "flex",
      width: "100%",
      alignItems: "center",
      gap: 10,
      padding: "6px 10px",
      borderRadius: 6,
      background: "transparent",
      color: T.textMuted,
      fontSize: 13,
      border: "none",
      cursor: "pointer",
      fontFamily: FONT,
      textAlign: "left"
    }
  }, isDark ? /*#__PURE__*/React.createElement(Sun, {
    size: size,
    color: T.textSubtle
  }) : /*#__PURE__*/React.createElement(Moon, {
    size: size,
    color: T.textSubtle
  }), size >= 14 && (isDark ? "Modo claro" : "Modo oscuro"));
}
function ThemeToggleMini() {
  const isDark = T._isDark;
  return /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      _toggleTheme();
    },
    title: isDark ? "Modo claro" : "Modo oscuro",
    style: {
      width: 52,
      padding: "8px 0 6px",
      borderRadius: 10,
      textDecoration: "none",
      textAlign: "center",
      display: "block"
    }
  }, isDark ? /*#__PURE__*/React.createElement(Sun, {
    size: 18,
    color: T.textSubtle
  }) : /*#__PURE__*/React.createElement(Moon, {
    size: 18,
    color: T.textSubtle
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      marginTop: 3,
      color: T.textSubtle,
      fontFamily: FONT
    }
  }, isDark ? "Claro" : "Oscuro"));
}

// ---- Nav model ----
const navGroups = [{
  id: "catalogo",
  label: "Catálogo",
  accent: "#3A5F8A",
  accentDark: "#6A9FD0",
  items: [{
    id: "inmuebles",
    label: "Inmuebles",
    Icon: Building2
  }, {
    id: "duplicados",
    label: "Duplicados",
    Icon: Sparkles,
    count: 3
  }]
}, {
  id: "analisis",
  label: "Análisis",
  accent: "#2C7A8A",
  accentDark: "#5AAABB",
  items: [{
    id: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard
  }, {
    id: "actividad",
    label: "Actividad",
    Icon: Activity
  }]
}, {
  id: "captura",
  label: "Captura",
  accent: "#A86A17",
  accentDark: "#D4992A",
  items: [{
    id: "importar",
    label: "Importar",
    Icon: Download
  }]
}];
const footerItems = [{
  id: "perfil",
  label: "Perfil",
  Icon: User
}, {
  id: "ajustes",
  label: "Ajustes",
  Icon: Settings
}];

// ---- WEB SIDEBAR ----
function WebSidebar({
  active
}) {
  useThemeListener();
  const [open, setOpen] = React.useState({
    catalogo: true,
    analisis: true,
    captura: true
  });
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${T.border}`,
      background: T.surface,
      fontFamily: FONT
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: `1px solid ${T.border}`,
      padding: "0 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.primarySoft,
      color: T.primary,
      boxShadow: `inset 0 0 0 1px ${T._isDark ? "rgba(106,159,208,0.2)" : "rgba(58,95,138,0.15)"}`
    }
  }, /*#__PURE__*/React.createElement(BrandKey, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: T.text
    }
  }, "BuySell"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textSubtle
    }
  }, "Asturias"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "12px 8px"
    }
  }, navGroups.map(g => {
    const gAccent = T._isDark ? g.accentDark : g.accent;
    return /*#__PURE__*/React.createElement("div", {
      key: g.id,
      style: {
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(o => ({
        ...o,
        [g.id]: !o[g.id]
      })),
      style: {
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        marginLeft: -2,
        borderLeft: `2px solid ${gAccent}`,
        background: "transparent",
        border: "none",
        borderLeftStyle: "solid",
        borderLeftWidth: 2,
        borderLeftColor: gAccent,
        fontSize: 10,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: T.textSubtle,
        cursor: "pointer",
        fontFamily: FONT
      }
    }, /*#__PURE__*/React.createElement("span", null, g.label), /*#__PURE__*/React.createElement(ChevronDown, {
      size: 11,
      color: T.textSubtle,
      style: {
        transform: open[g.id] ? "none" : "rotate(-90deg)",
        transition: "transform 150ms"
      }
    })), open[g.id] && g.items.map(it => {
      const isActive = active === it.id;
      return /*#__PURE__*/React.createElement("button", {
        key: it.id,
        style: {
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          marginTop: 1,
          borderRadius: 6,
          background: isActive ? T.primarySoft : "transparent",
          color: isActive ? T.primary : T.textMuted,
          fontWeight: isActive ? 500 : 400,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
          fontFamily: FONT,
          textAlign: "left"
        }
      }, /*#__PURE__*/React.createElement(it.Icon, {
        size: 15,
        color: isActive ? T.primary : T.textSubtle
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          flex: 1
        }
      }, it.label), it.count != null && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          fontWeight: 500,
          padding: "0 6px",
          borderRadius: 4,
          background: isActive ? T._isDark ? "rgba(106,159,208,0.15)" : "rgba(58,95,138,0.1)" : T.surfaceMuted,
          color: isActive ? T.primary : T.textMuted,
          ...TAB
        }
      }, it.count));
    }));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${T.border}`,
      padding: 8
    }
  }, footerItems.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    style: {
      display: "flex",
      width: "100%",
      alignItems: "center",
      gap: 10,
      padding: "6px 10px",
      borderRadius: 6,
      background: "transparent",
      color: T.textMuted,
      fontSize: 13,
      border: "none",
      cursor: "pointer",
      fontFamily: FONT,
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement(it.Icon, {
    size: 15,
    color: T.textSubtle
  }), it.label)), /*#__PURE__*/React.createElement(ThemeToggle, null)));
}
function WebTopbar() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      borderBottom: `1px solid ${T.border}`,
      background: T.surface,
      padding: "0 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      maxWidth: 448
    }
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    color: T.textSubtle,
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)"
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "search",
    placeholder: "Buscar inmuebles, direcciones, refs\u2026",
    style: {
      height: 36,
      width: "100%",
      paddingLeft: 32,
      paddingRight: 48,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.bg,
      color: T.text,
      fontSize: 13,
      fontFamily: FONT,
      outline: "none"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 8,
      top: "50%",
      transform: "translateY(-50%)",
      padding: "1px 5px",
      borderRadius: 3,
      border: `1px solid ${T.border}`,
      background: T.surface,
      fontSize: 10,
      color: T.textSubtle,
      fontFamily: "monospace"
    }
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 36,
      padding: "0 14px",
      borderRadius: 6,
      border: "none",
      background: T.primary,
      color: T.primaryFg,
      fontSize: 13,
      fontWeight: 500,
      cursor: "pointer",
      fontFamily: FONT,
      display: "flex",
      alignItems: "center",
      gap: 6,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 14
  }), " Nuevo inmueble"));
}
function WebShell({
  active,
  children
}) {
  useThemeListener();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "100%",
      background: T.bg,
      fontFamily: FONT,
      color: T.text
    }
  }, /*#__PURE__*/React.createElement(WebSidebar, {
    active: active
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(WebTopbar, null), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      overflowY: "auto",
      padding: "24px 24px 40px"
    }
  }, children)));
}

// ---- MOBILE RAIL ----
const railItemsByGroup = [{
  label: "Inmuebles",
  icon: Building2,
  id: "inmuebles"
}, {
  label: "Duplic.",
  icon: Sparkles,
  id: "duplicados",
  badge: 3
}, {
  sep: true
}, {
  label: "Dashboard",
  icon: LayoutDashboard,
  id: "dashboard"
}, {
  label: "Actividad",
  icon: Activity,
  id: "actividad"
}, {
  sep: true
}, {
  label: "Importar",
  icon: Download,
  id: "importar"
}];
const railFooterItems = [{
  label: "Perfil",
  icon: User
}, {
  label: "Ajustes",
  icon: Settings
}];
function MobileRail({
  active
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 64,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${T.border}`,
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderBottom: `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.primarySoft,
      color: T.primary
    }
  }, /*#__PURE__*/React.createElement(BrandKey, {
    size: 18
  }))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2,
      paddingTop: 8
    }
  }, railItemsByGroup.map((it, i) => {
    if (it.sep) return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        width: 32,
        height: 1,
        background: T.border,
        margin: "6px 0"
      }
    });
    const Icon = it.icon;
    const isActive = active === it.id;
    return /*#__PURE__*/React.createElement("a", {
      key: it.id,
      href: "#",
      style: {
        width: 52,
        padding: "8px 0 6px",
        borderRadius: 10,
        textDecoration: "none",
        textAlign: "center",
        background: isActive ? T.primarySoft : "transparent",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 20,
      color: isActive ? T.primary : T.textMuted
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        marginTop: 3,
        color: isActive ? T.primary : T.textSubtle,
        fontWeight: isActive ? 600 : 400,
        fontFamily: FONT
      }
    }, it.label), it.badge > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: 4,
        right: 6,
        minWidth: 14,
        height: 14,
        padding: "0 4px",
        borderRadius: 999,
        background: T.dangerFg,
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: "14px",
        textAlign: "center",
        ...TAB
      }
    }, it.badge));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${T.border}`,
      padding: "8px 0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 2
    }
  }, railFooterItems.map(it => {
    const Icon = it.icon;
    return /*#__PURE__*/React.createElement("a", {
      key: it.label,
      href: "#",
      style: {
        width: 52,
        padding: "8px 0 6px",
        borderRadius: 10,
        textDecoration: "none",
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 18,
      color: T.textSubtle
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        marginTop: 3,
        color: T.textSubtle,
        fontFamily: FONT
      }
    }, it.label));
  }), /*#__PURE__*/React.createElement(ThemeToggleMini, null)));
}
function AndroidBar() {
  const c = T._isDark ? T.text : T.text;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 28,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      fontSize: 12,
      fontWeight: 600,
      color: c,
      background: T.surface,
      fontFamily: FONT
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: TAB
  }, "9:30"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Signal, {
    size: 12,
    color: c
  }), /*#__PURE__*/React.createElement(Wifi, {
    size: 12,
    color: c
  }), /*#__PURE__*/React.createElement(Battery, {
    size: 14,
    color: c
  })));
}
function AndroidGesture() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 112,
      height: 4,
      borderRadius: 999,
      background: T._isDark ? "#666" : `${T.text}cc`
    }
  }));
}
function IOSBar() {
  const c = T.text;
  // Dynamic Island stays dark even in dark mode (it's a physical black cutout)
  const diColor = T._isDark ? "#000000" : T.text;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      height: 47,
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: 28,
      top: "50%",
      transform: "translateY(-50%)",
      fontSize: 15,
      fontWeight: 600,
      color: c,
      fontFamily: FONT,
      ...TAB
    }
  }, "9:41"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      left: "50%",
      top: 11,
      width: 110,
      height: 31,
      borderRadius: 999,
      background: diColor,
      transform: "translateX(-50%)"
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      right: 24,
      top: "50%",
      transform: "translateY(-50%)",
      display: "flex",
      alignItems: "center",
      gap: 5
    }
  }, /*#__PURE__*/React.createElement(Signal, {
    size: 14,
    color: c
  }), /*#__PURE__*/React.createElement(Wifi, {
    size: 14,
    color: c
  }), /*#__PURE__*/React.createElement(Battery, {
    size: 16,
    color: c
  })));
}
function IOSHome() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 34,
      display: "flex",
      alignItems: "end",
      justifyContent: "center",
      paddingBottom: 8,
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 134,
      height: 5,
      borderRadius: 999,
      background: T._isDark ? "#666" : T.text
    }
  }));
}
function MobileShell({
  platform,
  active,
  header,
  children
}) {
  useThemeListener();
  const isIOS = platform === "ios";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 393,
      height: 852,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: T.bg,
      fontFamily: FONT,
      color: T.text,
      borderRadius: isIOS ? 40 : 28,
      boxShadow: T._isDark ? "0 0 0 1px rgba(255,255,255,0.06)" : "0 0 0 1px rgba(0,0,0,0.08)"
    }
  }, isIOS ? /*#__PURE__*/React.createElement(IOSBar, null) : /*#__PURE__*/React.createElement(AndroidBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement(MobileRail, {
    active: active
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0
    }
  }, header, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: "auto"
    }
  }, children))), isIOS ? /*#__PURE__*/React.createElement(IOSHome, null) : /*#__PURE__*/React.createElement(AndroidGesture, null));
}

// ---- Shared UI ----
function SCard({
  title,
  right,
  children,
  noPad
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: T.shadow,
      overflow: "hidden"
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: T.text,
      fontFamily: FONT
    }
  }, title), right), /*#__PURE__*/React.createElement("div", {
    style: noPad ? {} : {
      padding: 16
    }
  }, children));
}
function SBadge({
  label,
  bg,
  fg
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 7px",
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 500,
      background: bg,
      color: fg,
      border: `1px solid ${fg}22`
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: "currentColor",
      opacity: 0.7
    }
  }), label);
}
function SStat({
  label,
  value,
  hint
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: T.shadow,
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: T.textSubtle
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "-0.015em",
      color: T.text,
      ...TAB
    }
  }, value), hint && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      color: T.textMuted
    }
  }, hint));
}

// Export everything
Object.assign(window, {
  T,
  LIGHT,
  DARK,
  FONT,
  TAB,
  fmtEur,
  BrandKey,
  _toggleTheme,
  _setTheme,
  useThemeListener,
  ThemeToggle,
  ThemeToggleMini,
  WebShell,
  MobileShell,
  SCard,
  SBadge,
  SStat,
  navGroups,
  footerItems
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "artifacts/shell.jsx", error: String((e && e.message) || e) }); }

// assets/brand-icons.tsx
try { (() => {
/**
 * A. Hórreo — granero típico asturiano sobre pegollos.
 * Distintivo regional, geométrico, lectura clara incluso a 16px.
 */
function IconHorreo({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 9.5 L12 3 L20.5 9.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 9.5 V15 H19 V9.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 16.5 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 17 V21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 17 V21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 17 V21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M18 17 V21"
  }));
}

/**
 * B. Casa con dos vanos — silueta de inmueble residencial,
 * universal, sobria. La más "neutral" del conjunto.
 */
function IconHouseMark({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 11 L12 3.5 L21 11"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 10.5 V20 H19 V10.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.5 20 V14 H13.5 V20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 14 H8.5"
  }));
}

/**
 * C. Picos — tres cumbres (alusión a Picos de Europa) con un
 * pequeño tejado destacado en el centro. Identidad de paisaje + vivienda.
 */
function IconPicos({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 19 L7 11 L10.5 15 L14 8 L18 13 L22 19"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M2 19 H22"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 19 V15.5 L11.5 13.5 L14 15.5 V19",
    fill: "currentColor",
    fillOpacity: "0.12"
  }));
}

/**
 * D. Chevron / monograma — tejado abstracto que insinúa una "B".
 * Lo más minimalista y "logo SaaS"; menos local pero muy escalable.
 */
function IconChevron({
  size = 24,
  className,
  strokeWidth = 1.8
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 13 L12 5 L20 13"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 11.5 V20 H17 V11.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 20 V15 H14"
  }));
}

/**
 * E. Etiqueta de precio — clásico inmobiliario / e-commerce.
 * Sobrio, reconocible, fácil de leer a cualquier tamaño.
 */
function IconTag({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12.5 L11.5 4 H20 V12.5 L11.5 21 Z"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15.5",
    cy: "8.5",
    r: "1.4",
    fill: "currentColor"
  }));
}

/**
 * F. Llave medieval — anillo con finial superior, núcleo decorativo y
 * paletón escalonado con muesca. Sugerencia a llave de hierro forjado
 * sin caer en lo decorativo recargado.
 */
function IconKey({
  size = 24,
  className,
  strokeWidth = 1.5
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12",
    r: "3.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "8",
    r: "0.85",
    fill: "var(--brand-accent)",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.8 12 H17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 H21 V17 H20 V15.5 H18.5 V17 H17 Z",
    fill: "var(--brand-accent)"
  }));
}

/**
 * G. Pin + tejado — ubicación con un pequeño tejado dentro.
 * Une "inmueble" + "mapa" en un solo gesto.
 */
function IconPin({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 21.5 C7 16 4.5 12.5 4.5 9 a7.5 7.5 0 0 1 15 0 C19.5 12.5 17 16 12 21.5 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 10 L12 7 L15.5 10 V13 H8.5 Z"
  }));
}

/**
 * H. Portfolio — dos casas solapadas, sugiere "cartera de inmuebles".
 * Buen ajuste para una app de gestión multi-propiedad.
 */
function IconPortfolio({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M11 9 L16 4.5 L21 9 V14 H17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 4.5 V8",
    opacity: "0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 13 L10 7 L17 13 V20 H3 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 20 V15 H12 V20"
  }));
}

/**
 * I. Compraventa — dos chevrons opuestos formando un rombo.
 * Abstrae el flujo "buy / sell" sin recurrir a una casa.
 */
function IconExchange({
  size = 24,
  className,
  strokeWidth = 1.8
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M4 10 L12 3 L20 10"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 14 L12 21 L20 14"
  }));
}

/**
 * J. Foco — tres rombos concéntricos con un punto central.
 * Identidad: precisión, observación, "encontrar lo correcto".
 * Lectura abstracta: target / diafragma / huella.
 */
function IconFoco({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M12 2 L22 12 L12 22 L2 12 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7 L17 12 L12 17 L7 12 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11 L13 12 L12 13 L11 12 Z",
    fill: "currentColor",
    stroke: "none"
  }));
}

/**
 * K. Ascenso — tres peldaños en diagonal.
 * Identidad: progresión, escalera, "subir de nivel".
 * Pura geometría, sin nada figurativo.
 */
function IconAscenso({
  size = 24,
  className,
  strokeWidth = 1.8
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 20 H8 V15 H13 V10 H18 V5 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 20 H21",
    opacity: "0.35"
  }));
}

/**
 * L. Pliegue — rombo con un pliegue vertical, mitad sombreada.
 * Identidad: facetas, perspectivas, "dos caras de algo".
 * Origami minimalista; muy memorable a tamaño pequeño.
 */
function IconPliegue({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 12 L12 3 L12 21 Z",
    fill: "currentColor",
    fillOpacity: "0.14",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3 L21 12 L12 21 L3 12 Z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3 V21"
  }));
}

/**
 * M. Pórtico — arco sobre dos columnas.
 * Identidad: umbral, entrada, arquitectura.
 * Sugerencia sutil a "edificación" sin dibujar una casa.
 */
function IconPortico({
  size = 24,
  className,
  strokeWidth = 1.7
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M3 20 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 20 V12 a6 6 0 0 1 12 0 V20"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 13 H18",
    opacity: "0.45"
  }));
}

/**
 * N. Cruce — cuadrado y rombo (mismo cuadrado a 45º) superpuestos.
 * Identidad: encuentro, dos partes que se cruzan, intercambio.
 * Forma de "estrella ortogonal" muy reconocible y propia.
 */
function IconCruce({
  size = 24,
  className,
  strokeWidth = 1.6
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: className,
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "2"
  }), /*#__PURE__*/React.createElement("g", {
    transform: "rotate(45 12 12)"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "6",
    y: "6",
    width: "12",
    height: "12",
    rx: "2"
  })));
}
const BRAND_ICONS = {
  horreo: {
    component: IconHorreo,
    label: "Hórreo",
    note: "Asturiano, distintivo regional"
  },
  house: {
    component: IconHouseMark,
    label: "Casa",
    note: "Universal, neutral inmobiliario"
  },
  picos: {
    component: IconPicos,
    label: "Picos",
    note: "Paisaje + vivienda"
  },
  chevron: {
    component: IconChevron,
    label: "Chevron",
    note: "Minimalista SaaS"
  },
  tag: {
    component: IconTag,
    label: "Etiqueta",
    note: "Clásico inmobiliario / e-commerce"
  },
  key: {
    component: IconKey,
    label: "Llave medieval",
    note: "Forja: finial, anillo decorado, paletón con muesca"
  },
  pin: {
    component: IconPin,
    label: "Ubicación",
    note: "Pin con tejado dentro"
  },
  portfolio: {
    component: IconPortfolio,
    label: "Cartera",
    note: "Dos casas: gestión multi-inmueble"
  },
  exchange: {
    component: IconExchange,
    label: "Compraventa",
    note: "Dos chevrons: flujo buy/sell"
  },
  foco: {
    component: IconFoco,
    label: "Foco",
    note: "Rombos concéntricos: precisión, observación"
  },
  ascenso: {
    component: IconAscenso,
    label: "Ascenso",
    note: "Escalera diagonal: progresión, subir de nivel"
  },
  pliegue: {
    component: IconPliegue,
    label: "Pliegue",
    note: "Origami: dos caras, perspectivas"
  },
  portico: {
    component: IconPortico,
    label: "Pórtico",
    note: "Arco arquitectónico: umbral, entrada"
  },
  cruce: {
    component: IconCruce,
    label: "Cruce",
    note: "Cuadrado + rombo: encuentro, intercambio"
  }
};
Object.assign(__ds_scope, { IconHorreo, IconHouseMark, IconPicos, IconChevron, IconTag, IconKey, IconPin, IconPortfolio, IconExchange, IconFoco, IconAscenso, IconPliegue, IconPortico, IconCruce, BRAND_ICONS });
})(); } catch (e) { __ds_ns.__errors.push({ path: "assets/brand-icons.tsx", error: String((e && e.message) || e) }); }

// screens/design-canvas.jsx
try { (() => {
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "screens/design-canvas.jsx", error: String((e && e.message) || e) }); }

// screens/tsx/mobile-android-inmuebles.tsx
try { (() => {
// ──────────────────────────────────────────────────────────────────────────
// screens/tsx/mobile-android-inmuebles.tsx
// Design spec for BuySell mobile — Android — Inmuebles screen.
// Stack: Expo Router + React Native + lucide-react-native + expo-status-bar +
// react-native-safe-area-context.
//
// Dependencies to install (likely missing from apps/mobile):
//   npm install lucide-react-native expo-status-bar react-native-safe-area-context
//
// Drop into apps/mobile/app/(tabs)/index.tsx OR create a new screen at
// apps/mobile/app/inmuebles.tsx and wire the Drawer/Sidebar in _layout.tsx.
// ──────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────
// Tokens — mirrors the web's colors_and_type.css. In a real refactor,
// extract to apps/mobile/constants/tokens.ts and import everywhere.
// ──────────────────────────────────────────────────────────────────────────
const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  brass: "#C49A4D",
  success: "#2D6A4F",
  successSoft: "#E8F1EC",
  warning: "#A86A17",
  warningSoft: "#F7EFDE",
  danger: "#A23E3E",
  dangerSoft: "#F6E5E5",
  info: "#2C7A8A",
  infoSoft: "#E1EEF1",
  priceUpBg: "#FDF2F2",
  priceUpFg: "#A23E3E",
  priceDownBg: "#F0F7F2",
  priceDownFg: "#2D6A4F"
};

// ──────────────────────────────────────────────────────────────────────────
// Nav model — same structure as web. Each group has an accent used on a 2px
// left bar of the ACTIVE item in the rail.
// ──────────────────────────────────────────────────────────────────────────

const RAIL_GROUPS = [{
  id: "catalogo",
  accent: "#3A5F8A",
  items: [{
    id: "inmuebles",
    label: "Inmuebles",
    Icon: Building2
  }, {
    id: "duplicados",
    label: "Duplicados",
    Icon: Sparkles,
    count: 3
  }]
}, {
  id: "analisis",
  accent: "#2C7A8A",
  items: [{
    id: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard
  }, {
    id: "actividad",
    label: "Actividad",
    Icon: Activity
  }]
}, {
  id: "captura",
  accent: "#A86A17",
  items: [{
    id: "importar",
    label: "Importar",
    Icon: Download
  }]
}];
const RAIL_FOOTER = [{
  id: "perfil",
  label: "Perfil",
  Icon: User
}, {
  id: "ajustes",
  label: "Ajustes",
  Icon: Settings
}];

// ──────────────────────────────────────────────────────────────────────────
// Brand mark
// ──────────────────────────────────────────────────────────────────────────
function BrandBadge() {
  return /*#__PURE__*/React.createElement(View, {
    style: s.brandBadge
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.brandGlyph
  }, "\u26BF"));
}

// ──────────────────────────────────────────────────────────────────────────
// 56px-wide icon rail. Group separators are 1px hairlines.
// Active item: primary-soft background + 2px left bar in the group accent.
// ──────────────────────────────────────────────────────────────────────────
function Rail({
  current,
  onChange
}) {
  return /*#__PURE__*/React.createElement(View, {
    style: s.rail
  }, /*#__PURE__*/React.createElement(View, {
    style: s.brandSlot
  }, /*#__PURE__*/React.createElement(BrandBadge, null)), /*#__PURE__*/React.createElement(ScrollView, {
    showsVerticalScrollIndicator: false,
    contentContainerStyle: {
      paddingVertical: 8
    }
  }, RAIL_GROUPS.map((g, gi) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: g.id
  }, gi > 0 && /*#__PURE__*/React.createElement(View, {
    style: s.railDivider
  }), g.items.map(it => {
    const active = current === it.id;
    return /*#__PURE__*/React.createElement(Pressable, {
      key: it.id,
      onPress: () => onChange(it.id),
      accessibilityRole: "button",
      accessibilityLabel: it.label,
      style: [s.railItem, active && s.railItemActive]
    }, active && /*#__PURE__*/React.createElement(View, {
      style: [s.railActiveBar, {
        backgroundColor: g.accent
      }]
    }), /*#__PURE__*/React.createElement(it.Icon, {
      size: 18,
      color: active ? T.primary : T.textMuted,
      strokeWidth: 2
    }), it.count != null && /*#__PURE__*/React.createElement(View, {
      style: s.railBadge
    }, /*#__PURE__*/React.createElement(Text, {
      style: s.railBadgeText
    }, it.count)));
  })))), /*#__PURE__*/React.createElement(View, {
    style: s.railFooter
  }, RAIL_FOOTER.map(it => /*#__PURE__*/React.createElement(Pressable, {
    key: it.id,
    accessibilityRole: "button",
    accessibilityLabel: it.label,
    style: s.railItem
  }, /*#__PURE__*/React.createElement(it.Icon, {
    size: 16,
    color: T.textSubtle,
    strokeWidth: 2
  })))));
}

// ──────────────────────────────────────────────────────────────────────────
// Mock data — REPLACE with real-data hook in production
// ──────────────────────────────────────────────────────────────────────────

const MOCK_PROPS = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  neighborhood: "La Manjoya",
  city: "Oviedo",
  status: "FOR_SALE",
  price: 195000,
  rooms: 3,
  baths: 2,
  area: 95,
  duplicates: 2,
  delta: -3.7
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  neighborhood: "Cabueñes",
  city: "Gijón",
  status: "RESERVED",
  price: 385000,
  rooms: 4,
  baths: 3,
  area: 180,
  duplicates: 0,
  delta: 0
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  neighborhood: "Centro",
  city: "Avilés",
  status: "FOR_SALE",
  price: 165000,
  rooms: 2,
  baths: 1,
  area: 72,
  duplicates: 1,
  delta: -2.4
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  neighborhood: "San Lorenzo",
  city: "Gijón",
  status: "SOLD",
  price: 89000,
  rooms: 0,
  baths: 1,
  area: 35,
  duplicates: 0,
  delta: 0
}];
const STATUS_MAP = {
  FOR_SALE: {
    label: "En venta",
    bg: T.infoSoft,
    fg: T.info,
    border: "rgba(44,122,138,0.15)"
  },
  RESERVED: {
    label: "Reservado",
    bg: T.warningSoft,
    fg: T.warning,
    border: "rgba(168,106,23,0.20)"
  },
  SOLD: {
    label: "Vendido",
    bg: T.successSoft,
    fg: T.success,
    border: "rgba(45,106,79,0.15)"
  },
  WITHDRAWN: {
    label: "Retirado",
    bg: T.surfaceMuted,
    fg: T.textMuted,
    border: T.border
  }
};
const fmtEUR = n => new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
}).format(n);
function StatusBadge({
  s: stat
}) {
  const c = STATUS_MAP[stat];
  return /*#__PURE__*/React.createElement(View, {
    style: [s.statusBadge, {
      backgroundColor: c.bg,
      borderColor: c.border
    }]
  }, /*#__PURE__*/React.createElement(View, {
    style: [s.statusDot, {
      backgroundColor: c.fg
    }]
  }), /*#__PURE__*/React.createElement(Text, {
    style: [s.statusText, {
      color: c.fg
    }]
  }, c.label));
}
function PriceDelta({
  pct
}) {
  if (pct === 0) return null;
  const down = pct < 0;
  const bg = down ? T.priceDownBg : T.priceUpBg;
  const fg = down ? T.priceDownFg : T.priceUpFg;
  const Icon = down ? ArrowDown : ArrowUp;
  return /*#__PURE__*/React.createElement(View, {
    style: [s.delta, {
      backgroundColor: bg
    }]
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 10,
    color: fg,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: [s.deltaText, {
      color: fg
    }]
  }, Math.abs(pct).toFixed(1), "%"));
}
function PropertyCard({
  p
}) {
  return /*#__PURE__*/React.createElement(Pressable, {
    style: ({
      pressed
    }) => [s.card, pressed && {
      opacity: 0.96
    }]
  }, /*#__PURE__*/React.createElement(View, {
    style: s.photo
  }, /*#__PURE__*/React.createElement(ImageIcon, {
    size: 26,
    color: T.textSubtle,
    strokeWidth: 1.5
  }), /*#__PURE__*/React.createElement(View, {
    style: s.photoBadgeTL
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    s: p.status
  })), p.duplicates > 0 && /*#__PURE__*/React.createElement(View, {
    style: s.dupBadge
  }, /*#__PURE__*/React.createElement(Sparkles, {
    size: 9,
    color: T.primary,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.dupBadgeText
  }, p.duplicates))), /*#__PURE__*/React.createElement(View, {
    style: s.cardBody
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.cardTitle,
    numberOfLines: 2
  }, p.title), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(MapPin, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardMeta,
    numberOfLines: 1
  }, p.type, " \xB7 ", p.neighborhood ? `${p.neighborhood}, ` : "", p.city)), /*#__PURE__*/React.createElement(View, {
    style: s.cardPriceRow
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.cardPrice
  }, fmtEUR(p.price)), /*#__PURE__*/React.createElement(PriceDelta, {
    pct: p.delta
  })), /*#__PURE__*/React.createElement(View, {
    style: s.cardFooter
  }, /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Bed, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.rooms)), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.baths)), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.area, " m\xB2")))));
}

// ──────────────────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────────────────
function InmueblesAndroidScreen() {
  const [current, setCurrent] = React.useState("inmuebles");
  return /*#__PURE__*/React.createElement(SafeAreaView, {
    edges: ["top", "bottom"],
    style: s.root
  }, /*#__PURE__*/React.createElement(StatusBar, {
    style: "dark",
    backgroundColor: T.surface,
    translucent: false
  }), /*#__PURE__*/React.createElement(View, {
    style: s.row
  }, /*#__PURE__*/React.createElement(Rail, {
    current: current,
    onChange: setCurrent
  }), /*#__PURE__*/React.createElement(View, {
    style: s.content
  }, /*#__PURE__*/React.createElement(View, {
    style: s.header
  }, /*#__PURE__*/React.createElement(View, {
    style: s.headerTop
  }, /*#__PURE__*/React.createElement(View, null, /*#__PURE__*/React.createElement(Text, {
    style: s.title
  }, "Inmuebles"), /*#__PURE__*/React.createElement(Text, {
    style: s.subtitle
  }, "23 fichas \xB7 4 nuevos esta semana")), /*#__PURE__*/React.createElement(Pressable, {
    accessibilityRole: "button",
    accessibilityLabel: "Nuevo inmueble",
    style: s.fab
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16,
    color: T.primaryFg,
    strokeWidth: 2.5
  }))), /*#__PURE__*/React.createElement(View, {
    style: s.searchWrap
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    color: T.textSubtle,
    strokeWidth: 2,
    style: s.searchIcon
  }), /*#__PURE__*/React.createElement(TextInput, {
    placeholder: "Buscar inmuebles, direcciones\u2026",
    placeholderTextColor: T.textSubtle,
    style: s.search
  }))), /*#__PURE__*/React.createElement(ScrollView, {
    contentContainerStyle: s.list
  }, MOCK_PROPS.map(p => /*#__PURE__*/React.createElement(PropertyCard, {
    key: p.id,
    p: p
  })), /*#__PURE__*/React.createElement(Text, {
    style: s.eol
  }, "\u2014 Fin de la lista \u2014")))));
}

// ──────────────────────────────────────────────────────────────────────────
// Styles — equivalent to the web Tailwind classes the design spec used.
// Density tuned for 393×852 (Pixel 7 / iPhone 14). 13px body baseline.
// ──────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg
  },
  row: {
    flex: 1,
    flexDirection: "row"
  },
  // Rail
  rail: {
    width: 56,
    backgroundColor: T.surface,
    borderRightWidth: 1,
    borderColor: T.border
  },
  brandSlot: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderColor: T.border
  },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: T.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  brandGlyph: {
    color: T.primary,
    fontSize: 18,
    fontWeight: "600"
  },
  railDivider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 12,
    backgroundColor: T.border
  },
  railItem: {
    width: 40,
    height: 40,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  railItemActive: {
    backgroundColor: T.primarySoft
  },
  railActiveBar: {
    position: "absolute",
    left: -8,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1
  },
  railBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    height: 16,
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: T.danger,
    alignItems: "center",
    justifyContent: "center"
  },
  railBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  railFooter: {
    borderTopWidth: 1,
    borderColor: T.border,
    paddingVertical: 8
  },
  // Content area
  content: {
    flex: 1
  },
  header: {
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between"
  },
  title: {
    color: T.text,
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.2
  },
  subtitle: {
    color: T.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  fab: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: T.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: {
      width: 0,
      height: 1
    },
    elevation: 2
  },
  searchWrap: {
    position: "relative",
    marginTop: 12
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: 13,
    zIndex: 1
  },
  search: {
    height: 36,
    paddingLeft: 36,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    backgroundColor: T.bg,
    color: T.text,
    fontSize: 13
  },
  list: {
    padding: 12,
    gap: 12,
    paddingBottom: 24
  },
  eol: {
    textAlign: "center",
    color: T.textSubtle,
    fontSize: 11,
    marginVertical: 16
  },
  // Card
  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    overflow: "hidden"
  },
  photo: {
    aspectRatio: 16 / 10,
    backgroundColor: T.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  photoBadgeTL: {
    position: "absolute",
    top: 10,
    left: 10
  },
  dupBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 6
  },
  dupBadgeText: {
    color: T.primary,
    fontSize: 10,
    fontWeight: "500"
  },
  cardBody: {
    padding: 12,
    gap: 8
  },
  cardTitle: {
    color: T.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  cardMeta: {
    color: T.textMuted,
    fontSize: 12,
    flex: 1
  },
  cardPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between"
  },
  cardPrice: {
    color: T.text,
    fontSize: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3
  },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: T.border
  },
  cardSpec: {
    color: T.textMuted,
    fontSize: 11,
    fontVariant: ["tabular-nums"]
  },
  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 6
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    opacity: 0.7
  },
  statusText: {
    fontSize: 11,
    fontWeight: "500"
  },
  // Price delta
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"]
  }
});
Object.assign(__ds_scope, { InmueblesAndroidScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "screens/tsx/mobile-android-inmuebles.tsx", error: String((e && e.message) || e) }); }

// screens/tsx/mobile-ios-inmuebles.tsx
try { (() => {
// ──────────────────────────────────────────────────────────────────────────
// screens/tsx/mobile-ios-inmuebles.tsx
// Design spec for BuySell mobile — iOS — Inmuebles screen.
// Stack: Expo Router + React Native + lucide-react-native + expo-status-bar +
// react-native-safe-area-context.
//
// 95 % identical to mobile-android-inmuebles.tsx. Divergences (intentional):
//   • Header title: 22px / 700 (iOS "large title") vs 20px / 600 on Android
//   • CTA: bare "+" icon button in primary (iOS pattern) vs filled FAB on Android
//   • StatusBar: no backgroundColor (iOS draws its own translucent bar)
//
// Dependencies: same as Android file.
// ──────────────────────────────────────────────────────────────────────────

const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  brass: "#C49A4D",
  success: "#2D6A4F",
  successSoft: "#E8F1EC",
  warning: "#A86A17",
  warningSoft: "#F7EFDE",
  danger: "#A23E3E",
  dangerSoft: "#F6E5E5",
  info: "#2C7A8A",
  infoSoft: "#E1EEF1",
  priceUpBg: "#FDF2F2",
  priceUpFg: "#A23E3E",
  priceDownBg: "#F0F7F2",
  priceDownFg: "#2D6A4F"
};
const RAIL_GROUPS = [{
  id: "catalogo",
  accent: "#3A5F8A",
  items: [{
    id: "inmuebles",
    label: "Inmuebles",
    Icon: Building2
  }, {
    id: "duplicados",
    label: "Duplicados",
    Icon: Sparkles,
    count: 3
  }]
}, {
  id: "analisis",
  accent: "#2C7A8A",
  items: [{
    id: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard
  }, {
    id: "actividad",
    label: "Actividad",
    Icon: Activity
  }]
}, {
  id: "captura",
  accent: "#A86A17",
  items: [{
    id: "importar",
    label: "Importar",
    Icon: Download
  }]
}];
const RAIL_FOOTER = [{
  id: "perfil",
  label: "Perfil",
  Icon: User
}, {
  id: "ajustes",
  label: "Ajustes",
  Icon: Settings
}];
function BrandBadge() {
  return /*#__PURE__*/React.createElement(View, {
    style: s.brandBadge
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.brandGlyph
  }, "\u26BF"));
}
function Rail({
  current,
  onChange
}) {
  return /*#__PURE__*/React.createElement(View, {
    style: s.rail
  }, /*#__PURE__*/React.createElement(View, {
    style: s.brandSlot
  }, /*#__PURE__*/React.createElement(BrandBadge, null)), /*#__PURE__*/React.createElement(ScrollView, {
    showsVerticalScrollIndicator: false,
    contentContainerStyle: {
      paddingVertical: 8
    }
  }, RAIL_GROUPS.map((g, gi) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: g.id
  }, gi > 0 && /*#__PURE__*/React.createElement(View, {
    style: s.railDivider
  }), g.items.map(it => {
    const active = current === it.id;
    return /*#__PURE__*/React.createElement(Pressable, {
      key: it.id,
      onPress: () => onChange(it.id),
      accessibilityRole: "button",
      accessibilityLabel: it.label,
      style: [s.railItem, active && s.railItemActive]
    }, active && /*#__PURE__*/React.createElement(View, {
      style: [s.railActiveBar, {
        backgroundColor: g.accent
      }]
    }), /*#__PURE__*/React.createElement(it.Icon, {
      size: 18,
      color: active ? T.primary : T.textMuted,
      strokeWidth: 2
    }), it.count != null && /*#__PURE__*/React.createElement(View, {
      style: s.railBadge
    }, /*#__PURE__*/React.createElement(Text, {
      style: s.railBadgeText
    }, it.count)));
  })))), /*#__PURE__*/React.createElement(View, {
    style: s.railFooter
  }, RAIL_FOOTER.map(it => /*#__PURE__*/React.createElement(Pressable, {
    key: it.id,
    accessibilityRole: "button",
    accessibilityLabel: it.label,
    style: s.railItem
  }, /*#__PURE__*/React.createElement(it.Icon, {
    size: 16,
    color: T.textSubtle,
    strokeWidth: 2
  })))));
}
const MOCK_PROPS = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  neighborhood: "La Manjoya",
  city: "Oviedo",
  status: "FOR_SALE",
  price: 195000,
  rooms: 3,
  baths: 2,
  area: 95,
  duplicates: 2,
  delta: -3.7
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  neighborhood: "Cabueñes",
  city: "Gijón",
  status: "RESERVED",
  price: 385000,
  rooms: 4,
  baths: 3,
  area: 180,
  duplicates: 0,
  delta: 0
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  neighborhood: "Centro",
  city: "Avilés",
  status: "FOR_SALE",
  price: 165000,
  rooms: 2,
  baths: 1,
  area: 72,
  duplicates: 1,
  delta: -2.4
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  neighborhood: "San Lorenzo",
  city: "Gijón",
  status: "SOLD",
  price: 89000,
  rooms: 0,
  baths: 1,
  area: 35,
  duplicates: 0,
  delta: 0
}];
const STATUS_MAP = {
  FOR_SALE: {
    label: "En venta",
    bg: T.infoSoft,
    fg: T.info,
    border: "rgba(44,122,138,0.15)"
  },
  RESERVED: {
    label: "Reservado",
    bg: T.warningSoft,
    fg: T.warning,
    border: "rgba(168,106,23,0.20)"
  },
  SOLD: {
    label: "Vendido",
    bg: T.successSoft,
    fg: T.success,
    border: "rgba(45,106,79,0.15)"
  },
  WITHDRAWN: {
    label: "Retirado",
    bg: T.surfaceMuted,
    fg: T.textMuted,
    border: T.border
  }
};
const fmtEUR = n => new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
}).format(n);
function StatusBadge({
  s: stat
}) {
  const c = STATUS_MAP[stat];
  return /*#__PURE__*/React.createElement(View, {
    style: [s.statusBadge, {
      backgroundColor: c.bg,
      borderColor: c.border
    }]
  }, /*#__PURE__*/React.createElement(View, {
    style: [s.statusDot, {
      backgroundColor: c.fg
    }]
  }), /*#__PURE__*/React.createElement(Text, {
    style: [s.statusText, {
      color: c.fg
    }]
  }, c.label));
}
function PriceDelta({
  pct
}) {
  if (pct === 0) return null;
  const down = pct < 0;
  const bg = down ? T.priceDownBg : T.priceUpBg;
  const fg = down ? T.priceDownFg : T.priceUpFg;
  const Icon = down ? ArrowDown : ArrowUp;
  return /*#__PURE__*/React.createElement(View, {
    style: [s.delta, {
      backgroundColor: bg
    }]
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 10,
    color: fg,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: [s.deltaText, {
      color: fg
    }]
  }, Math.abs(pct).toFixed(1), "%"));
}
function PropertyCard({
  p
}) {
  return /*#__PURE__*/React.createElement(Pressable, {
    style: ({
      pressed
    }) => [s.card, pressed && {
      opacity: 0.96
    }]
  }, /*#__PURE__*/React.createElement(View, {
    style: s.photo
  }, /*#__PURE__*/React.createElement(ImageIcon, {
    size: 26,
    color: T.textSubtle,
    strokeWidth: 1.5
  }), /*#__PURE__*/React.createElement(View, {
    style: s.photoBadgeTL
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    s: p.status
  })), p.duplicates > 0 && /*#__PURE__*/React.createElement(View, {
    style: s.dupBadge
  }, /*#__PURE__*/React.createElement(Sparkles, {
    size: 9,
    color: T.primary,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.dupBadgeText
  }, p.duplicates))), /*#__PURE__*/React.createElement(View, {
    style: s.cardBody
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.cardTitle,
    numberOfLines: 2
  }, p.title), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(MapPin, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardMeta,
    numberOfLines: 1
  }, p.type, " \xB7 ", p.neighborhood ? `${p.neighborhood}, ` : "", p.city)), /*#__PURE__*/React.createElement(View, {
    style: s.cardPriceRow
  }, /*#__PURE__*/React.createElement(Text, {
    style: s.cardPrice
  }, fmtEUR(p.price)), /*#__PURE__*/React.createElement(PriceDelta, {
    pct: p.delta
  })), /*#__PURE__*/React.createElement(View, {
    style: s.cardFooter
  }, /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Bed, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.rooms)), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.baths)), /*#__PURE__*/React.createElement(View, {
    style: s.cardRow
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 11,
    color: T.textMuted,
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement(Text, {
    style: s.cardSpec
  }, p.area, " m\xB2")))));
}

// ──────────────────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────────────────
function InmueblesIOSScreen() {
  const [current, setCurrent] = React.useState("inmuebles");
  return /*#__PURE__*/React.createElement(SafeAreaView, {
    edges: ["top", "bottom"],
    style: s.root
  }, /*#__PURE__*/React.createElement(StatusBar, {
    style: "dark"
  }), /*#__PURE__*/React.createElement(View, {
    style: s.row
  }, /*#__PURE__*/React.createElement(Rail, {
    current: current,
    onChange: setCurrent
  }), /*#__PURE__*/React.createElement(View, {
    style: s.content
  }, /*#__PURE__*/React.createElement(View, {
    style: s.header
  }, /*#__PURE__*/React.createElement(View, {
    style: s.headerTop
  }, /*#__PURE__*/React.createElement(View, null, /*#__PURE__*/React.createElement(Text, {
    style: s.title
  }, "Inmuebles"), /*#__PURE__*/React.createElement(Text, {
    style: s.subtitle
  }, "23 fichas \xB7 4 nuevos esta semana")), /*#__PURE__*/React.createElement(Pressable, {
    accessibilityRole: "button",
    accessibilityLabel: "Nuevo inmueble",
    style: ({
      pressed
    }) => [s.iosAdd, pressed && s.iosAddPressed]
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 22,
    color: T.primary,
    strokeWidth: 2.2
  }))), /*#__PURE__*/React.createElement(View, {
    style: s.searchWrap
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    color: T.textSubtle,
    strokeWidth: 2,
    style: s.searchIcon
  }), /*#__PURE__*/React.createElement(TextInput, {
    placeholder: "Buscar inmuebles, direcciones\u2026",
    placeholderTextColor: T.textSubtle,
    style: s.search
  }))), /*#__PURE__*/React.createElement(ScrollView, {
    contentContainerStyle: s.list
  }, MOCK_PROPS.map(p => /*#__PURE__*/React.createElement(PropertyCard, {
    key: p.id,
    p: p
  })), /*#__PURE__*/React.createElement(Text, {
    style: s.eol
  }, "\u2014 Fin de la lista \u2014")))));
}
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg
  },
  row: {
    flex: 1,
    flexDirection: "row"
  },
  rail: {
    width: 56,
    backgroundColor: T.surface,
    borderRightWidth: 1,
    borderColor: T.border
  },
  brandSlot: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderColor: T.border
  },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: T.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  brandGlyph: {
    color: T.primary,
    fontSize: 18,
    fontWeight: "600"
  },
  railDivider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 12,
    backgroundColor: T.border
  },
  railItem: {
    width: 40,
    height: 40,
    marginHorizontal: 8,
    marginVertical: 2,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  railItemActive: {
    backgroundColor: T.primarySoft
  },
  railActiveBar: {
    position: "absolute",
    left: -8,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1
  },
  railBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    height: 16,
    minWidth: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: T.danger,
    alignItems: "center",
    justifyContent: "center"
  },
  railBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "700",
    fontVariant: ["tabular-nums"]
  },
  railFooter: {
    borderTopWidth: 1,
    borderColor: T.border,
    paddingVertical: 8
  },
  content: {
    flex: 1
  },
  header: {
    backgroundColor: T.surface,
    borderBottomWidth: 1,
    borderColor: T.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  // iOS large title: 22 / 700 / tight
  title: {
    color: T.text,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    lineHeight: 26
  },
  subtitle: {
    color: T.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  // iOS bare-icon + button (no fill, no border, light press feedback)
  iosAdd: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -4
  },
  iosAddPressed: {
    backgroundColor: T.primarySoft
  },
  searchWrap: {
    position: "relative",
    marginTop: 12
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: 13,
    zIndex: 1
  },
  search: {
    height: 36,
    paddingLeft: 36,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 6,
    backgroundColor: T.bg,
    color: T.text,
    fontSize: 13
  },
  list: {
    padding: 12,
    gap: 12,
    paddingBottom: 24
  },
  eol: {
    textAlign: "center",
    color: T.textSubtle,
    fontSize: 11,
    marginVertical: 16
  },
  card: {
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 8,
    overflow: "hidden"
  },
  photo: {
    aspectRatio: 16 / 10,
    backgroundColor: T.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  photoBadgeTL: {
    position: "absolute",
    top: 10,
    left: 10
  },
  dupBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 6
  },
  dupBadgeText: {
    color: T.primary,
    fontSize: 10,
    fontWeight: "500"
  },
  cardBody: {
    padding: 12,
    gap: 8
  },
  cardTitle: {
    color: T.text,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  cardMeta: {
    color: T.textMuted,
    fontSize: 12,
    flex: 1
  },
  cardPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between"
  },
  cardPrice: {
    color: T.text,
    fontSize: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.3
  },
  cardFooter: {
    flexDirection: "row",
    gap: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: T.border
  },
  cardSpec: {
    color: T.textMuted,
    fontSize: 11,
    fontVariant: ["tabular-nums"]
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 6
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    opacity: 0.7
  },
  statusText: {
    fontSize: 11,
    fontWeight: "500"
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  deltaText: {
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"]
  }
});
Object.assign(__ds_scope, { InmueblesIOSScreen });
})(); } catch (e) { __ds_ns.__errors.push({ path: "screens/tsx/mobile-ios-inmuebles.tsx", error: String((e && e.message) || e) }); }

// screens/tsx/web-inmuebles.tsx
try { (() => {
// ──────────────────────────────────────────────────────────────────────────
// screens/tsx/web-inmuebles.tsx
// Design spec for BuySell web — Inmuebles page with the new vertical-tabs sidebar.
// Drop-in for Next.js 15 App Router + Tailwind. Tailwind classes match the
// repo's tailwind.config.ts. Data is hard-coded — wire to Prisma in the real
// page.tsx (see CLAUDE_CODE_PROMPT.md).
// ──────────────────────────────────────────────────────────────────────────
"use client";

// ──────────────────────────────────────────────────────────────────────────
// Brand mark — steel-blue line + aged-brass accent
// ──────────────────────────────────────────────────────────────────────────
function IconKey({
  size = 20
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12",
    r: "3.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "8",
    r: "0.85",
    fill: "#C49A4D",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.8 12 H17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 H21 V17 H20 V15.5 H18.5 V17 H17 Z",
    fill: "#C49A4D"
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Navigation model
// Each group carries an accent colour used as a 2px left border on the group
// header. Aged-brass-on-steel restraint: accents are subtle, not chip fills.
// ──────────────────────────────────────────────────────────────────────────

const NAV_GROUPS = [{
  id: "catalogo",
  label: "Catálogo",
  accent: "#3A5F8A",
  items: [{
    id: "inmuebles",
    label: "Inmuebles",
    Icon: Building2
  }, {
    id: "duplicados",
    label: "Duplicados",
    Icon: Sparkles,
    count: 3
  }]
}, {
  id: "analisis",
  label: "Análisis",
  accent: "#2C7A8A",
  items: [{
    id: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard
  }, {
    id: "actividad",
    label: "Actividad",
    Icon: Activity
  }]
}, {
  id: "captura",
  label: "Captura",
  accent: "#A86A17",
  items: [{
    id: "importar",
    label: "Importar",
    Icon: Download
  }]
}];
const FOOTER_ITEMS = [{
  id: "perfil",
  label: "Perfil",
  Icon: User
}, {
  id: "ajustes",
  label: "Ajustes",
  Icon: Settings
}];

// ──────────────────────────────────────────────────────────────────────────
// Sidebar — Chrome Vertical Tabs inspiration, BuySell vocabulary:
//   • hairline borders (1px) instead of chips
//   • group accent only as a 2px left border on the header
//   • collapsible per group (chevron 90° rotation)
//   • active item: bg-primary-soft + text-primary, weight 500
// ──────────────────────────────────────────────────────────────────────────
function Sidebar({
  current,
  onChange
}) {
  const [open, setOpen] = React.useState({
    catalogo: true,
    analisis: true,
    captura: true
  });
  const toggle = id => setOpen(o => ({
    ...o,
    [id]: !o[id]
  }));
  return /*#__PURE__*/React.createElement("aside", {
    className: "flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-surface"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex h-14 items-center gap-2 border-b border-border px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary ring-1 ring-inset ring-primary/15"
  }, /*#__PURE__*/React.createElement(IconKey, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "leading-tight"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[13px] font-semibold text-text"
  }, "BuySell"), /*#__PURE__*/React.createElement("div", {
    className: "text-[11px] text-text-subtle"
  }, "Asturias"))), /*#__PURE__*/React.createElement("nav", {
    className: "flex-1 overflow-y-auto px-2 py-3"
  }, NAV_GROUPS.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.id,
    className: "mb-1"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => toggle(g.id),
    className: "flex w-full items-center justify-between px-2.5 py-1.5 pl-[10px] text-[10px] font-semibold uppercase tracking-[0.06em] text-text-subtle hover:text-text-muted",
    style: {
      borderLeft: `2px solid ${g.accent}`,
      marginLeft: -2
    }
  }, /*#__PURE__*/React.createElement("span", null, g.label), /*#__PURE__*/React.createElement(ChevronDown, {
    size: 11,
    className: `transition-transform ${open[g.id] ? "" : "-rotate-90"}`
  })), open[g.id] && /*#__PURE__*/React.createElement("div", {
    className: "mt-0.5 space-y-px"
  }, g.items.map(it => {
    const active = current === it.id;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      type: "button",
      onClick: () => onChange(it.id),
      className: "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors " + (active ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:bg-surface-muted hover:text-text")
    }, /*#__PURE__*/React.createElement(it.Icon, {
      size: 15,
      className: active ? "text-primary" : "text-text-subtle"
    }), /*#__PURE__*/React.createElement("span", {
      className: "flex-1 text-left"
    }, it.label), it.count != null && /*#__PURE__*/React.createElement("span", {
      className: "tabular-nums rounded px-1.5 text-[11px] font-medium " + (active ? "bg-primary/10 text-primary" : "bg-surface-muted text-text-muted")
    }, it.count));
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-px border-t border-border p-2"
  }, FOOTER_ITEMS.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.id,
    type: "button",
    className: "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text-muted hover:bg-surface-muted hover:text-text"
  }, /*#__PURE__*/React.createElement(it.Icon, {
    size: 15,
    className: "text-text-subtle"
  }), it.label))));
}

// ──────────────────────────────────────────────────────────────────────────
// Topbar — search on the left (max-w-md), CTA on the right
// Matches the existing AppShell.tsx pattern.
// ──────────────────────────────────────────────────────────────────────────
function Topbar() {
  return /*#__PURE__*/React.createElement("header", {
    className: "flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative w-full max-w-md"
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    className: "absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
  }), /*#__PURE__*/React.createElement("input", {
    type: "search",
    placeholder: "Buscar inmuebles, direcciones, refs\u2026",
    className: "h-9 w-full rounded-md border border-border bg-bg pl-9 pr-12 text-[13px] text-text placeholder:text-text-subtle outline-none hover:border-border-strong focus:border-primary"
  }), /*#__PURE__*/React.createElement("span", {
    className: "absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-surface px-1 py-px font-mono text-[10px] text-text-subtle"
  }, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-fg hover:bg-primary-hover"
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 14
  }), " Nuevo inmueble"));
}

// ──────────────────────────────────────────────────────────────────────────
// Mock data — REPLACE with Prisma findMany() result in real page.tsx
// ──────────────────────────────────────────────────────────────────────────

const MOCK_PROPS = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  neighborhood: "La Manjoya",
  city: "Oviedo",
  status: "FOR_SALE",
  price: 195000,
  rooms: 3,
  baths: 2,
  area: 95,
  duplicates: 2,
  delta: -3.7
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  neighborhood: "Cabueñes",
  city: "Gijón",
  status: "RESERVED",
  price: 385000,
  rooms: 4,
  baths: 3,
  area: 180,
  duplicates: 0,
  delta: 0
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  neighborhood: "Centro",
  city: "Avilés",
  status: "FOR_SALE",
  price: 165000,
  rooms: 2,
  baths: 1,
  area: 72,
  duplicates: 1,
  delta: -2.4
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  neighborhood: "San Lorenzo",
  city: "Gijón",
  status: "SOLD",
  price: 89000,
  rooms: 0,
  baths: 1,
  area: 35,
  duplicates: 0,
  delta: 0
}, {
  id: 5,
  title: "Casa de pueblo con hórreo en parcela",
  type: "Casa",
  neighborhood: null,
  city: "Cangas de Onís",
  status: "FOR_SALE",
  price: 178000,
  rooms: 4,
  baths: 2,
  area: 145,
  duplicates: 0,
  delta: -3.8
}, {
  id: 6,
  title: "Dúplex con dos terrazas y garaje incluido",
  type: "Dúplex",
  neighborhood: "La Magdalena",
  city: "Avilés",
  status: "FOR_SALE",
  price: 215000,
  rooms: 3,
  baths: 2,
  area: 105,
  duplicates: 0,
  delta: -2.3
}];
const STATUS_MAP = {
  FOR_SALE: {
    label: "En venta",
    cls: "bg-info-soft text-info border-info/15"
  },
  RESERVED: {
    label: "Reservado",
    cls: "bg-warning-soft text-warning border-warning/20"
  },
  SOLD: {
    label: "Vendido",
    cls: "bg-success-soft text-success border-success/15"
  },
  WITHDRAWN: {
    label: "Retirado",
    cls: "bg-surface-muted text-text-muted border-border"
  }
};
const eur = n => new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
}).format(n);
function StatusBadge({
  s
}) {
  const c = STATUS_MAP[s];
  return /*#__PURE__*/React.createElement("span", {
    className: `inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${c.cls}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "h-1.5 w-1.5 rounded-full bg-current opacity-70"
  }), c.label);
}
function PriceDelta({
  pct
}) {
  if (pct === 0) return null;
  const down = pct < 0;
  const Icon = down ? ArrowDown : ArrowUp;
  return /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
    style: {
      background: down ? "#F0F7F2" : "#FDF2F2",
      color: down ? "#2D6A4F" : "#A23E3E"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: 10
  }), Math.abs(pct).toFixed(1), "%");
}

// ──────────────────────────────────────────────────────────────────────────
// Property card — for the 3-col grid
// ──────────────────────────────────────────────────────────────────────────
function PropertyCard({
  p
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "group overflow-hidden rounded-lg border border-border bg-surface shadow-xs transition-shadow hover:shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "relative aspect-[16/10] bg-surface-muted"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute inset-0 flex items-center justify-center text-text-subtle"
  }, /*#__PURE__*/React.createElement(ImageIcon, {
    size: 28,
    strokeWidth: 1.5
  })), /*#__PURE__*/React.createElement("div", {
    className: "absolute left-3 top-3"
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    s: p.status
  })), p.duplicates > 0 && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-3 top-3 inline-flex items-center gap-1 rounded-md bg-surface/95 px-1.5 py-0.5 text-[10px] font-medium text-primary shadow-xs backdrop-blur"
  }, /*#__PURE__*/React.createElement(Sparkles, {
    size: 9
  }), " ", p.duplicates, " ", p.duplicates === 1 ? "duplicado" : "duplicados")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2 p-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "line-clamp-2 text-[13px] font-semibold leading-snug text-text"
  }, p.title), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-1 text-[12px] text-text-muted"
  }, /*#__PURE__*/React.createElement(MapPin, {
    size: 11
  }), /*#__PURE__*/React.createElement("span", null, p.type, " \xB7 ", p.neighborhood ? `${p.neighborhood}, ` : "", p.city)), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-[18px] font-semibold tracking-tight text-text tabular-nums"
  }, eur(p.price)), /*#__PURE__*/React.createElement(PriceDelta, {
    pct: p.delta
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 border-t border-border pt-2.5 text-[12px] text-text-muted"
  }, /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Bed, {
    size: 11
  }), " ", p.rooms, " hab"), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1"
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 11
  }), " ", p.baths), /*#__PURE__*/React.createElement("span", {
    className: "inline-flex items-center gap-1 tabular-nums"
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 11
  }), " ", p.area, " m\xB2"))));
}

// ──────────────────────────────────────────────────────────────────────────
// Page — wires Sidebar + Topbar + content. In your real app, this is the
// content of /app/properties/page.tsx. Sidebar/Topbar live in AppShell.
// ──────────────────────────────────────────────────────────────────────────
function InmueblesPage({
  data = MOCK_PROPS
}) {
  const [current, setCurrent] = React.useState("inmuebles");
  const [sort, setSort] = React.useState("updatedAt-desc");
  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-screen bg-bg text-text"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    current: current,
    onChange: setCurrent
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex min-w-0 flex-1 flex-col"
  }, /*#__PURE__*/React.createElement(Topbar, null), /*#__PURE__*/React.createElement("main", {
    className: "min-w-0 flex-1 overflow-y-auto px-6 py-8"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-6 flex items-end justify-between gap-4"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-[24px] font-semibold leading-tight tracking-[-0.015em] text-text"
  }, "Inmuebles"), /*#__PURE__*/React.createElement("p", {
    className: "mt-1 text-[13px] text-text-muted"
  }, data.length, " fichas \xB7 sincronizado hace 12 min \xB7 3 cambios nuevos")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 text-[12px] text-text-muted"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12px] text-text hover:bg-surface-muted"
  }, /*#__PURE__*/React.createElement(Filter, {
    size: 12
  }), " Filtros"), /*#__PURE__*/React.createElement("span", null, "Ordenar por"), /*#__PURE__*/React.createElement("select", {
    value: sort,
    onChange: e => setSort(e.target.value),
    className: "h-8 rounded-md border border-border bg-surface px-2 pr-7 text-[12px] text-text"
  }, /*#__PURE__*/React.createElement("option", {
    value: "updatedAt-desc"
  }, "M\xE1s recientes"), /*#__PURE__*/React.createElement("option", {
    value: "currentPrice-asc"
  }, "Precio: menor"), /*#__PURE__*/React.createElement("option", {
    value: "currentPrice-desc"
  }, "Precio: mayor")))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-3 gap-4"
  }, data.map(p => /*#__PURE__*/React.createElement(PropertyCard, {
    key: p.id,
    p: p
  }))))));
}
Object.assign(__ds_scope, { Sidebar, InmueblesPage });
})(); } catch (e) { __ds_ns.__errors.push({ path: "screens/tsx/web-inmuebles.tsx", error: String((e && e.message) || e) }); }

// ui_kits/web/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React */
/* eslint-disable react/prop-types */

// ============================================================
// Tokens — mirrors colors_and_type.css. Kept in JS for components
// that need to compute colors inline (charts, conditional pills).
// ============================================================

const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  brassAccent: "#C49A4D",
  success: "#2D6A4F",
  successSoft: "#E8F1EC",
  warning: "#A86A17",
  warningSoft: "#F7EFDE",
  danger: "#A23E3E",
  dangerSoft: "#F6E5E5",
  info: "#2C7A8A",
  infoSoft: "#E1EEF1",
  priceUpBg: "#FDF2F2",
  priceUpFg: "#A23E3E",
  priceDownBg: "#F0F7F2",
  priceDownFg: "#2D6A4F"
};

// ============================================================
// Brand mark — the BuySell forged-key icon
// ============================================================

function IconKey({
  size = 24,
  color = "currentColor",
  brass = T.brassAccent
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "12",
    r: "3.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6.5",
    cy: "8",
    r: "0.85",
    fill: brass,
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.8 12 H17"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 H21 V17 H20 V15.5 H18.5 V17 H17 Z",
    fill: brass
  }));
}

// ============================================================
// Tiny Lucide-style icons — only what the kit needs
// ============================================================

const SI = (paths, viewBox = "0 0 24 24") => ({
  size = 16,
  color = "currentColor",
  style
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: viewBox,
  fill: "none",
  stroke: color,
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
  style: style
}, paths);
const IconDashboard = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "3",
  width: "7",
  height: "9",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "14",
  y: "3",
  width: "7",
  height: "5",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "14",
  y: "12",
  width: "7",
  height: "9",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "16",
  width: "7",
  height: "5",
  rx: "1"
})));
const IconBuildings = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M10 6h4M10 10h4M10 14h4M10 18h4"
})));
const IconSparkles = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z"
})));
const IconActivity = SI(/*#__PURE__*/React.createElement("path", {
  d: "M22 12h-4l-3 9L9 3l-3 9H2"
}));
const IconSearches = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "3",
  width: "7",
  height: "7",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "14",
  y: "3",
  width: "7",
  height: "7",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "14",
  width: "7",
  height: "7",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "14",
  y: "14",
  width: "7",
  height: "7",
  rx: "1"
})));
const IconSettings = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
})));
const IconPlus = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M5 12h14M12 5v14"
})));
const IconSearch = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
  cx: "11",
  cy: "11",
  r: "8"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 21-4.3-4.3"
})));
const IconPin = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "10",
  r: "3"
})));
const IconBed = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"
})));
const IconBath = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M9 6 6 3M19 13v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 13h18"
})));
const IconArea = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("polyline", {
  points: "15 3 21 3 21 9"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "9 21 3 21 3 15"
}), /*#__PURE__*/React.createElement("line", {
  x1: "21",
  y1: "3",
  x2: "14",
  y2: "10"
}), /*#__PURE__*/React.createElement("line", {
  x1: "3",
  y1: "21",
  x2: "10",
  y2: "14"
})));
const IconUp = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "19",
  x2: "12",
  y2: "5"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "5 12 12 5 19 12"
})));
const IconDown = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "5",
  x2: "12",
  y2: "19"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "19 12 12 19 5 12"
})));
const IconMinus = SI(/*#__PURE__*/React.createElement("line", {
  x1: "5",
  y1: "12",
  x2: "19",
  y2: "12"
}));
const IconBack = SI(/*#__PURE__*/React.createElement("polyline", {
  points: "15 18 9 12 15 6"
}));
const IconEdit = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M12 20h9"
}), /*#__PURE__*/React.createElement("path", {
  d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
})));
const IconExt = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "15 3 21 3 21 9"
}), /*#__PURE__*/React.createElement("line", {
  x1: "10",
  y1: "14",
  x2: "21",
  y2: "3"
})));
const IconCalendar = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "4",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("line", {
  x1: "16",
  y1: "2",
  x2: "16",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "8",
  y1: "2",
  x2: "8",
  y2: "6"
}), /*#__PURE__*/React.createElement("line", {
  x1: "3",
  y1: "10",
  x2: "21",
  y2: "10"
})));
const IconRefresh = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M21 12a9 9 0 1 1-9-9c2.5 0 4.8.9 6.5 2.5L21 8"
}), /*#__PURE__*/React.createElement("polyline", {
  points: "21 3 21 8 16 8"
})));
const IconAlert = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "m10.29 3.86-8.37 14.5A2 2 0 0 0 3.66 21h16.68a2 2 0 0 0 1.74-2.64l-8.37-14.5a2 2 0 0 0-3.42 0Z"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "9",
  x2: "12",
  y2: "13"
}), /*#__PURE__*/React.createElement("line", {
  x1: "12",
  y1: "17",
  x2: "12.01",
  y2: "17"
})));
const IconImage = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
  x: "3",
  y: "3",
  width: "18",
  height: "18",
  rx: "2"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "9",
  cy: "9",
  r: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "m21 15-3.1-3.1a2 2 0 0 0-2.83 0L6 21"
})));
const IconFireplace = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M12 2c2 3 4 5 4 8a4 4 0 1 1-8 0c0-3 2-5 4-8z"
})));
const IconGarage = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M3 12 12 3l9 9"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 12v8h14v-8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 16h6"
})));
const IconTerrace = SI(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
  d: "M12 22V12"
}), /*#__PURE__*/React.createElement("path", {
  d: "M5 10a7 7 0 0 1 14 0H5z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 22h18"
})));
const NAV_ICON = {
  dashboard: IconDashboard,
  properties: IconBuildings,
  matches: IconSparkles,
  activity: IconActivity,
  searches: IconSearches,
  settings: IconSettings
};

// ============================================================
// Primitives
// ============================================================

function Button({
  variant = "secondary",
  size = "md",
  children,
  onClick,
  disabled
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 6,
    fontWeight: 500,
    cursor: "pointer",
    userSelect: "none",
    transition: "background-color 100ms, color 100ms, opacity 100ms",
    fontFamily: "inherit",
    border: "1px solid transparent",
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto"
  };
  const sz = size === "sm" ? {
    height: 28,
    padding: "0 10px",
    fontSize: 12
  } : {
    height: 36,
    padding: "0 14px",
    fontSize: 13
  };
  const variants = {
    primary: {
      background: T.primary,
      color: "#FAFAF7"
    },
    secondary: {
      background: T.surface,
      color: T.text,
      borderColor: T.border
    },
    ghost: {
      background: "transparent",
      color: T.text
    },
    danger: {
      background: T.danger,
      color: "#FAFAF7"
    }
  };
  const [hover, setHover] = React.useState(false);
  const hoverStyles = {
    primary: {
      background: T.primaryHover
    },
    secondary: {
      background: T.surfaceMuted
    },
    ghost: {
      background: T.surfaceMuted
    },
    danger: {
      opacity: 0.9
    }
  };
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      ...base,
      ...sz,
      ...variants[variant],
      ...(hover && !disabled ? hoverStyles[variant] : {})
    }
  }, children);
}
function Badge({
  tone = "neutral",
  dot = false,
  children,
  icon
}) {
  const tones = {
    neutral: {
      bg: T.surfaceMuted,
      fg: T.textMuted,
      border: T.border
    },
    primary: {
      bg: T.primarySoft,
      fg: T.primary,
      border: "rgba(58,95,138,0.15)"
    },
    success: {
      bg: T.successSoft,
      fg: T.success,
      border: "rgba(45,106,79,0.15)"
    },
    warning: {
      bg: T.warningSoft,
      fg: T.warning,
      border: "rgba(168,106,23,0.20)"
    },
    danger: {
      bg: T.dangerSoft,
      fg: T.danger,
      border: "rgba(162,62,62,0.15)"
    },
    info: {
      bg: T.infoSoft,
      fg: T.info,
      border: "rgba(44,122,138,0.15)"
    }
  };
  const t = tones[tone];
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      background: t.bg,
      color: t.fg,
      border: `1px solid ${t.border}`,
      padding: "2px 6px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 500
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: 999,
      background: "currentColor",
      opacity: 0.7
    }
  }), icon, children);
}
const STATUS_MAP = {
  FOR_SALE: {
    tone: "info",
    label: "En venta"
  },
  RESERVED: {
    tone: "warning",
    label: "Reservado"
  },
  SOLD: {
    tone: "success",
    label: "Vendido"
  },
  WITHDRAWN: {
    tone: "neutral",
    label: "Retirado"
  },
  PRICE_DROP: {
    tone: "success",
    label: "Bajada de precio"
  },
  PRICE_UP: {
    tone: "danger",
    label: "Subida de precio"
  }
};
function StatusBadge({
  status
}) {
  const cfg = STATUS_MAP[status] ?? {
    tone: "neutral",
    label: status
  };
  return /*#__PURE__*/React.createElement(Badge, {
    tone: cfg.tone,
    dot: true
  }, cfg.label);
}
function PriceDelta({
  from,
  to,
  size = "sm",
  showAbsolute = false
}) {
  if (from == null || to == null || from === 0) {
    return /*#__PURE__*/React.createElement("span", {
      style: {
        color: T.textSubtle,
        fontSize: size === "sm" ? 12 : 13
      }
    }, "\u2014");
  }
  const diff = to - from;
  const pct = diff / from * 100;
  const dir = diff === 0 ? "flat" : diff > 0 ? "up" : "down";
  const palette = dir === "up" ? {
    bg: T.priceUpBg,
    fg: T.priceUpFg
  } : dir === "down" ? {
    bg: T.priceDownBg,
    fg: T.priceDownFg
  } : {
    bg: T.surfaceMuted,
    fg: T.textMuted
  };
  const Icon = dir === "up" ? IconUp : dir === "down" ? IconDown : IconMinus;
  const abs = Math.abs(diff);
  const fmt = abs.toLocaleString("es-ES") + " €";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      background: palette.bg,
      color: palette.fg,
      padding: size === "sm" ? "2px 6px" : "4px 8px",
      borderRadius: 6,
      fontSize: size === "sm" ? 12 : 13,
      fontWeight: 500,
      fontVariantNumeric: "tabular-nums"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    size: size === "sm" ? 11 : 13
  }), Math.abs(pct).toFixed(1), "%", showAbsolute && /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.7,
      marginLeft: 4
    }
  }, "\xB7 ", fmt));
}
function Card({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: "0 1px 2px rgba(20,20,18,0.04)",
      overflow: "hidden",
      ...style
    }
  }, children);
}
function CardHeader({
  title,
  meta,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "14px 20px",
      borderBottom: `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      color: T.text
    }
  }, title), meta || children);
}
function CardBody({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 20,
      fontSize: 13,
      color: T.text,
      ...style
    }
  }, children);
}
function Stat({
  label,
  value,
  hint
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: "0 1px 2px rgba(20,20,18,0.04)",
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: T.textSubtle
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 24,
      fontWeight: 600,
      letterSpacing: "-0.015em",
      color: T.text,
      fontVariantNumeric: "tabular-nums"
    }
  }, value), hint && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 11,
      color: T.textMuted
    }
  }, hint));
}
function PageHeader({
  title,
  description,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      paddingBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 24,
      lineHeight: "32px",
      fontWeight: 600,
      letterSpacing: "-0.015em",
      color: T.text
    }
  }, title), description && /*#__PURE__*/React.createElement("p", {
    style: {
      margin: "4px 0 0",
      fontSize: 13,
      color: T.textMuted
    }
  }, description)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, actions));
}

// ============================================================
// App shell — sidebar + topbar
// ============================================================

function Sidebar({
  current,
  onNavigate
}) {
  const items = [{
    id: "dashboard",
    label: "Dashboard"
  }, {
    id: "properties",
    label: "Inmuebles"
  }, {
    id: "matches",
    label: "Duplicados"
  }, {
    id: "activity",
    label: "Actividad"
  }, {
    id: "searches",
    label: "Búsquedas",
    disabled: true
  }];
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 224,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: `1px solid ${T.border}`,
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderBottom: `1px solid ${T.border}`,
      padding: "0 16px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.primarySoft,
      color: T.primary,
      boxShadow: "inset 0 0 0 1px rgba(58,95,138,0.15)"
    }
  }, /*#__PURE__*/React.createElement(IconKey, {
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: T.text
    }
  }, "BuySell"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textSubtle
    }
  }, "Asturias"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: "12px 8px"
    }
  }, items.map(it => {
    const Icon = NAV_ICON[it.id];
    const active = current === it.id;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => !it.disabled && onNavigate?.(it.id),
      disabled: it.disabled,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "6px 10px",
        marginBottom: 2,
        borderRadius: 6,
        border: 0,
        cursor: it.disabled ? "not-allowed" : "pointer",
        background: active ? T.primarySoft : "transparent",
        color: active ? T.primary : T.textMuted,
        fontWeight: active ? 500 : 400,
        fontSize: 13,
        textAlign: "left",
        opacity: it.disabled ? 0.5 : 1,
        fontFamily: "inherit"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 15,
      color: active ? T.primary : T.textSubtle
    }), it.label);
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${T.border}`,
      padding: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      width: "100%",
      padding: "6px 10px",
      borderRadius: 6,
      border: 0,
      background: "transparent",
      color: T.textMuted,
      fontSize: 13,
      cursor: "pointer",
      fontFamily: "inherit",
      textAlign: "left"
    }
  }, /*#__PURE__*/React.createElement(IconSettings, {
    size: 15,
    color: T.textSubtle
  }), " Ajustes")));
}
function Topbar({
  onNewProperty,
  searchValue,
  onSearchChange
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      borderBottom: `1px solid ${T.border}`,
      background: T.surface,
      padding: "0 24px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      width: "100%",
      maxWidth: 448
    }
  }, /*#__PURE__*/React.createElement(IconSearch, {
    size: 14,
    color: T.textSubtle,
    style: {
      position: "absolute",
      left: 12,
      top: "50%",
      transform: "translateY(-50%)"
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "search",
    value: searchValue ?? "",
    onChange: onSearchChange,
    placeholder: "Buscar inmuebles, direcciones, refs...",
    style: {
      height: 36,
      width: "100%",
      paddingLeft: 32,
      paddingRight: 12,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.bg,
      color: T.text,
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none"
    }
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onNewProperty
  }, /*#__PURE__*/React.createElement(IconPlus, {
    size: 14
  }), " Nuevo inmueble"));
}
function AppShell({
  current,
  onNavigate,
  children,
  onNewProperty
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      minHeight: "100vh",
      background: T.bg
    }
  }, /*#__PURE__*/React.createElement(Sidebar, {
    current: current,
    onNavigate: onNavigate
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement(Topbar, {
    onNewProperty: onNewProperty
  }), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: "32px 24px",
      minWidth: 0
    }
  }, children)));
}

// ============================================================
// Domain: PropertyCard, PropertyTable, FiltersSidebar, Chart
// ============================================================

function PropertyImage({
  photo,
  alt = "",
  style
}) {
  if (photo) {
    return /*#__PURE__*/React.createElement("img", {
      src: photo,
      alt: alt,
      referrerPolicy: "no-referrer",
      style: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        ...style
      }
    });
  }
  // Placeholder — sober warm-grey tile with a hint of a roof glyph
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "100%",
      background: T.surfaceMuted,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: T.textSubtle,
      ...style
    }
  }, /*#__PURE__*/React.createElement(IconImage, {
    size: 24
  }));
}
function PropertyCard({
  p,
  onClick
}) {
  const prev = p.priceHistory?.length >= 2 ? p.priceHistory.at(-2).price : null;
  const last = p.priceHistory?.length >= 1 ? p.priceHistory.at(-1).price : p.currentPrice;
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: "relative",
      overflow: "hidden",
      borderRadius: 8,
      border: `1px solid ${T.border}`,
      background: T.surface,
      boxShadow: hover ? "0 1px 3px rgba(20,20,18,0.06), 0 1px 2px rgba(20,20,18,0.04)" : "0 1px 2px rgba(20,20,18,0.04)",
      cursor: "pointer",
      transition: "box-shadow 100ms"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "4/3",
      background: T.surfaceMuted
    }
  }, /*#__PURE__*/React.createElement(PropertyImage, {
    photo: p.photo,
    alt: p.title
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 12,
      left: 12
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: p.status
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      color: T.text,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      marginTop: 8,
      fontSize: 12,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement(IconPin, {
    size: 11
  }), " ", p.neighborhood ? `${p.neighborhood}, ${p.city}` : p.city), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: T.text,
      fontVariantNumeric: "tabular-nums"
    }
  }, formatPrice(p.currentPrice)), /*#__PURE__*/React.createElement(PriceDelta, {
    from: prev,
    to: last
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginTop: 10,
      paddingTop: 10,
      borderTop: `1px solid ${T.border}`,
      fontSize: 12,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(IconBed, {
    size: 12
  }), p.rooms ?? "—"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(IconBath, {
    size: 12
  }), p.bathrooms ?? "—"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(IconArea, {
    size: 12
  }), p.builtArea ?? "—", " m\xB2"))));
}
function PropertyTable({
  rows,
  onRowClick
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      background: T.surface,
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(20,20,18,0.04)"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement("thead", {
    style: {
      background: "rgba(244,243,238,0.6)"
    }
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    style: th(20)
  }, "Inmueble"), /*#__PURE__*/React.createElement("th", {
    style: th()
  }, "Tipo"), /*#__PURE__*/React.createElement("th", {
    style: th()
  }, "Estado"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th(),
      textAlign: "right"
    }
  }, "Precio"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th(),
      textAlign: "right"
    }
  }, "\u0394"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th(),
      textAlign: "right"
    }
  }, "Hab."), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th(20, "right"),
      textAlign: "right"
    }
  }, "m\xB2"))), /*#__PURE__*/React.createElement("tbody", null, rows.map((r, i) => {
    const prev = r.priceHistory?.length >= 2 ? r.priceHistory.at(-2).price : null;
    const last = r.priceHistory?.length >= 1 ? r.priceHistory.at(-1).price : r.currentPrice;
    return /*#__PURE__*/React.createElement("tr", {
      key: r.id,
      onClick: () => onRowClick?.(r),
      style: {
        borderBottom: i === rows.length - 1 ? 0 : `1px solid ${T.border}`,
        cursor: "pointer"
      },
      onMouseEnter: e => e.currentTarget.style.background = "rgba(244,243,238,0.4)",
      onMouseLeave: e => e.currentTarget.style.background = "transparent"
    }, /*#__PURE__*/React.createElement("td", {
      style: td(20)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 56,
        height: 40,
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid ${T.border}`
      }
    }, /*#__PURE__*/React.createElement(PropertyImage, {
      photo: r.photo
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 500,
        color: T.text,
        fontSize: 13,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
      }
    }, r.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginTop: 2,
        fontSize: 12,
        color: T.textMuted
      }
    }, /*#__PURE__*/React.createElement(IconPin, {
      size: 11
    }), r.neighborhood ? `${r.neighborhood}, ${r.city}` : r.city)))), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td(),
        color: T.textMuted
      }
    }, TYPE_LABEL[r.type] ?? r.type), /*#__PURE__*/React.createElement("td", {
      style: td()
    }, /*#__PURE__*/React.createElement(StatusBadge, {
      status: r.status
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td(),
        textAlign: "right",
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums"
      }
    }, formatPrice(r.currentPrice)), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td(),
        textAlign: "right"
      }
    }, /*#__PURE__*/React.createElement(PriceDelta, {
      from: prev,
      to: last
    })), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td(),
        textAlign: "right",
        color: T.textMuted,
        fontVariantNumeric: "tabular-nums"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 4
      }
    }, /*#__PURE__*/React.createElement(IconBed, {
      size: 11
    }), r.rooms ?? "—")), /*#__PURE__*/React.createElement("td", {
      style: {
        ...td(20, "right"),
        textAlign: "right",
        color: T.textMuted,
        fontVariantNumeric: "tabular-nums"
      }
    }, r.builtArea ?? "—"));
  }))));
}
function th(pad = 12, side = "left") {
  const r = {
    padding: `8px 12px`,
    textAlign: "left",
    fontSize: 12,
    fontWeight: 500,
    color: T.textMuted,
    borderBottom: `1px solid ${T.border}`
  };
  if (side === "left") r.paddingLeft = pad;
  if (side === "right") r.paddingRight = pad;
  return r;
}
function td(pad = 12, side = "left") {
  const r = {
    padding: `12px`,
    color: T.text,
    verticalAlign: "middle"
  };
  if (side === "left") r.paddingLeft = pad;
  if (side === "right") r.paddingRight = pad;
  return r;
}
const TYPE_LABEL = {
  PISO: "Piso",
  HOUSE: "Casa",
  ATICO: "Ático",
  CHALET: "Chalet",
  DUPLEX: "Dúplex",
  ESTUDIO: "Estudio",
  LOFT: "Loft",
  LOCAL: "Local",
  TERRENO: "Terreno",
  OTRO: "Otro"
};
function formatPrice(cents) {
  if (cents == null) return "—";
  return Math.round(cents).toLocaleString("es-ES") + " €";
}

// ============================================================
// FiltersSidebar — properties list right rail
// ============================================================

function Field({
  label,
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "block"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      fontSize: 12,
      fontWeight: 500,
      color: T.textMuted,
      marginBottom: 6
    }
  }, label), children);
}
function Input(props) {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({}, props, {
    onFocus: e => {
      setFocus(true);
      props.onFocus?.(e);
    },
    onBlur: e => {
      setFocus(false);
      props.onBlur?.(e);
    },
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: "100%",
      height: 36,
      padding: "0 12px",
      border: `1px solid ${focus ? T.primary : hover ? T.borderStrong : T.border}`,
      borderRadius: 6,
      background: T.surface,
      color: T.text,
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none",
      transition: "border-color 100ms",
      ...props.style
    }
  }));
}
function Select({
  children,
  ...props
}) {
  return /*#__PURE__*/React.createElement("select", _extends({}, props, {
    style: {
      width: "100%",
      height: 36,
      padding: "0 32px 0 12px",
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.surface,
      color: T.text,
      fontSize: 13,
      fontFamily: "inherit",
      outline: "none",
      appearance: "none",
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236B6862' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 10px center"
    }
  }), children);
}
function FiltersSidebar({
  filters,
  onChange,
  onClear,
  onApply
}) {
  const f = filters;
  return /*#__PURE__*/React.createElement("aside", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: "0 1px 2px rgba(20,20,18,0.04)",
      padding: 16,
      alignSelf: "flex-start",
      position: "sticky",
      top: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      color: T.text
    }
  }, "Filtros"), /*#__PURE__*/React.createElement("button", {
    onClick: onClear,
    style: {
      background: "transparent",
      border: 0,
      padding: 0,
      cursor: "pointer",
      color: T.textMuted,
      fontSize: 12,
      fontFamily: "inherit"
    }
  }, "Limpiar")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Ciudad"
  }, /*#__PURE__*/React.createElement(Input, {
    placeholder: "Oviedo, Gij\xF3n...",
    value: f.city ?? "",
    onChange: e => onChange("city", e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Tipo"
  }, /*#__PURE__*/React.createElement(Select, {
    value: f.type ?? "",
    onChange: e => onChange("type", e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Todos"), /*#__PURE__*/React.createElement("option", {
    value: "PISO"
  }, "Piso"), /*#__PURE__*/React.createElement("option", {
    value: "HOUSE"
  }, "Casa"), /*#__PURE__*/React.createElement("option", {
    value: "ATICO"
  }, "\xC1tico"), /*#__PURE__*/React.createElement("option", {
    value: "CHALET"
  }, "Chalet"))), /*#__PURE__*/React.createElement(Field, {
    label: "Estado"
  }, /*#__PURE__*/React.createElement(Select, {
    value: f.status ?? "",
    onChange: e => onChange("status", e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Cualquiera"), /*#__PURE__*/React.createElement("option", {
    value: "FOR_SALE"
  }, "En venta"), /*#__PURE__*/React.createElement("option", {
    value: "RESERVED"
  }, "Reservado"), /*#__PURE__*/React.createElement("option", {
    value: "SOLD"
  }, "Vendido")))), /*#__PURE__*/React.createElement(Field, {
    label: "Precio (\u20AC)"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Input, {
    type: "number",
    placeholder: "M\xEDn",
    value: f.minPrice ?? "",
    onChange: e => onChange("minPrice", e.target.value)
  }), /*#__PURE__*/React.createElement(Input, {
    type: "number",
    placeholder: "M\xE1x",
    value: f.maxPrice ?? "",
    onChange: e => onChange("maxPrice", e.target.value)
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Habitaciones m\xEDn."
  }, /*#__PURE__*/React.createElement(Select, {
    value: f.minRooms ?? "",
    onChange: e => onChange("minRooms", e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Cualquiera"), [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("option", {
    key: n,
    value: n
  }, n, "+")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 6,
      fontSize: 12,
      fontWeight: 500,
      color: T.textMuted
    }
  }, "Caracter\xEDsticas"), [["hasFireplace", "Chimenea"], ["hasGarage", "Garaje"], ["hasTerrace", "Terraza"]].map(([k, l]) => /*#__PURE__*/React.createElement("label", {
    key: k,
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 13,
      color: T.text,
      marginTop: 6,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!f[k],
    onChange: e => onChange(k, e.target.checked),
    style: {
      width: 16,
      height: 16,
      accentColor: T.primary,
      cursor: "pointer"
    }
  }), l)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    onClick: onApply
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      textAlign: "center"
    }
  }, "Aplicar filtros"))));
}

// ============================================================
// Price history chart — hand-rolled, matches the Recharts look
// ============================================================

function PriceHistoryChart({
  data,
  height = 200
}) {
  if (!data?.length) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: T.textSubtle
      }
    }, "Sin hist\xF3rico de precios.");
  }
  const w = 600,
    h = height;
  const pad = {
    l: 40,
    r: 12,
    t: 8,
    b: 22
  };
  const prices = data.map(d => d.price);
  const min = Math.min(...prices),
    max = Math.max(...prices);
  const range = max - min || 1;
  const padY = range * 0.15;
  const yMin = min - padY,
    yMax = max + padY;
  const x = i => pad.l + i * (w - pad.l - pad.r) / (data.length - 1 || 1);
  const y = v => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - pad.t - pad.b);
  const pathLine = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.price)}`).join(" ");
  const pathArea = `${pathLine} L ${x(data.length - 1)} ${h - pad.b} L ${x(0)} ${h - pad.b} Z`;
  // Y-axis ticks (3)
  const yTicks = [0, 0.5, 1].map(t => yMin + t * (yMax - yMin));
  // X labels — first, middle, last
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1].map(i => ({
    x: x(i),
    label: new Date(data[i].observedAt).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short"
    })
  }));
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${w} ${h}`,
    style: {
      width: "100%",
      height
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "priceFill",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "1"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0%",
    stopColor: T.primary,
    stopOpacity: "0.18"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "100%",
    stopColor: T.primary,
    stopOpacity: "0"
  }))), yTicks.map((v, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: pad.l,
    x2: w - pad.r,
    y1: y(v),
    y2: y(v),
    stroke: T.border,
    strokeDasharray: "3 3"
  })), yTicks.map((v, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: pad.l - 6,
    y: y(v) + 4,
    fill: T.textSubtle,
    fontSize: "11",
    textAnchor: "end",
    fontFamily: "inherit"
  }, (v / 1000).toFixed(0), "k")), xLabels.map((l, i) => /*#__PURE__*/React.createElement("text", {
    key: i,
    x: l.x,
    y: h - 6,
    fill: T.textSubtle,
    fontSize: "11",
    textAnchor: "middle",
    fontFamily: "inherit"
  }, l.label)), /*#__PURE__*/React.createElement("path", {
    d: pathArea,
    fill: "url(#priceFill)"
  }), /*#__PURE__*/React.createElement("path", {
    d: pathLine,
    fill: "none",
    stroke: T.primary,
    strokeWidth: "2"
  }));
}

// ============================================================
// Export to window so sibling Babel scripts can use them
// ============================================================

Object.assign(window, {
  T,
  IconKey,
  IconDashboard,
  IconBuildings,
  IconSparkles,
  IconActivity,
  IconSearches,
  IconSettings,
  IconPlus,
  IconSearch,
  IconPin,
  IconBed,
  IconBath,
  IconArea,
  IconUp,
  IconDown,
  IconMinus,
  IconBack,
  IconEdit,
  IconExt,
  IconCalendar,
  IconRefresh,
  IconAlert,
  IconImage,
  IconFireplace,
  IconGarage,
  IconTerrace,
  Button,
  Badge,
  StatusBadge,
  PriceDelta,
  Card,
  CardHeader,
  CardBody,
  Stat,
  PageHeader,
  Sidebar,
  Topbar,
  AppShell,
  PropertyCard,
  PropertyTable,
  PropertyImage,
  Field,
  Input,
  Select,
  FiltersSidebar,
  PriceHistoryChart,
  TYPE_LABEL,
  STATUS_MAP,
  formatPrice
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/web/screens.jsx
try { (() => {
/* global React, T, IconKey, IconPlus, IconSearch, IconPin, IconBed, IconBath, IconArea, IconUp, IconDown, IconMinus, IconBack, IconEdit, IconExt, IconCalendar, IconRefresh, IconAlert, IconImage, IconFireplace, IconGarage, IconTerrace, IconSparkles, IconActivity, Button, Badge, StatusBadge, PriceDelta, Card, CardHeader, CardBody, Stat, PageHeader, AppShell, PropertyCard, PropertyTable, PropertyImage, FiltersSidebar, PriceHistoryChart, formatPrice, TYPE_LABEL */
/* eslint-disable react/prop-types */

// ============================================================
// Mock data — small but representative
// ============================================================

const PROPERTIES = [{
  id: "p1",
  title: "Piso reformado con terraza",
  type: "PISO",
  status: "FOR_SALE",
  city: "Oviedo",
  neighborhood: "Centro",
  province: "Asturias",
  address: "Calle Uría, 14, 3ºB",
  postalCode: "33003",
  currentPrice: 385000,
  rooms: 3,
  bathrooms: 2,
  builtArea: 92,
  usableArea: 84,
  plotArea: null,
  floor: "3ºB",
  yearBuilt: 1962,
  energyRating: "D",
  hasElevator: true,
  hasGarage: false,
  hasStorage: true,
  hasTerrace: true,
  hasFireplace: false,
  hasGarden: false,
  hasPool: false,
  description: "Piso completamente reformado en pleno centro de Oviedo. Tres habitaciones, dos baños, cocina office y una amplia terraza orientada al sur. A dos minutos andando de la estación de tren.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-10-01",
    price: 410000
  }, {
    observedAt: "2025-11-15",
    price: 405000
  }, {
    observedAt: "2025-12-20",
    price: 395000
  }, {
    observedAt: "2026-01-10",
    price: 390000
  }, {
    observedAt: "2026-01-22",
    price: 385000
  }],
  listings: [{
    portal: "IDEALISTA",
    url: "#",
    lastPrice: 385000,
    status: "PRICE_DROP",
    lastCheckedAt: "Hoy"
  }, {
    portal: "FOTOCASA",
    url: "#",
    lastPrice: 385000,
    status: "ACTIVE",
    lastCheckedAt: "Hace 2 días"
  }, {
    portal: "PISOS_COM",
    url: "#",
    lastPrice: 390000,
    status: "ACTIVE",
    lastCheckedAt: "Hace 4 días"
  }]
}, {
  id: "p2",
  title: "Chalet con jardín en Llanes",
  type: "CHALET",
  status: "RESERVED",
  city: "Llanes",
  neighborhood: "Poo",
  province: "Asturias",
  address: "Camino del Puerto, 7",
  postalCode: "33509",
  currentPrice: 620000,
  rooms: 4,
  bathrooms: 3,
  builtArea: 180,
  usableArea: 165,
  plotArea: 480,
  floor: "—",
  yearBuilt: 2008,
  energyRating: "C",
  hasElevator: false,
  hasGarage: true,
  hasStorage: true,
  hasTerrace: true,
  hasFireplace: true,
  hasGarden: true,
  hasPool: false,
  description: "Chalet independiente a 800 m de la playa de Poo. Jardín privado de 480 m², garaje doble, chimenea de leña.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-09-12",
    price: 650000
  }, {
    observedAt: "2025-11-04",
    price: 635000
  }, {
    observedAt: "2026-01-08",
    price: 620000
  }],
  listings: [{
    portal: "IDEALISTA",
    url: "#",
    lastPrice: 620000,
    status: "ACTIVE",
    lastCheckedAt: "Hace 1 día"
  }]
}, {
  id: "p3",
  title: "Ático con vistas a la playa",
  type: "ATICO",
  status: "SOLD",
  city: "Gijón",
  neighborhood: "El Llano",
  province: "Asturias",
  address: "Av. del Llano, 142, 8ºA",
  postalCode: "33209",
  currentPrice: 295000,
  rooms: 2,
  bathrooms: 1,
  builtArea: 68,
  usableArea: 62,
  plotArea: null,
  floor: "8ºA",
  yearBuilt: 1975,
  energyRating: "E",
  hasElevator: true,
  hasGarage: false,
  hasStorage: false,
  hasTerrace: true,
  hasFireplace: false,
  hasGarden: false,
  hasPool: false,
  description: "Ático con terraza panorámica orientada al norte. Vistas despejadas al Cantábrico.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-08-20",
    price: 320000
  }, {
    observedAt: "2025-10-12",
    price: 310000
  }, {
    observedAt: "2025-12-01",
    price: 295000
  }, {
    observedAt: "2026-01-15",
    price: 295000
  }],
  listings: [{
    portal: "FOTOCASA",
    url: "#",
    lastPrice: 295000,
    status: "REMOVED",
    lastCheckedAt: "Hace 8 días"
  }]
}, {
  id: "p4",
  title: "Casa de pueblo con hórreo",
  type: "HOUSE",
  status: "FOR_SALE",
  city: "Cangas de Onís",
  neighborhood: null,
  province: "Asturias",
  address: "Lugar Margolles, s/n",
  postalCode: "33556",
  currentPrice: 178000,
  rooms: 4,
  bathrooms: 2,
  builtArea: 145,
  usableArea: 132,
  plotArea: 320,
  floor: "—",
  yearBuilt: 1934,
  energyRating: "G",
  hasElevator: false,
  hasGarage: false,
  hasStorage: true,
  hasTerrace: false,
  hasFireplace: true,
  hasGarden: true,
  hasPool: false,
  description: "Casa tradicional con hórreo de cuatro pegollos en el jardín. Necesita reforma.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-11-20",
    price: 185000
  }, {
    observedAt: "2026-01-05",
    price: 178000
  }],
  listings: [{
    portal: "MILANUNCIOS",
    url: "#",
    lastPrice: 178000,
    status: "ACTIVE",
    lastCheckedAt: "Hace 12 días"
  }]
}, {
  id: "p5",
  title: "Estudio en zona universitaria",
  type: "ESTUDIO",
  status: "FOR_SALE",
  city: "Oviedo",
  neighborhood: "La Tenderina",
  province: "Asturias",
  address: "Calle La Lila, 38, 1º",
  postalCode: "33006",
  currentPrice: 89000,
  rooms: 1,
  bathrooms: 1,
  builtArea: 32,
  usableArea: 28,
  plotArea: null,
  floor: "1º",
  yearBuilt: 1985,
  energyRating: "E",
  hasElevator: false,
  hasGarage: false,
  hasStorage: false,
  hasTerrace: false,
  hasFireplace: false,
  hasGarden: false,
  hasPool: false,
  description: "Estudio compacto, ideal para inversión.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-12-15",
    price: 92000
  }, {
    observedAt: "2026-01-18",
    price: 89000
  }],
  listings: [{
    portal: "HABITACLIA",
    url: "#",
    lastPrice: 89000,
    status: "PRICE_DROP",
    lastCheckedAt: "Hoy"
  }]
}, {
  id: "p6",
  title: "Dúplex en Avilés con plaza de garaje",
  type: "DUPLEX",
  status: "FOR_SALE",
  city: "Avilés",
  neighborhood: "La Magdalena",
  province: "Asturias",
  address: "Calle Doctor Graíño, 6, ático",
  postalCode: "33402",
  currentPrice: 215000,
  rooms: 3,
  bathrooms: 2,
  builtArea: 105,
  usableArea: 96,
  plotArea: null,
  floor: "Ático",
  yearBuilt: 1998,
  energyRating: "D",
  hasElevator: true,
  hasGarage: true,
  hasStorage: true,
  hasTerrace: true,
  hasFireplace: false,
  hasGarden: false,
  hasPool: false,
  description: "Dúplex luminoso con dos terrazas y plaza de garaje incluida.",
  photo: null,
  priceHistory: [{
    observedAt: "2025-11-01",
    price: 220000
  }, {
    observedAt: "2026-01-12",
    price: 215000
  }],
  listings: [{
    portal: "PISOS_COM",
    url: "#",
    lastPrice: 215000,
    status: "ACTIVE",
    lastCheckedAt: "Hace 3 días"
  }]
}];
const PORTAL_LABEL = {
  IDEALISTA: "Idealista",
  FOTOCASA: "Fotocasa",
  PISOS_COM: "Pisos.com",
  MILANUNCIOS: "Milanuncios",
  HABITACLIA: "Habitaclia",
  YAENCONTRE: "Yaencontre",
  THINKSPAIN: "ThinkSPAIN",
  INDOMIO: "Indomio",
  OTHER: "Otro",
  MANUAL: "Manual"
};

// ============================================================
// Dashboard screen
// ============================================================

function DashboardScreen({
  onOpenProperty
}) {
  const totalActive = PROPERTIES.filter(p => p.status === "FOR_SALE").length;
  const totalSold = PROPERTIES.filter(p => p.status === "SOLD").length;
  const totalReserved = PROPERTIES.filter(p => p.status === "RESERVED").length;
  const totalListings = PROPERTIES.reduce((s, p) => s + p.listings.length, 0);
  const portalCounts = {};
  PROPERTIES.forEach(p => p.listings.forEach(l => {
    portalCounts[l.portal] = (portalCounts[l.portal] ?? 0) + 1;
  }));
  const portals = Object.entries(portalCounts).sort((a, b) => b[1] - a[1]);
  const cityPpsqm = [{
    city: "Oviedo",
    avg: 2820,
    count: 8
  }, {
    city: "Gijón",
    avg: 2640,
    count: 6
  }, {
    city: "Avilés",
    avg: 1980,
    count: 4
  }, {
    city: "Llanes",
    avg: 3240,
    count: 3
  }, {
    city: "Cangas",
    avg: 1240,
    count: 2
  }];
  const attentionItems = [{
    Icon: IconRefresh,
    label: "Listings sin re-check >7 días (auto)",
    count: 4,
    hint: "Ejecuta npm run check-listings"
  }, {
    Icon: IconRefresh,
    label: "Listings sin re-check >7 días (manual)",
    count: 2,
    hint: "Idealista / Milanuncios — usa el userscript"
  }, {
    Icon: IconSparkles,
    label: "Duplicados pendientes de revisar",
    count: 3,
    hint: null
  }, {
    Icon: IconImage,
    label: "Fotos sin foto-hash",
    count: 7,
    hint: "Ejecuta npm run hash-photos"
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Dashboard",
    description: "Visi\xF3n general de inmuebles, portales y matching"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "En venta",
    value: totalActive
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Vendidos",
    value: totalSold
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Retirados",
    value: totalReserved
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Listings",
    value: totalListings,
    hint: `en ${portals.length} portales`
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 2fr",
      gap: 16,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Por portal"
  }), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 10
    }
  }, portals.map(([portal, count]) => {
    const pct = count / totalListings * 100;
    return /*#__PURE__*/React.createElement("div", {
      key: portal
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: 12,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        color: T.text
      }
    }, PORTAL_LABEL[portal] ?? portal), /*#__PURE__*/React.createElement("span", {
      style: {
        color: T.textMuted,
        fontVariantNumeric: "tabular-nums"
      }
    }, count)), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6,
        background: T.surfaceMuted,
        borderRadius: 999,
        overflow: "hidden"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        background: T.primary,
        width: `${pct}%`
      }
    })));
  })))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "\u20AC/m\xB2 medio por ciudad"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: T.textMuted
    }
  }, "Top 5 con \u2265 2 fichas")), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: 8
    }
  }, cityPpsqm.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.city,
    style: {
      background: T.surfaceMuted,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.textMuted,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis"
    }
  }, r.city), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600,
      color: T.text,
      marginTop: 2,
      fontVariantNumeric: "tabular-nums"
    }
  }, r.avg.toLocaleString("es-ES"), " \u20AC/m\xB2"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: T.textSubtle,
      marginTop: 1,
      fontVariantNumeric: "tabular-nums"
    }
  }, r.count, " fichas"))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement(IconAlert, {
      size: 14,
      color: T.warning
    }), " Necesita atenci\xF3n")
  }), /*#__PURE__*/React.createElement(CardBody, {
    style: {
      padding: 16
    }
  }, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: "none",
      display: "flex",
      flexDirection: "column",
      gap: 8
    }
  }, attentionItems.map((it, i) => /*#__PURE__*/React.createElement("li", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.surface,
      padding: "8px 10px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: T.textSubtle,
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(it.Icon, {
    size: 13
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: T.text,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis"
    }
  }, it.label), it.hint && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textSubtle,
      overflow: "hidden",
      whiteSpace: "nowrap",
      textOverflow: "ellipsis"
    }
  }, it.hint))), /*#__PURE__*/React.createElement(Badge, {
    tone: it.count > 0 ? "warning" : "neutral"
  }, it.count)))))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Actividad reciente (30 d)"
  }), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 32,
      fontWeight: 600,
      color: T.text,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.02em"
    }
  }, "42"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.textMuted,
      marginTop: 4
    }
  }, "snapshots de precio registrados en los \xFAltimos 30 d\xEDas"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontSize: 12,
      color: T.primary,
      textDecoration: "none"
    },
    onClick: e => e.preventDefault()
  }, "Ver actividad detallada \u2192"))))));
}

// ============================================================
// Properties list screen — table or grid view
// ============================================================

function PropertiesScreen({
  onOpenProperty
}) {
  const [view, setView] = React.useState("table");
  const [sort, setSort] = React.useState("updatedAt-desc");
  const [filters, setFilters] = React.useState({});
  const onChange = (k, v) => setFilters(f => ({
    ...f,
    [k]: v === "" || v === false ? undefined : v
  }));
  const onClear = () => setFilters({});
  const filtered = React.useMemo(() => {
    return PROPERTIES.filter(p => {
      if (filters.city && !p.city.toLowerCase().includes(String(filters.city).toLowerCase())) return false;
      if (filters.type && p.type !== filters.type) return false;
      if (filters.status && p.status !== filters.status) return false;
      if (filters.minPrice && p.currentPrice < +filters.minPrice) return false;
      if (filters.maxPrice && p.currentPrice > +filters.maxPrice) return false;
      if (filters.minRooms && (p.rooms ?? 0) < +filters.minRooms) return false;
      if (filters.hasFireplace && !p.hasFireplace) return false;
      if (filters.hasGarage && !p.hasGarage) return false;
      if (filters.hasTerrace && !p.hasTerrace) return false;
      return true;
    });
  }, [filters]);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Inmuebles",
    description: `${filtered.length} ${filtered.length === 1 ? "ficha" : "fichas"} registradas`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 280px",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      boxShadow: "0 1px 2px rgba(20,20,18,0.04)",
      padding: "8px 12px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement("span", null, "Ordenar por"), /*#__PURE__*/React.createElement("select", {
    value: sort,
    onChange: e => setSort(e.target.value),
    style: {
      height: 28,
      padding: "0 24px 0 8px",
      border: `1px solid ${T.border}`,
      borderRadius: 6,
      background: T.surface,
      color: T.text,
      fontSize: 12,
      fontFamily: "inherit",
      outline: "none",
      appearance: "none",
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6862' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 6px center"
    }
  }, /*#__PURE__*/React.createElement("option", {
    value: "updatedAt-desc"
  }, "M\xE1s recientes"), /*#__PURE__*/React.createElement("option", {
    value: "currentPrice-asc"
  }, "Precio: menor"), /*#__PURE__*/React.createElement("option", {
    value: "currentPrice-desc"
  }, "Precio: mayor"), /*#__PURE__*/React.createElement("option", {
    value: "createdAt-desc"
  }, "Creaci\xF3n"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      borderRadius: 6,
      overflow: "hidden",
      border: `1px solid ${T.border}`
    }
  }, [["table", "Tabla"], ["grid", "Cuadrícula"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    onClick: () => setView(v),
    style: {
      padding: "5px 12px",
      fontSize: 12,
      background: view === v ? T.surfaceMuted : T.surface,
      color: view === v ? T.text : T.textMuted,
      border: 0,
      cursor: "pointer",
      fontFamily: "inherit",
      fontWeight: view === v ? 500 : 400
    }
  }, l)))), view === "table" ? /*#__PURE__*/React.createElement(PropertyTable, {
    rows: filtered,
    onRowClick: r => onOpenProperty(r.id)
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 16
    }
  }, filtered.map(p => /*#__PURE__*/React.createElement(PropertyCard, {
    key: p.id,
    p: p,
    onClick: () => onOpenProperty(p.id)
  })))), /*#__PURE__*/React.createElement(FiltersSidebar, {
    filters: filters,
    onChange: onChange,
    onClear: onClear,
    onApply: () => {/* state already applied */}
  })));
}

// ============================================================
// Property detail screen
// ============================================================

const FEATURE_DEFS = [{
  key: "hasElevator",
  label: "Ascensor",
  Icon: IconArea
}, {
  key: "hasGarage",
  label: "Garaje",
  Icon: IconGarage
}, {
  key: "hasStorage",
  label: "Trastero",
  Icon: IconArea
}, {
  key: "hasTerrace",
  label: "Terraza",
  Icon: IconTerrace
}, {
  key: "hasFireplace",
  label: "Chimenea",
  Icon: IconFireplace
}, {
  key: "hasGarden",
  label: "Jardín",
  Icon: IconTerrace
}, {
  key: "hasPool",
  label: "Piscina",
  Icon: IconArea
}];
function PropertyDetailScreen({
  propertyId,
  onBack
}) {
  const p = PROPERTIES.find(x => x.id === propertyId) ?? PROPERTIES[0];
  const prev = p.priceHistory.length >= 2 ? p.priceHistory.at(-2).price : null;
  const first = p.priceHistory[0]?.price ?? null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: p.title,
    description: [TYPE_LABEL[p.type], p.neighborhood, p.city, p.province].filter(Boolean).join(" · "),
    actions: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      size: "sm",
      onClick: onBack
    }, /*#__PURE__*/React.createElement(IconBack, {
      size: 13
    }), " Volver"), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm"
    }, /*#__PURE__*/React.createElement(IconEdit, {
      size: 13
    }), " Editar"))
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 320px",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      aspectRatio: "16/10",
      borderRadius: 8,
      border: `1px solid ${T.border}`,
      background: T.surfaceMuted,
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement(PropertyImage, {
    photo: p.photo
  })), p.description && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Descripci\xF3n"
  }), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.5,
      color: T.text,
      whiteSpace: "pre-wrap"
    }
  }, p.description))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Hist\xF3rico de precio"
  }, /*#__PURE__*/React.createElement(PriceDelta, {
    from: first,
    to: p.currentPrice,
    showAbsolute: true
  })), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement(PriceHistoryChart, {
    data: p.priceHistory
  })))), /*#__PURE__*/React.createElement("aside", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(StatusBadge, {
    status: p.status
  }), p.priceHistory.length >= 2 && /*#__PURE__*/React.createElement(PriceDelta, {
    from: prev,
    to: p.currentPrice
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      fontSize: 32,
      fontWeight: 600,
      color: T.text,
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "-0.02em",
      lineHeight: 1.1
    }
  }, formatPrice(p.currentPrice)), p.builtArea && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: T.textMuted
    }
  }, Math.round(p.currentPrice / p.builtArea).toLocaleString("es-ES"), " \u20AC/m\xB2"))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Caracter\xEDsticas"
  }), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("dl", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      columnGap: 16,
      rowGap: 8,
      fontSize: 13,
      margin: 0
    }
  }, /*#__PURE__*/React.createElement(Spec, {
    label: "Tipo",
    value: TYPE_LABEL[p.type]
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "Habitaciones",
    value: p.rooms ?? "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "Ba\xF1os",
    value: p.bathrooms ?? "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "Construidos",
    value: p.builtArea ? `${p.builtArea} m²` : "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "\xDAtiles",
    value: p.usableArea ? `${p.usableArea} m²` : "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "Parcela",
    value: p.plotArea ? `${p.plotArea} m²` : "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "Planta",
    value: p.floor ?? "—"
  }), /*#__PURE__*/React.createElement(Spec, {
    label: "A\xF1o",
    value: p.yearBuilt ?? "—"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      color: T.textMuted,
      marginBottom: 8
    }
  }, "Extras"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: 6
    }
  }, FEATURE_DEFS.filter(f => p[f.key]).map(f => /*#__PURE__*/React.createElement(Badge, {
    key: f.key,
    tone: "primary"
  }, f.label)), FEATURE_DEFS.every(f => !p[f.key]) && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: T.textSubtle
    }
  }, "Sin extras marcados"))), p.energyRating && p.energyRating !== "UNKNOWN" && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: `1px solid ${T.border}`,
      fontSize: 12,
      color: T.textMuted
    }
  }, "Certificaci\xF3n energ\xE9tica: ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 500,
      color: T.text
    }
  }, p.energyRating)))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Ubicaci\xF3n"
  }), /*#__PURE__*/React.createElement(CardBody, {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      fontSize: 13
    }
  }, p.address && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      color: T.text
    }
  }, /*#__PURE__*/React.createElement(IconPin, {
    size: 13,
    color: T.textSubtle,
    style: {
      marginTop: 2
    }
  }), /*#__PURE__*/React.createElement("span", null, p.address)), /*#__PURE__*/React.createElement("div", {
    style: {
      color: T.textMuted
    }
  }, p.neighborhood ? `${p.neighborhood}, ` : "", p.postalCode ? `${p.postalCode} ` : "", p.city), /*#__PURE__*/React.createElement("div", {
    style: {
      color: T.textMuted
    }
  }, p.province, ", Espa\xF1a"))), p.listings.length > 0 && /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement(CardHeader, {
    title: "Anuncios vinculados"
  }), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, p.listings.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      paddingBottom: i === p.listings.length - 1 ? 0 : 12,
      borderBottom: i === p.listings.length - 1 ? 0 : `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: l.url,
    onClick: e => e.preventDefault(),
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 13,
      fontWeight: 500,
      color: T.primary,
      textDecoration: "none"
    }
  }, PORTAL_LABEL[l.portal] ?? l.portal, " ", /*#__PURE__*/React.createElement(IconExt, {
    size: 11
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 12,
      color: T.textMuted,
      fontVariantNumeric: "tabular-nums"
    }
  }, formatPrice(l.lastPrice), " \xB7 revisado ", l.lastCheckedAt)), /*#__PURE__*/React.createElement(StatusBadge, {
    status: l.status
  })))))))));
}
function Spec({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("dt", {
    style: {
      color: T.textMuted,
      fontSize: 13
    }
  }, label), /*#__PURE__*/React.createElement("dd", {
    style: {
      margin: 0,
      textAlign: "right",
      fontWeight: 500,
      color: T.text,
      fontVariantNumeric: "tabular-nums",
      fontSize: 13
    }
  }, value));
}

// ============================================================
// Matches / activity — minimal placeholder screens
// ============================================================

function ActivityScreen() {
  const events = [{
    day: "Hoy",
    items: [{
      dir: "down",
      title: "Piso reformado con terraza",
      city: "Oviedo",
      prev: 390000,
      cur: 385000,
      portal: "IDEALISTA",
      when: "Hoy"
    }, {
      dir: "down",
      title: "Estudio en zona universitaria",
      city: "Oviedo",
      prev: 92000,
      cur: 89000,
      portal: "HABITACLIA",
      when: "Hoy"
    }]
  }, {
    day: "22 enero 2026",
    items: [{
      dir: "sold",
      title: "Ático con vistas a la playa",
      city: "Gijón",
      prev: 295000,
      cur: 295000,
      portal: "FOTOCASA",
      when: "Ayer"
    }]
  }, {
    day: "15 enero 2026",
    items: [{
      dir: "up",
      title: "Casa de pueblo con hórreo",
      city: "Cangas de Onís",
      prev: 175000,
      cur: 178000,
      portal: "MILANUNCIOS",
      when: "Hace 8 días"
    }, {
      dir: "flat",
      title: "Dúplex en Avilés con plaza de garaje",
      city: "Avilés",
      prev: 215000,
      cur: 215000,
      portal: "PISOS_COM",
      when: "Hace 8 días"
    }]
  }];
  const cfg = {
    up: {
      wrap: {
        background: T.priceUpBg,
        color: T.priceUpFg
      },
      Icon: IconUp,
      label: "Subida de precio"
    },
    down: {
      wrap: {
        background: T.priceDownBg,
        color: T.priceDownFg
      },
      Icon: IconDown,
      label: "Bajada de precio"
    },
    flat: {
      wrap: {
        background: T.surfaceMuted,
        color: T.textMuted
      },
      Icon: IconMinus,
      label: "Sin cambio"
    },
    sold: {
      wrap: {
        background: T.successSoft,
        color: T.success
      },
      Icon: IconActivity,
      label: "Marcado como vendido"
    }
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Actividad",
    description: "Cambios de precio, transiciones de estado y eventos de scraping."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(Stat, {
    label: "Bajadas (30d)",
    value: "5",
    hint: "Inmuebles con precio reducido"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Subidas (30d)",
    value: "1",
    hint: "Inmuebles con precio aumentado"
  }), /*#__PURE__*/React.createElement(Stat, {
    label: "Vendidos (30d)",
    value: "1",
    hint: "Anuncios marcados vendidos"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      display: "flex",
      flexDirection: "column",
      gap: 32
    }
  }, events.map(section => /*#__PURE__*/React.createElement("section", {
    key: section.day
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: "0 0 12px",
      fontSize: 11,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      color: T.textSubtle
    }
  }, section.day), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      padding: 0,
      listStyle: "none"
    }
  }, section.items.map((ev, i) => {
    const c = cfg[ev.dir];
    return /*#__PURE__*/React.createElement("li", {
      key: i,
      style: {
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 20px",
        borderBottom: i === section.items.length - 1 ? 0 : `1px solid ${T.border}`
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: 28,
        height: 28,
        borderRadius: 999,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...c.wrap
      }
    }, /*#__PURE__*/React.createElement(c.Icon, {
      size: 13
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500,
        color: T.text
      }
    }, ev.title), /*#__PURE__*/React.createElement("span", {
      style: {
        color: T.textSubtle,
        marginLeft: 8
      }
    }, "\xB7 ", ev.city)), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 2,
        fontSize: 12,
        color: T.textMuted
      }
    }, c.label, ev.prev != null && ev.dir !== "flat" && /*#__PURE__*/React.createElement(React.Fragment, null, " — ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontVariantNumeric: "tabular-nums"
      }
    }, formatPrice(ev.prev)), " → ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 500,
        color: T.text,
        fontVariantNumeric: "tabular-nums"
      }
    }, formatPrice(ev.cur))))), /*#__PURE__*/React.createElement(Badge, null, PORTAL_LABEL[ev.portal]), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 80,
        textAlign: "right",
        fontSize: 11,
        color: T.textSubtle,
        fontVariantNumeric: "tabular-nums"
      }
    }, ev.when));
  })))))));
}
function MatchesScreen() {
  const pairs = [{
    score: 91,
    reasons: ["Foto-hash idéntico", "Dirección coincide", "Precio ±2%"],
    a: PROPERTIES[0],
    b: {
      ...PROPERTIES[0],
      title: "Magnífico piso reformado, centro Oviedo",
      listings: [{
        portal: "FOTOCASA"
      }]
    }
  }, {
    score: 73,
    reasons: ["Mismas habitaciones y m²", "Misma ciudad y barrio"],
    a: PROPERTIES[1],
    b: {
      ...PROPERTIES[1],
      title: "Casa con jardín cerca de la playa de Poo",
      listings: [{
        portal: "PISOS_COM"
      }]
    }
  }];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(PageHeader, {
    title: "Posibles duplicados",
    description: `${pairs.length} pares pendientes de revisión`
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, pairs.map((m, i) => /*#__PURE__*/React.createElement(Card, {
    key: i
  }, /*#__PURE__*/React.createElement(CardHeader, {
    title: `Coincidencia ${m.score}%`
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "Descartar"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "primary"
  }, "Fusionar"))), /*#__PURE__*/React.createElement(CardBody, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      flexWrap: "wrap",
      marginBottom: 16
    }
  }, m.reasons.map((r, j) => /*#__PURE__*/React.createElement(Badge, {
    key: j,
    tone: "primary"
  }, r))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 16
    }
  }, [m.a, m.b].map((side, j) => /*#__PURE__*/React.createElement("div", {
    key: j,
    style: {
      display: "flex",
      gap: 12,
      padding: 12,
      borderRadius: 6,
      border: `1px solid ${T.border}`,
      background: T.surfaceMuted
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 88,
      height: 64,
      borderRadius: 6,
      overflow: "hidden",
      border: `1px solid ${T.border}`,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(PropertyImage, {
    photo: side.photo
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: T.text,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, side.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.textMuted,
      marginTop: 2
    }
  }, side.city, side.neighborhood ? ` · ${side.neighborhood}` : ""), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6,
      fontSize: 13,
      fontWeight: 600,
      color: T.text,
      fontVariantNumeric: "tabular-nums"
    }
  }, formatPrice(side.currentPrice)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(Badge, null, PORTAL_LABEL[side.listings[0].portal])))))))))));
}

// ============================================================
// Root app — handles navigation between screens
// ============================================================

function App() {
  const [route, setRoute] = React.useState({
    screen: "properties"
  });
  const onNavigate = id => setRoute({
    screen: id
  });
  const openProperty = id => setRoute({
    screen: "detail",
    id
  });
  const backToProperties = () => setRoute({
    screen: "properties"
  });
  const current = route.screen === "detail" ? "properties" : route.screen;
  return /*#__PURE__*/React.createElement(AppShell, {
    current: current,
    onNavigate: onNavigate,
    onNewProperty: () => alert("Form mock — n/a")
  }, route.screen === "dashboard" && /*#__PURE__*/React.createElement(DashboardScreen, {
    onOpenProperty: openProperty
  }), route.screen === "properties" && /*#__PURE__*/React.createElement(PropertiesScreen, {
    onOpenProperty: openProperty
  }), route.screen === "detail" && /*#__PURE__*/React.createElement(PropertyDetailScreen, {
    propertyId: route.id,
    onBack: backToProperties
  }), route.screen === "matches" && /*#__PURE__*/React.createElement(MatchesScreen, null), route.screen === "activity" && /*#__PURE__*/React.createElement(ActivityScreen, null), route.screen === "searches" && /*#__PURE__*/React.createElement("div", null));
}
window.App = App;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/web/screens.jsx", error: String((e && e.message) || e) }); }

// uploads/mobile-android-inmuebles.tsx
try { (() => {
/**
 * Mockup: Mobile Android — Inmuebles (lista)
 * Viewport: 393 × 852 (Pixel 7 equivalent)
 * Standalone React + lucide-react. Inline styles + tokens hex.
 *
 * Decisión: rail vertical fijo de 64px a la izquierda (paridad mental con web),
 * solo iconos, label opcional muy sutil. Bottom tabs descartados por
 * contradecir la preferencia explícita del usuario.
 * Status bar estilo Android: simétrica, sin notch, iconos a la derecha.
 */

// ---- Tokens ------------------------------------------------------------------
const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  textInverse: "#FAFAF7",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  accent: "#C49A4D",
  successFg: "#2D6A4F",
  successBg: "#E8F1EC",
  warningFg: "#A86A17",
  warningBg: "#F7EFDE",
  dangerFg: "#A23E3E",
  dangerBg: "#F6E5E5"
};
const FONT = "Inter, system-ui, -apple-system, Roboto, 'Segoe UI', sans-serif";
const TABULAR = {
  fontVariantNumeric: "tabular-nums"
};

// ---- Mock data ---------------------------------------------------------------

const properties = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  area: "La Manjoya · Oviedo",
  price: 195000,
  rooms: 3,
  baths: 2,
  sqm: 95,
  status: "En venta",
  dup: 1,
  photo: "linear-gradient(135deg, #8aa9d0 0%, #3A5F8A 100%)"
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  area: "Cabueñes · Gijón",
  price: 385000,
  rooms: 4,
  baths: 3,
  sqm: 180,
  status: "En venta",
  dup: 0,
  photo: "linear-gradient(135deg, #b0c485 0%, #5c7544 100%)"
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  area: "Centro · Avilés",
  price: 165000,
  rooms: 2,
  baths: 1,
  sqm: 72,
  status: "Reservado",
  dup: 0,
  photo: "linear-gradient(135deg, #d6b07a 0%, #C49A4D 100%)"
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  area: "San Lorenzo · Gijón",
  price: 89000,
  rooms: 0,
  baths: 1,
  sqm: 35,
  status: "En venta",
  dup: 3,
  photo: "linear-gradient(135deg, #92c2cc 0%, #2C7A8A 100%)"
}];
const fmtEur = n => `${n.toLocaleString("es-ES")} €`;
const statusStyle = s => {
  switch (s) {
    case "En venta":
      return {
        color: T.primary,
        background: T.primarySoft
      };
    case "Reservado":
      return {
        color: T.warningFg,
        background: T.warningBg
      };
    case "Vendido":
      return {
        color: T.textSubtle,
        background: T.surfaceSunken
      };
    case "Retirado":
      return {
        color: T.dangerFg,
        background: T.dangerBg
      };
  }
};

// ---- Rail navigation ---------------------------------------------------------

const railItems = [{
  label: "Inmuebles",
  icon: Building2,
  active: true
}, {
  label: "Buscar",
  icon: Search
}, {
  label: "Duplic.",
  icon: Sparkles,
  badge: 4
}, {
  label: "Panel",
  icon: LayoutDashboard
}, {
  label: "Activ.",
  icon: Activity
}, {
  label: "Importar",
  icon: Download
}];

// ---- Brand mark --------------------------------------------------------------
function BrandKey({
  size = 18,
  color = T.primary
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "12",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11.5 12 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 V15"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 12 V14"
  }));
}

// =============================================================================
function MobileAndroidInmuebles() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 393,
      height: 852,
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.5,
      color: T.text,
      background: T.bg,
      position: "relative",
      overflow: "hidden",
      borderRadius: 28,
      boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 28,
      background: T.bg,
      padding: "0 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      fontSize: 12,
      fontWeight: 500,
      color: T.text,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: TABULAR
  }, "9:41"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement(Signal, {
    size: 12,
    color: T.text
  }), /*#__PURE__*/React.createElement(Wifi, {
    size: 12,
    color: T.text
  }), /*#__PURE__*/React.createElement(Battery, {
    size: 14,
    color: T.text
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 64,
      flexShrink: 0,
      background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "8px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 10,
      background: T.primarySoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      boxShadow: `inset 0 0 0 1px ${T.primary}25`
    }
  }, /*#__PURE__*/React.createElement(BrandKey, {
    size: 18,
    color: T.primary
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      width: "100%"
    }
  }, railItems.map(it => {
    const Icon = it.icon;
    return /*#__PURE__*/React.createElement("a", {
      key: it.label,
      href: "#",
      "aria-label": it.label,
      title: it.label,
      style: {
        width: 44,
        height: 44,
        borderRadius: 12,
        textDecoration: "none",
        background: it.active ? T.primarySoft : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 22,
      color: it.active ? T.primary : T.textMuted
    }), it.badge !== undefined && it.badge > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: 4,
        right: 4,
        minWidth: 14,
        height: 14,
        padding: "0 4px",
        borderRadius: 999,
        background: T.accent,
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: "14px",
        boxShadow: `0 0 0 2px ${it.active ? T.primarySoft : T.surface}`,
        ...TABULAR
      }
    }, it.badge));
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    "aria-label": "Cuenta",
    title: "Cuenta",
    style: {
      width: 44,
      height: 44,
      borderRadius: 999,
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.primarySoft
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: T.primary,
      fontSize: 12,
      fontWeight: 600
    }
  }, "BE"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "16px 16px 12px",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: -0.2
    }
  }, "Inmuebles"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2,
      fontSize: 11,
      color: T.textMuted,
      ...TABULAR
    }
  }, "23 fichas \xB7 4 duplicados")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: iconBtn()
  }, /*#__PURE__*/React.createElement(Bell, {
    size: 16,
    color: T.textMuted
  })), /*#__PURE__*/React.createElement("button", {
    style: iconBtn()
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 16,
    color: T.textMuted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 16px 12px",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 36,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      borderRadius: 10,
      background: T.surfaceMuted,
      border: `1px solid ${T.border}`,
      color: T.textSubtle,
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement(Search, {
    size: 13
  }), "T\xEDtulo, ciudad, ref. catastral\u2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      padding: "0 16px 16px",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, properties.map(p => /*#__PURE__*/React.createElement(PropertyCardMobile, {
    key: p.id,
    p: p
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "8px 0",
      color: T.textSubtle,
      fontSize: 11
    }
  }, "4 de 23 fichas")))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 18,
      background: T.bg,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 120,
      height: 3,
      borderRadius: 2,
      background: T.borderStrong
    }
  })));
}

// ---- Pieces ------------------------------------------------------------------
function iconBtn() {
  return {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: `1px solid ${T.border}`,
    background: T.surface,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer"
  };
}
function PropertyCardMobile({
  p
}) {
  const pricePerSqm = p.sqm > 0 ? Math.round(p.price / p.sqm) : null;
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(20, 20, 18, 0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "16 / 10",
      background: p.photo,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      padding: "3px 7px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 500,
      ...statusStyle(p.status)
    }
  }, p.status), p.dup > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      right: 8,
      padding: "3px 7px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 500,
      color: T.primary,
      background: T.primaryFg,
      display: "flex",
      alignItems: "center",
      gap: 4,
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
    }
  }, /*#__PURE__*/React.createElement(Layers, {
    size: 10
  }), " ", p.dup), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      bottom: 8,
      left: 8,
      padding: "2px 7px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
      color: "#fff",
      background: "rgba(0,0,0,0.55)"
    }
  }, p.type)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 500,
      lineHeight: 1.35,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textMuted
    }
  }, p.area), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, fmtEur(p.price)), pricePerSqm && /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 10,
      color: T.textSubtle
    }
  }, "\xB7 ", pricePerSqm.toLocaleString("es-ES"), " \u20AC/m\xB2")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginTop: 4,
      paddingTop: 8,
      borderTop: `1px solid ${T.border}`,
      fontSize: 11,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(BedDouble, {
    size: 12,
    color: T.textSubtle
  }), " ", p.rooms), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 12,
    color: T.textSubtle
  }), " ", p.baths), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 12,
    color: T.textSubtle
  }), " ", p.sqm, " m\xB2"))));
}
Object.assign(__ds_scope, { MobileAndroidInmuebles });
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/mobile-android-inmuebles.tsx", error: String((e && e.message) || e) }); }

// uploads/mobile-ios-inmuebles.tsx
try { (() => {
/**
 * Mockup: Mobile iOS — Inmuebles (lista)
 * Viewport: 393 × 852 (iPhone 14/15 equivalent)
 * Standalone React + lucide-react. Inline styles + tokens hex.
 *
 * Decisión: mismo rail vertical de 64px que Android (paridad cross-platform).
 * Chrome iOS: Dynamic Island arriba, indicador home abajo, status bar con hora
 * a la izquierda y signal/wifi/battery a la derecha.
 * Sutilezas iOS: shadows un poco más suaves, transitorios de elevación,
 * separadores hairline.
 */

// ---- Tokens ------------------------------------------------------------------
const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  textInverse: "#FAFAF7",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  accent: "#C49A4D",
  successFg: "#2D6A4F",
  successBg: "#E8F1EC",
  warningFg: "#A86A17",
  warningBg: "#F7EFDE",
  dangerFg: "#A23E3E",
  dangerBg: "#F6E5E5"
};
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
const TABULAR = {
  fontVariantNumeric: "tabular-nums"
};

// ---- Mock data ---------------------------------------------------------------

const properties = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  area: "La Manjoya · Oviedo",
  price: 195000,
  rooms: 3,
  baths: 2,
  sqm: 95,
  status: "En venta",
  dup: 1,
  photo: "linear-gradient(135deg, #8aa9d0 0%, #3A5F8A 100%)"
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  area: "Cabueñes · Gijón",
  price: 385000,
  rooms: 4,
  baths: 3,
  sqm: 180,
  status: "En venta",
  dup: 0,
  photo: "linear-gradient(135deg, #b0c485 0%, #5c7544 100%)"
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  area: "Centro · Avilés",
  price: 165000,
  rooms: 2,
  baths: 1,
  sqm: 72,
  status: "Reservado",
  dup: 0,
  photo: "linear-gradient(135deg, #d6b07a 0%, #C49A4D 100%)"
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  area: "San Lorenzo · Gijón",
  price: 89000,
  rooms: 0,
  baths: 1,
  sqm: 35,
  status: "En venta",
  dup: 3,
  photo: "linear-gradient(135deg, #92c2cc 0%, #2C7A8A 100%)"
}];
const fmtEur = n => `${n.toLocaleString("es-ES")} €`;
const statusStyle = s => {
  switch (s) {
    case "En venta":
      return {
        color: T.primary,
        background: T.primarySoft
      };
    case "Reservado":
      return {
        color: T.warningFg,
        background: T.warningBg
      };
    case "Vendido":
      return {
        color: T.textSubtle,
        background: T.surfaceSunken
      };
    case "Retirado":
      return {
        color: T.dangerFg,
        background: T.dangerBg
      };
  }
};

// ---- Rail navigation ---------------------------------------------------------

const railItems = [{
  label: "Inmuebles",
  icon: Building2,
  active: true
}, {
  label: "Buscar",
  icon: Search
}, {
  label: "Duplic.",
  icon: Sparkles,
  badge: 4
}, {
  label: "Panel",
  icon: LayoutDashboard
}, {
  label: "Activ.",
  icon: Activity
}, {
  label: "Importar",
  icon: Download
}];

// ---- Brand mark --------------------------------------------------------------
function BrandKey({
  size = 18,
  color = T.primary
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "12",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11.5 12 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 V15"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 12 V14"
  }));
}

// =============================================================================
function MobileIosInmuebles() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 393,
      height: 852,
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.5,
      color: T.text,
      background: T.bg,
      position: "relative",
      overflow: "hidden",
      borderRadius: 44,
      boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 54,
      background: T.bg,
      padding: "0 24px",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      paddingBottom: 8,
      flexShrink: 0,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 14,
      fontWeight: 600,
      color: T.text
    }
  }, "9:41"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: "absolute",
      top: 11,
      left: "50%",
      transform: "translateX(-50%)",
      width: 120,
      height: 34,
      borderRadius: 999,
      background: "#000"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 5,
      color: T.text
    }
  }, /*#__PURE__*/React.createElement(Signal, {
    size: 14,
    strokeWidth: 2.5,
    color: T.text
  }), /*#__PURE__*/React.createElement(Wifi, {
    size: 14,
    strokeWidth: 2.5,
    color: T.text
  }), /*#__PURE__*/React.createElement(BatteryFull, {
    size: 18,
    strokeWidth: 2,
    color: T.text
  }))), /*#__PURE__*/React.createElement("header", {
    style: {
      padding: "8px 20px 12px",
      background: T.bg,
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 28,
      fontWeight: 700,
      letterSpacing: -0.6,
      lineHeight: 1.1
    }
  }, "Inmuebles"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 12,
      color: T.textMuted,
      ...TABULAR
    }
  }, "23 fichas \xB7 4 duplicados pendientes")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: iconBtn()
  }, /*#__PURE__*/React.createElement(Bell, {
    size: 16,
    color: T.primary,
    strokeWidth: 2
  })), /*#__PURE__*/React.createElement("button", {
    style: iconBtn()
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 17,
    color: T.primary,
    strokeWidth: 2.2
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 20px 10px",
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 36,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      borderRadius: 10,
      background: T.surfaceSunken,
      color: T.textSubtle,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14,
    strokeWidth: 2.2
  }), "T\xEDtulo, ciudad, ref. catastral\u2026")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      minHeight: 0,
      borderTop: `0.5px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 64,
      flexShrink: 0,
      background: T.surface,
      borderRight: `0.5px solid ${T.border}`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "10px 0"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 12,
      background: T.primarySoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
      boxShadow: `inset 0 0 0 0.5px ${T.primary}30`
    }
  }, /*#__PURE__*/React.createElement(BrandKey, {
    size: 18,
    color: T.primary
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 4,
      width: "100%"
    }
  }, railItems.map(it => {
    const Icon = it.icon;
    return /*#__PURE__*/React.createElement("a", {
      key: it.label,
      href: "#",
      style: {
        width: 52,
        padding: "8px 0 6px",
        borderRadius: 12,
        textDecoration: "none",
        textAlign: "center",
        background: it.active ? T.primarySoft : "transparent",
        position: "relative"
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 20,
      color: it.active ? T.primary : T.textMuted
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        marginTop: 3,
        letterSpacing: 0.1,
        color: it.active ? T.primary : T.textSubtle,
        fontWeight: it.active ? 600 : 400
      }
    }, it.label), it.badge !== undefined && it.badge > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        position: "absolute",
        top: 4,
        right: 6,
        minWidth: 14,
        height: 14,
        padding: "0 4px",
        borderRadius: 999,
        background: T.accent,
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        lineHeight: "14px",
        ...TABULAR
      }
    }, it.badge));
  })), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      width: 52,
      padding: "8px 0 6px",
      borderRadius: 12,
      textDecoration: "none",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 24,
      height: 24,
      borderRadius: 999,
      background: T.primarySoft,
      color: T.primary,
      fontSize: 10,
      fontWeight: 600,
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "BE"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 9,
      marginTop: 3,
      color: T.textSubtle
    }
  }, "Cuenta"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      padding: "12px 16px 16px",
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: 12
    }
  }, properties.map(p => /*#__PURE__*/React.createElement(PropertyCardMobile, {
    key: p.id,
    p: p
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center",
      padding: "8px 0",
      color: T.textSubtle,
      fontSize: 11
    }
  }, "4 de 23 fichas"))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 28,
      background: T.bg,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 134,
      height: 5,
      borderRadius: 999,
      background: T.text
    }
  })));
}

// ---- Pieces ------------------------------------------------------------------
function iconBtn() {
  return {
    width: 34,
    height: 34,
    borderRadius: 999,
    border: "none",
    background: T.surface,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(20,20,18,0.06)"
  };
}
function PropertyCardMobile({
  p
}) {
  const pricePerSqm = p.sqm > 0 ? Math.round(p.price / p.sqm) : null;
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: T.surface,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 1px 3px rgba(20, 20, 18, 0.06), 0 1px 2px rgba(20, 20, 18, 0.04)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      aspectRatio: "16 / 10",
      background: p.photo,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      left: 8,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      ...statusStyle(p.status)
    }
  }, p.status), p.dup > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 8,
      right: 8,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 600,
      color: T.primary,
      background: T.primaryFg,
      display: "flex",
      alignItems: "center",
      gap: 4,
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
    }
  }, /*#__PURE__*/React.createElement(Layers, {
    size: 10
  }), " ", p.dup), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      bottom: 8,
      left: 8,
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 500,
      color: "#fff",
      background: "rgba(0,0,0,0.55)"
    }
  }, p.type)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 13,
      fontWeight: 600,
      lineHeight: 1.35,
      letterSpacing: -0.1,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textMuted
    }
  }, p.area), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: -0.3
    }
  }, fmtEur(p.price)), pricePerSqm && /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 10,
      color: T.textSubtle
    }
  }, "\xB7 ", pricePerSqm.toLocaleString("es-ES"), " \u20AC/m\xB2")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 12,
      marginTop: 4,
      paddingTop: 8,
      borderTop: `0.5px solid ${T.border}`,
      fontSize: 11,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(BedDouble, {
    size: 12,
    color: T.textSubtle
  }), " ", p.rooms), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 12,
    color: T.textSubtle
  }), " ", p.baths), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 3,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 12,
    color: T.textSubtle
  }), " ", p.sqm, " m\xB2"))));
}
Object.assign(__ds_scope, { MobileIosInmuebles });
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/mobile-ios-inmuebles.tsx", error: String((e && e.message) || e) }); }

// uploads/web-inmuebles.tsx
try { (() => {
/**
 * Mockup: Web — Inmuebles (lista)
 * Viewport: 1440 × 900
 * Standalone React + lucide-react. Sin Tailwind: usa inline styles + tokens hex
 * directos para que renderice en Artifacts de claude.ai o cualquier preview.
 *
 * Identidad: "latón envejecido sobre acero" — primary #3A5F8A, accent #C49A4D.
 * Sidebar de 240px con grupos colapsables (Catálogo / Análisis / Captura / Cuenta).
 * Contenido: header (título + contador + search + CTA) + grid de 3 columnas.
 */
const {
  useState
} = React;
// ---- Design tokens (from docs/design/tokens.json) ----------------------------
const T = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F3EE",
  surfaceSunken: "#EFEEE8",
  border: "#E8E6E1",
  borderStrong: "#D4D1CA",
  text: "#1A1A18",
  textMuted: "#6B6862",
  textSubtle: "#9A9690",
  textInverse: "#FAFAF7",
  primary: "#3A5F8A",
  primaryHover: "#2E4D70",
  primarySoft: "#EAEFF6",
  primaryFg: "#FAFAF7",
  accent: "#C49A4D",
  successFg: "#2D6A4F",
  successBg: "#E8F1EC",
  warningFg: "#A86A17",
  warningBg: "#F7EFDE",
  dangerFg: "#A23E3E",
  dangerBg: "#F6E5E5",
  infoFg: "#2C7A8A",
  infoBg: "#E1EEF1"
};
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const TABULAR = {
  fontVariantNumeric: "tabular-nums"
};

// ---- Mock data ---------------------------------------------------------------

const properties = [{
  id: 1,
  title: "Piso luminoso en La Manjoya con vistas",
  type: "Piso",
  area: "La Manjoya · Oviedo",
  price: 195000,
  rooms: 3,
  baths: 2,
  sqm: 95,
  status: "En venta",
  dup: 1,
  photo: "linear-gradient(135deg, #8aa9d0 0%, #3A5F8A 100%)"
}, {
  id: 2,
  title: "Chalet pareado con jardín y garaje",
  type: "Chalet",
  area: "Cabueñes · Gijón",
  price: 385000,
  rooms: 4,
  baths: 3,
  sqm: 180,
  status: "En venta",
  dup: 0,
  photo: "linear-gradient(135deg, #b0c485 0%, #5c7544 100%)"
}, {
  id: 3,
  title: "Ático con terraza en el centro",
  type: "Ático",
  area: "Centro · Avilés",
  price: 165000,
  rooms: 2,
  baths: 1,
  sqm: 72,
  status: "Reservado",
  dup: 0,
  photo: "linear-gradient(135deg, #d6b07a 0%, #C49A4D 100%)"
}, {
  id: 4,
  title: "Estudio reformado cerca de la playa",
  type: "Estudio",
  area: "San Lorenzo · Gijón",
  price: 89000,
  rooms: 0,
  baths: 1,
  sqm: 35,
  status: "En venta",
  dup: 3,
  photo: "linear-gradient(135deg, #92c2cc 0%, #2C7A8A 100%)"
}];
const fmtEur = n => `${n.toLocaleString("es-ES")} €`;

// ---- Status badge palette ----------------------------------------------------
const statusStyle = s => {
  switch (s) {
    case "En venta":
      return {
        color: T.primary,
        background: T.primarySoft
      };
    case "Reservado":
      return {
        color: T.warningFg,
        background: T.warningBg
      };
    case "Vendido":
      return {
        color: T.textSubtle,
        background: T.surfaceSunken
      };
    case "Retirado":
      return {
        color: T.dangerFg,
        background: T.dangerBg
      };
  }
};

// ---- Navigation model --------------------------------------------------------

const navGroups = [{
  label: "Catálogo",
  items: [{
    label: "Inmuebles",
    icon: Building2,
    active: true,
    badge: 23
  }, {
    label: "Buscar",
    icon: Search
  }, {
    label: "Duplicados",
    icon: Sparkles,
    badge: 4
  }]
}, {
  label: "Análisis",
  items: [{
    label: "Dashboard",
    icon: LayoutDashboard
  }, {
    label: "Actividad",
    icon: Activity
  }]
}, {
  label: "Captura",
  items: [{
    label: "Importar",
    icon: Download
  }]
}, {
  label: "Cuenta",
  items: [{
    label: "Perfil",
    icon: User
  }, {
    label: "Ajustes",
    icon: Settings
  }]
}];

// ---- Brand mark (medieval key, simplified inline SVG) ------------------------
function BrandKey({
  size = 20,
  color = T.primary
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: color,
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "12",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11.5 12 H21"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M17 12 V15"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M20 12 V14"
  }));
}

// =============================================================================
function WebInmuebles() {
  const [openGroups, setOpenGroups] = useState({
    Catálogo: true,
    Análisis: true,
    Captura: true,
    Cuenta: true
  });
  const toggle = g => setOpenGroups(s => ({
    ...s,
    [g]: !s[g]
  }));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1440,
      height: 900,
      fontFamily: FONT,
      fontSize: 13,
      lineHeight: 1.5,
      color: T.text,
      background: T.bg,
      display: "flex",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      width: 240,
      flexShrink: 0,
      background: T.surface,
      borderRight: `1px solid ${T.border}`,
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      padding: "0 16px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      borderBottom: `1px solid ${T.border}`
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 32,
      height: 32,
      borderRadius: 6,
      background: T.primarySoft,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: `inset 0 0 0 1px ${T.primary}25`
    }
  }, /*#__PURE__*/React.createElement(BrandKey, {
    size: 18,
    color: T.primary
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.15
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600
    }
  }, "BuySell"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textSubtle
    }
  }, "Asturias"))), /*#__PURE__*/React.createElement("nav", {
    style: {
      flex: 1,
      padding: "10px 8px",
      overflowY: "auto"
    }
  }, navGroups.map(g => /*#__PURE__*/React.createElement("div", {
    key: g.label,
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => toggle(g.label),
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      width: "100%",
      padding: "4px 8px",
      border: "none",
      background: "transparent",
      color: T.textMuted,
      fontFamily: FONT,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      cursor: "pointer"
    }
  }, openGroups[g.label] ? /*#__PURE__*/React.createElement(ChevronDown, {
    size: 12,
    color: T.textSubtle
  }) : /*#__PURE__*/React.createElement(ChevronRight, {
    size: 12,
    color: T.textSubtle
  }), g.label), openGroups[g.label] && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 2
    }
  }, g.items.map(it => {
    const Icon = it.icon;
    return /*#__PURE__*/React.createElement("a", {
      key: it.label,
      href: "#",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 6,
        marginBottom: 1,
        textDecoration: "none",
        fontSize: 13,
        color: it.active ? T.primary : T.textMuted,
        background: it.active ? T.primarySoft : "transparent",
        fontWeight: it.active ? 500 : 400
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      size: 15,
      color: it.active ? T.primary : T.textSubtle
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, it.label), it.badge !== undefined && it.badge > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        ...TABULAR,
        fontSize: 11,
        padding: "1px 6px",
        borderRadius: 999,
        background: it.active ? T.primary : T.surfaceMuted,
        color: it.active ? T.primaryFg : T.textMuted
      }
    }, it.badge));
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      borderTop: `1px solid ${T.border}`,
      padding: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 8px",
      borderRadius: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 28,
      height: 28,
      borderRadius: 999,
      background: T.primarySoft,
      color: T.primary,
      fontSize: 11,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, "BE"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      lineHeight: 1.2
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 500,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, "Belquivir@proton.me"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: T.textSubtle
    }
  }, "Cuenta personal")), /*#__PURE__*/React.createElement(LogOut, {
    size: 14,
    color: T.textSubtle
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      height: 56,
      display: "flex",
      alignItems: "center",
      gap: 16,
      padding: "0 24px",
      borderBottom: `1px solid ${T.border}`,
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      maxWidth: 480,
      height: 34,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "0 12px",
      border: `1px solid ${T.border}`,
      background: T.surfaceMuted,
      borderRadius: 8,
      color: T.textSubtle,
      fontSize: 13
    }
  }, /*#__PURE__*/React.createElement(Search, {
    size: 14
  }), "Buscar por t\xEDtulo, ciudad, barrio, ref. catastral\u2026", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: "auto",
      fontSize: 11,
      color: T.textSubtle,
      padding: "1px 5px",
      border: `1px solid ${T.border}`,
      borderRadius: 4,
      background: T.surface
    }
  }, "\u2318 K")), /*#__PURE__*/React.createElement("button", {
    style: {
      height: 36,
      padding: "0 14px",
      borderRadius: 8,
      border: "none",
      background: T.primary,
      color: T.primaryFg,
      fontFamily: FONT,
      fontSize: 13,
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      gap: 6,
      cursor: "pointer",
      boxShadow: `0 1px 2px ${T.primary}25`
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 14
  }), " Nuevo inmueble")), /*#__PURE__*/React.createElement("main", {
    style: {
      flex: 1,
      padding: "24px 32px",
      overflowY: "auto"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: -0.2
    }
  }, "Inmuebles"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "3px 9px 3px 7px",
      borderRadius: 999,
      background: T.accent + "1F",
      color: T.warningFg,
      border: `1px solid ${T.accent}55`,
      fontSize: 12,
      fontWeight: 500,
      textDecoration: "none",
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Sparkles, {
    size: 12,
    color: T.warningFg
  }), "4 duplicados pendientes \u2192")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 13,
      color: T.textMuted,
      ...TABULAR
    }
  }, "23 fichas \xB7 47 anuncios vinculados")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: toolbarBtn()
  }, /*#__PURE__*/React.createElement(Filter, {
    size: 13,
    color: T.textMuted
  }), " Filtros", /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 4,
      padding: "1px 5px",
      borderRadius: 999,
      fontSize: 10,
      background: T.primarySoft,
      color: T.primary,
      fontWeight: 500
    }
  }, "3")), /*#__PURE__*/React.createElement("button", {
    style: toolbarBtn()
  }, /*#__PURE__*/React.createElement(ArrowUpDown, {
    size: 13,
    color: T.textMuted
  }), " Recientes", /*#__PURE__*/React.createElement(ChevronDown, {
    size: 12,
    color: T.textSubtle
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      overflow: "hidden",
      background: T.surface
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: viewBtn(true)
  }, "Cuadr\xEDcula"), /*#__PURE__*/React.createElement("button", {
    style: viewBtn(false)
  }, "Tabla")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 20
    }
  }, properties.map(p => /*#__PURE__*/React.createElement(PropertyCard, {
    key: p.id,
    p: p
  })), /*#__PURE__*/React.createElement(AddCard, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24,
      textAlign: "center",
      color: T.textSubtle,
      fontSize: 12
    }
  }, "Mostrando 4 de 23 \xB7", /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      color: T.primary,
      marginLeft: 4
    }
  }, "Ver todas \u2192")))));
}

// ---- Bits --------------------------------------------------------------------
function toolbarBtn() {
  return {
    height: 32,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: T.surface,
    color: T.text,
    fontFamily: FONT,
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer"
  };
}
function viewBtn(active) {
  return {
    height: 32,
    padding: "0 12px",
    border: "none",
    background: active ? T.primarySoft : T.surface,
    color: active ? T.primary : T.textMuted,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: active ? 500 : 400,
    cursor: "pointer"
  };
}
function PropertyCard({
  p
}) {
  const pricePerSqm = p.sqm > 0 ? Math.round(p.price / p.sqm) : null;
  return /*#__PURE__*/React.createElement("article", {
    style: {
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(20, 20, 18, 0.04)",
      display: "flex",
      flexDirection: "column"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: 168,
      background: p.photo,
      position: "relative"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 10,
      left: 10,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      ...statusStyle(p.status)
    }
  }, p.status), p.dup > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 10,
      right: 10,
      padding: "3px 8px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 500,
      color: T.primary,
      background: T.primaryFg,
      display: "flex",
      alignItems: "center",
      gap: 4,
      boxShadow: "0 1px 2px rgba(0,0,0,0.08)"
    }
  }, /*#__PURE__*/React.createElement(Layers, {
    size: 11
  }), " ", p.dup, " duplicado", p.dup > 1 ? "s" : ""), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      bottom: 10,
      left: 10,
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      color: "#fff",
      background: "rgba(0,0,0,0.55)"
    }
  }, p.type)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "14px 14px 12px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      margin: 0,
      fontSize: 14,
      fontWeight: 500,
      lineHeight: 1.35,
      color: T.text,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden"
    }
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: T.textMuted
    }
  }, p.area), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: 6,
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 20,
      fontWeight: 600,
      color: T.text,
      letterSpacing: -0.3
    }
  }, fmtEur(p.price)), pricePerSqm && /*#__PURE__*/React.createElement("span", {
    style: {
      ...TABULAR,
      fontSize: 11,
      color: T.textSubtle
    }
  }, "\xB7 ", pricePerSqm.toLocaleString("es-ES"), " \u20AC/m\xB2")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 14,
      marginTop: 4,
      paddingTop: 10,
      borderTop: `1px solid ${T.border}`,
      fontSize: 12,
      color: T.textMuted
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(BedDouble, {
    size: 13,
    color: T.textSubtle
  }), " ", p.rooms), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Bath, {
    size: 13,
    color: T.textSubtle
  }), " ", p.baths), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 4,
      ...TABULAR
    }
  }, /*#__PURE__*/React.createElement(Maximize2, {
    size: 13,
    color: T.textSubtle
  }), " ", p.sqm, " m\xB2"))));
}
function AddCard() {
  return /*#__PURE__*/React.createElement("button", {
    style: {
      background: "transparent",
      border: `1px dashed ${T.borderStrong}`,
      borderRadius: 12,
      padding: 20,
      color: T.textMuted,
      fontFamily: FONT,
      fontSize: 13,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minHeight: 320,
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 40,
      height: 40,
      borderRadius: 999,
      background: T.surfaceMuted,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }
  }, /*#__PURE__*/React.createElement(Plus, {
    size: 20,
    color: T.textMuted
  })), "A\xF1adir inmueble", /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: T.textSubtle
    }
  }, "o usa el bookmarklet desde un portal"));
}
Object.assign(__ds_scope, { WebInmuebles });
})(); } catch (e) { __ds_ns.__errors.push({ path: "uploads/web-inmuebles.tsx", error: String((e && e.message) || e) }); }

__ds_ns.IconHorreo = __ds_scope.IconHorreo;

__ds_ns.IconHouseMark = __ds_scope.IconHouseMark;

__ds_ns.IconPicos = __ds_scope.IconPicos;

__ds_ns.IconChevron = __ds_scope.IconChevron;

__ds_ns.IconTag = __ds_scope.IconTag;

__ds_ns.IconKey = __ds_scope.IconKey;

__ds_ns.IconPin = __ds_scope.IconPin;

__ds_ns.IconPortfolio = __ds_scope.IconPortfolio;

__ds_ns.IconExchange = __ds_scope.IconExchange;

__ds_ns.IconFoco = __ds_scope.IconFoco;

__ds_ns.IconAscenso = __ds_scope.IconAscenso;

__ds_ns.IconPliegue = __ds_scope.IconPliegue;

__ds_ns.IconPortico = __ds_scope.IconPortico;

__ds_ns.IconCruce = __ds_scope.IconCruce;

__ds_ns.BRAND_ICONS = __ds_scope.BRAND_ICONS;

__ds_ns.InmueblesAndroidScreen = __ds_scope.InmueblesAndroidScreen;

__ds_ns.InmueblesIOSScreen = __ds_scope.InmueblesIOSScreen;

__ds_ns.Sidebar = __ds_scope.Sidebar;

__ds_ns.InmueblesPage = __ds_scope.InmueblesPage;

__ds_ns.MobileAndroidInmuebles = __ds_scope.MobileAndroidInmuebles;

__ds_ns.MobileIosInmuebles = __ds_scope.MobileIosInmuebles;

__ds_ns.WebInmuebles = __ds_scope.WebInmuebles;

})();
