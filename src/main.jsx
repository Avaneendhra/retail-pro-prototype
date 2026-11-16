import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider, Navigate } from "react-router-dom";
import "./i18n";
import "./index.css";
import "./styles/pos.css";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { InventoryProvider } from "./context/InventoryContext";

import AppShell from "./components/layout/AppShell";
import Billing from "./components/billing/Billing";
import { Splash } from "./components/layout/StartScreens";

// Home opens at once; the other pages are fetched the first time they are opened.
const lazyPage = (load) => {
  const Page = React.lazy(load);
  return () => <React.Suspense fallback={<Splash />}><Page /></React.Suspense>;
};
const Dashboard = lazyPage(() => import("./components/dashboard/Dashboard"));
const Inventory = lazyPage(() => import("./components/inventory/Inventory"));
const AddStock = lazyPage(() => import("./components/inventory/AddStock"));
const SupplierInvoice = lazyPage(() => import("./components/invoice/SupplierInvoice"));
const PurchaseOrders = lazyPage(() => import("./components/orders/PurchaseOrders"));

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },
      { path: "/home", element: <Billing /> },
      { path: "/billing", element: <Navigate to="/home" replace /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/inventory", element: <Inventory /> },
      { path: "/add-stock", element: <AddStock /> },
      { path: "/invoices", element: <SupplierInvoice /> },
      { path: "/orders", element: <PurchaseOrders /> },
      // old routes
      { path: "/sell", element: <Navigate to="/home" replace /> },
      { path: "/invoice", element: <Navigate to="/invoices" replace /> },
      { path: "*", element: <Navigate to="/home" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <InventoryProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </InventoryProvider>
    </ToastProvider>
  </React.StrictMode>
);
