import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import "./index.css";
import "react-datepicker/dist/react-datepicker.css";
import { CartProvider } from "./context/CartContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";

import './i18n'; // <-- Your i18n config

// --- Import All Components ---
// Layouts & Root
import App from "./App";
import MainLayout from './components/layout/MainLayout';
import AuthLayout from './components/layout/AuthLayout';
import PrivateRoute from "./PrivateRoute";
// Auth Pages
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import OAuth2RedirectHandler from './components/auth/OAuth2RedirectHandler';
// App Pages
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import ProductList from './components/products/ProductList';
import BillList from './components/bills/BillList';
import BillForm from './components/bills/BillForm';
import CustomerList from './components/customers/CustomerList';
import CustomerHistory from './components/customers/CustomerHistory';
import ProfilePage from "./components/profile/ProfilePage";
import CheckoutPage from "./components/checkout/CheckoutPage";
import ReportGenerator from "./components/reports/summary/ReportGenerator";
import SalesReportText from './components/reports/text/SalesReportText'; // <-- Was missing this import

// --- Define Router Structure ---
const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      // 1. Auth Routes
      {
        element: <AuthLayout />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/signup", element: <Signup /> },
          { path: "/login/success", element: <OAuth2RedirectHandler /> },
        ]
      },
      // 2. Protected App Routes
      {
        element: (
          <PrivateRoute roles={[]}> {/* This wrapper remains */}
            <MainLayout />
          </PrivateRoute>
        ),
        children: [
          { path: "/", element: <Navigate to="/dashboard" replace /> },
          { path: "/dashboard", element: <AnalyticsDashboard /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/checkout", element: <CheckoutPage /> },

          // --- ALL PrivateRoute WRAPPERS RESTORED ---
          { path: "/products", element: <PrivateRoute roles={['OWNER', 'MANAGER']}><ProductList /></PrivateRoute> },
          { path: "/bills", element: <PrivateRoute roles={['MANAGER', 'OWNER']}><BillList /></PrivateRoute> },
          { path: "/bills/new", element: <PrivateRoute roles={['MANAGER', 'OWNER']}><BillForm /></PrivateRoute> },
          { path: "/customers", element: <PrivateRoute roles={['OWNER', 'MANAGER', 'CASHIER']}><CustomerList /></PrivateRoute> },
          { path: "/customers/:id/history", element: <PrivateRoute roles={['OWNER', 'MANAGER', 'CASHIER']}><CustomerHistory /></PrivateRoute> },

          // Report Routes
          { path: "/reports", element: <Navigate to="/reports/summary" replace /> },
          { path: "/reports/text", element: <PrivateRoute roles={['OWNER']}><SalesReportText /></PrivateRoute> },
          { path: "/reports/summary", element: <PrivateRoute roles={['OWNER', 'MANAGER']}><ReportGenerator /></PrivateRoute> },

          // Fallback
          { path: "*", element: <Navigate to="/dashboard" replace /> }
        ]
      }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <CartProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </CartProvider>
    </ToastProvider>
  </React.StrictMode>
);