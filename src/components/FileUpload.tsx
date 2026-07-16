import { useRef, useState } from 'react';

interface FileUploadProps {
  onFile: (buffer: Uint8Array, filename: string) => void;
}

export function FileUpload({ onFile }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = new Uint8Array(e.target!.result as ArrayBuffer);
      onFile(buffer, file.name);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      className="rounded-xl p-16 text-center cursor-pointer transition-all duration-200"
      style={{
        border: `2px dashed ${isDragging ? 'var(--accent-amber)' : 'var(--border-active)'}`,
        background: isDragging ? 'var(--glow-amber)' : 'var(--bg-surface)',
        boxShadow: isDragging ? '0 0 30px var(--glow-amber)' : 'none',
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Drop your .prst or .hlx file here, or click to browse"
      data-testid="file-upload-zone"
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
    >
      <div className="font-mono-display text-4xl mb-4" style={{ color: 'var(--text-muted)' }}>
        &#x2191;
      </div>
      <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Drop your .prst or .hlx file here, or click to browse</p>
      <p className="text-sm mt-2 font-mono-display" style={{ color: 'var(--text-muted)' }}>.prst / .hlx</p>
      <input
        ref={inputRef}
        type="file"
        accept=".prst,.hlx"
        className="hidden"
        onChange={handleChange}
        data-testid="file-input"
        aria-hidden="true"
      />
    </div>
  );
}
