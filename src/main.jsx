import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider, Navigate } from "react-router-dom";
import "./i18n";
import "./index.css";
import "./styles/pos.css";
import "./styles/layout.css";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { InventoryProvider } from "./context/InventoryContext";

import AppShell from "./components/layout/AppShell";
import Billing from "./components/billing/Billing";
import { Splash } from "./components/layout/StartScreens";
import { registerSW } from "virtual:pwa-register";
import { fitPhoneScreen } from "./lib/desktopSite";

// A phone browser set to "Desktop site" is asked to use the phone layout anyway.
fitPhoneScreen();

// A new version is installed and shown straight away (the page reloads once),
// and an app left open checks for one every hour.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  },
});

// Home opens at once; the other pages are fetched the first time they are opened.
const lazyPage = (load) => {
  const Page = React.lazy(load);
  return () => <React.Suspense fallback={<Splash />}><Page /></React.Suspense>;
};
const Dashboard = lazyPage(() => import("./components/dashboard/Dashboard"));
const Bills = lazyPage(() => import("./components/bills/Bills"));
const Inventory = lazyPage(() => import("./components/inventory/Inventory"));
const AddStock = lazyPage(() => import("./components/inventory/AddStock"));
const SupplierInvoice = lazyPage(() => import("./components/invoice/SupplierInvoice"));
const PurchaseOrders = lazyPage(() => import("./components/orders/PurchaseOrders"));
const Customers = lazyPage(() => import("./components/customers/Customers"));
const Reports = lazyPage(() => import("./components/reports/Reports"));

function OrderLinkReload() {
  React.useEffect(() => { window.location.reload(); }, []);
  return <Splash />;
}

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },
      { path: "/home", element: <Billing /> },
      { path: "/billing", element: <Navigate to="/home" replace /> },
      { path: "/bills", element: <Bills /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/inventory", element: <Inventory /> },
      { path: "/add-stock", element: <AddStock /> },
      { path: "/invoices", element: <SupplierInvoice /> },
      { path: "/orders", element: <PurchaseOrders /> },
      { path: "/customers", element: <Customers /> },
      { path: "/reports", element: <Reports /> },
      // An order link opened in a tab where the shop app is already running: load it as its own page.
      { path: "/order/*", element: <OrderLinkReload /> },
      // old routes
      { path: "/sell", element: <Navigate to="/home" replace /> },
      { path: "/invoice", element: <Navigate to="/invoices" replace /> },
      { path: "*", element: <Navigate to="/home" replace /> },
    ],
  },
]);

// A customer's order link opens its own small page: no shop data, no sign-in.
const OrderPage = React.lazy(() => import("./components/order/OrderPage"));
const isOrderLink = window.location.hash.startsWith("#/order/");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isOrderLink ? (
      <ThemeProvider>
        <React.Suspense fallback={null}><OrderPage /></React.Suspense>
      </ThemeProvider>
    ) : (
      <ToastProvider>
        <InventoryProvider>
          <ThemeProvider>
            <RouterProvider router={router} />
          </ThemeProvider>
        </InventoryProvider>
      </ToastProvider>
    )}
  </React.StrictMode>
);
