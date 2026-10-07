import React from 'react'

export default function FileUploader({ label, accept, onFileSelect }) {
  return (
    <div className="flex flex-col gap-2 mb-3">
      <label className="font-medium">{label}</label>
      <input type="file" accept={accept} onChange={e => onFileSelect(e.target.files[0])} />
    </div>
  )
}
