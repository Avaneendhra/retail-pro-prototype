import React from "react";
import ReactDOM from "react-dom/client";
import { createHashRouter, RouterProvider, Navigate } from "react-router-dom";
import "./index.css";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { InventoryProvider } from "./context/InventoryContext";

// Layout
import AppShell from "./components/layout/AppShell";

// Pages
import Dashboard from "./components/dashboard/Dashboard";
import Inventory from "./components/inventory/Inventory";
import AddStock from "./components/inventory/AddStock";
import SellProduct from "./components/inventory/SellProduct";
import InvoiceScanner from "./components/inventory/InvoiceScanner";

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/inventory", element: <Inventory /> },
      { path: "/add-stock", element: <AddStock /> },
      { path: "/sell", element: <SellProduct /> },
      { path: "/invoice", element: <InvoiceScanner /> },
      { path: "*", element: <Navigate to="/dashboard" replace /> },
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