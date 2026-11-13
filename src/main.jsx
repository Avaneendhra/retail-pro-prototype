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
import Dashboard from "./components/dashboard/Dashboard";
import Inventory from "./components/inventory/Inventory";
import AddStock from "./components/inventory/AddStock";
import SupplierInvoice from "./components/invoice/SupplierInvoice";
import PurchaseOrders from "./components/orders/PurchaseOrders";

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
