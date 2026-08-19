// src/components/analytics/TopProductsList.jsx
import React from 'react';
import { motion } from 'framer-motion';

// Staggered animation for the list
const listVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1, 
    transition: { 
      staggerChildren: 0.07 // Each item fades in 70ms after the previous
    } 
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  }
};

export default function TopProductsList({ data }) {
  const products = data.slice(0, 10); // Show top 10
  const maxRevenue = products[0]?.revenue || 1; 

  return (
    <div className="card h-[450px] flex flex-col lg:col-span-12">
      <h3 className="card-title mb-4 flex-shrink-0">Top Products by Revenue</h3>
      <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
        <motion.ul 
          className="space-y-5"
          initial="hidden"
          animate="visible"
          variants={listVariants}
        >
          {products.map((p, index) => (
            <motion.li key={p.productId || index} variants={itemVariants}>
              <div className="flex items-center justify-between mb-1.5 text-sm">
                <span className="font-medium text-white truncate w-3/5">{index + 1}. {p.name}</span>
                <span className="font-semibold text-green-400">
                  {p.revenue.toLocaleString('en-IN', {
                    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              {/* Animated gradient progress bar */}
              <div className="progress-bar-container">
                <motion.div 
                  className="progress-bar"
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.revenue / maxRevenue) * 100}%` }}
                  transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1.0], delay: 0.2 }}
                />
              </div>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </div>
  );
}