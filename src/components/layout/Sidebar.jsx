import React from 'react'
import { Link } from 'react-router-dom'

export default function Sidebar() {
  return (
    <div className="w-64 bg-gray-800 text-white min-h-screen p-4 space-y-3">
      <h2 className="text-xl font-semibold mb-4">Menu</h2>
      <Link to="/dashboard" className="block hover:bg-gray-700 rounded p-2">Dashboard</Link>
      <Link to="/products" className="block hover:bg-gray-700 rounded p-2">Products</Link>
      <Link to="/bills" className="block hover:bg-gray-700 rounded p-2">Bills</Link>
      <Link to="/customers" className="block hover:bg-gray-700 rounded p-2">Customers</Link>
      <Link to="/reports" className="block hover:bg-gray-700 rounded p-2">Reports</Link>
    </div>
  )
}
