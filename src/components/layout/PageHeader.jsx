import React from 'react';

/** A page's title, an optional one-line description, and its main actions on the right. */
export default function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-head">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}
